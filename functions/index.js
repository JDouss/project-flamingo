/**
 * Project Flamingo — serverless AI pipeline (callable, two stages).
 *
 * Stage 1 — transcribeSession({ sessionId }):
 *   Audio (Storage) → Gemini Files API → diarized transcript with ANONYMOUS
 *   [Speaker N] tags + a first snippet per voice + a *suggested* mapping to
 *   club members. Ends in status `needs_mapping`: a human confirms who is
 *   who before any name touches the data.
 *
 * Stage 2 — analyzeSession({ sessionId, mapping }):
 *   Applies the confirmed mapping to the transcript, then runs the
 *   structured analysis (summary, start/end grades per member, session
 *   memory). Extracted grades are validated against the confirmed
 *   participant list so misheard names can never pollute the club stats.
 *   Ends in status `draft` for final review in the SPA.
 *
 * Both are HTTPS callables (not Storage triggers) on purpose:
 *   - 3600s timeout (event triggers cap at 540s — too short for 2h audio)
 *   - they keep running server-side if the browser closes after invoking
 *   - either stage can be re-invoked to retry a stuck/failed session
 *   - no Eventarc/bucket-region coupling at deploy time
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { fetch, Agent, setGlobalDispatcher } from "undici";

// Node's built-in fetch aborts after undici's default 300s headers timeout.
// Transcribing a 2-hour recording (non-streaming) keeps Gemini busy far
// longer than that before the response starts, so we use undici's fetch with
// the header/body timeouts disabled — the function's own 3600s timeout is the
// real ceiling. `connectTimeout` stays finite so genuine network failures
// still surface quickly.
setGlobalDispatcher(new Agent({ headersTimeout: 0, bodyTimeout: 0, connectTimeout: 60_000 }));

initializeApp();

const geminiApiKey = defineSecret("GEMINI_API_KEY");

const GEMINI_MODEL = "gemini-3.5-flash";
const GEMINI_BASE = "https://generativelanguage.googleapis.com";
const SESSIONS_COLLECTION = "transcriptions";
const MEMBERS_COLLECTION = "speakers_registry";

// Keep in sync with firestore.rules / storage.rules.
const ADMIN_EMAILS = ["doussinague95@gmail.com"];

const CALL_OPTS = {
  region: "europe-west1",
  memory: "1GiB",
  timeoutSeconds: 3600,
  secrets: [geminiApiKey],
};

const MIME_BY_EXT = {
  mp3: "audio/mp3",
  wav: "audio/wav",
  flac: "audio/flac",
  ogg: "audio/ogg",
};

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

function assertAdmin(request) {
  const email = request.auth?.token?.email?.toLowerCase();
  if (!email || !ADMIN_EMAILS.includes(email)) {
    throw new HttpsError("permission-denied", "Solo los administradores del club pueden procesar sesiones.");
  }
}

async function loadSession(db, sessionId) {
  if (!sessionId || typeof sessionId !== "string") {
    throw new HttpsError("invalid-argument", "Falta sessionId.");
  }
  const ref = db.collection(SESSIONS_COLLECTION).doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", `No existe la sesión ${sessionId}.`);
  }
  return { ref, data: snap.data() };
}

async function failSession(ref, stage, err) {
  logger.error(`Session stage "${stage}" failed:`, err);
  await ref
    .update({
      status: "error",
      errorStage: stage,
      error: err.message || String(err),
      updatedAt: new Date().toISOString(),
    })
    .catch(() => {});
}

// ---------------------------------------------------------------------------
// Gemini helpers (plain fetch — no SDK dependency)
// ---------------------------------------------------------------------------

async function uploadToGeminiFiles(buffer, mimeType, displayName, apiKey) {
  const startRes = await fetch(`${GEMINI_BASE}/upload/v1beta/files?key=${apiKey}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(buffer.length),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: displayName } }),
  });
  if (!startRes.ok) {
    throw new Error(`Gemini Files API start failed (${startRes.status}): ${await startRes.text()}`);
  }
  const uploadUrl = startRes.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Gemini Files API did not return an upload URL.");

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "X-Goog-Upload-Command": "upload, finalize",
      "X-Goog-Upload-Offset": "0",
      "Content-Length": String(buffer.length),
    },
    body: buffer,
  });
  if (!uploadRes.ok) {
    throw new Error(`Gemini Files API upload failed (${uploadRes.status}): ${await uploadRes.text()}`);
  }
  const { file } = await uploadRes.json();

  let state = file.state;
  const fileName = file.name;
  const deadline = Date.now() + 10 * 60 * 1000;
  while (state === "PROCESSING") {
    if (Date.now() > deadline) throw new Error("Gemini file processing timed out.");
    await new Promise((r) => setTimeout(r, 5000));
    const pollRes = await fetch(`${GEMINI_BASE}/v1beta/${fileName}?key=${apiKey}`);
    if (!pollRes.ok) throw new Error(`Gemini file poll failed (${pollRes.status})`);
    state = (await pollRes.json()).state;
  }
  if (state !== "ACTIVE") throw new Error(`Gemini file ended in state ${state}.`);

  return { uri: file.uri, name: fileName };
}

function deleteGeminiFile(name, apiKey) {
  // Best effort — files auto-expire in 48h anyway.
  return fetch(`${GEMINI_BASE}/v1beta/${name}?key=${apiKey}`, { method: "DELETE" }).catch(() => {});
}

async function generateContent(parts, apiKey, generationConfig = {}) {
  const res = await fetch(
    `${GEMINI_BASE}/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { maxOutputTokens: 65536, ...generationConfig },
      }),
    }
  );
  if (!res.ok) {
    throw new Error(`Gemini generateContent failed (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("");
  if (!text) {
    throw new Error(
      `Gemini returned an empty response (finishReason: ${data?.candidates?.[0]?.finishReason || "unknown"}).`
    );
  }
  return text;
}

// ---------------------------------------------------------------------------
// Stage 1 — transcription with anonymous diarization
// ---------------------------------------------------------------------------

function buildTranscriptionPrompt(memberCount) {
  return `Transcribe íntegramente esta grabación de una sesión de un club de lectura en español.

Reglas ESTRICTAS de diarización:
- Formato de cada intervención: [Speaker N]: texto (una línea por turno de palabra).
- Numera las voces por orden de primera aparición: [Speaker 1], [Speaker 2], ...
- El club suele tener ${memberCount || 5} miembros, pero usa exactamente tantas etiquetas como voces DISTINTAS oigas realmente; no fuerces el número.
- Sé consistente: la misma voz debe llevar SIEMPRE la misma etiqueta durante toda la grabación. Presta atención al timbre, no al tema.
- NO uses nombres propios en las etiquetas aunque los oigas; siempre [Speaker N].
- No resumas ni omitas nada; transcripción literal con puntuación correcta.

Devuelve ÚNICAMENTE la transcripción, sin comentarios adicionales.`;
}

const SUGGESTION_SCHEMA = {
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          speaker: { type: "string" },
          memberName: { type: "string", nullable: true },
          confidence: { type: "string", enum: ["alta", "media", "baja"] },
          reason: { type: "string" },
        },
        required: ["speaker", "confidence", "reason"],
      },
    },
  },
  required: ["suggestions"],
};

function buildSuggestionPrompt(transcript, members) {
  const roster = members
    .map((m) => `- ${m.name}: ${m.persona || "sin descripción"}`)
    .join("\n");
  return `Esta es la transcripción diarizada de una sesión de un club de lectura, con hablantes anónimos [Speaker N].

Miembros habituales del club:
${roster}

Para cada Speaker, sugiere qué miembro es MÁS probable que sea, usando SOLO pistas del contenido: cómo se llaman entre ellos ("¿tú qué opinas, X?"), autorreferencias, y el estilo de análisis descrito en su perfil. Si no hay pistas suficientes, memberName debe ser null y confidence "baja". No inventes.

Transcripción:
"""
${transcript}
"""`;
}

// Parse "[Speaker N]: text" lines into speaker list + first snippet each.
function extractSpeakers(transcript) {
  const speakers = [];
  const snippets = {};
  for (const line of transcript.split("\n")) {
    const m = line.match(/^\[Speaker\s+(\d+)\]:\s*(.*)$/i);
    if (!m) continue;
    const tag = `Speaker ${m[1]}`;
    if (!speakers.includes(tag)) speakers.push(tag);
    const text = m[2].trim();
    if (!snippets[tag] && text.length > 15) {
      snippets[tag] = text.length > 140 ? text.slice(0, 140) + "…" : text;
    }
  }
  speakers.sort((a, b) => Number(a.replace(/\D/g, "")) - Number(b.replace(/\D/g, "")));
  for (const tag of speakers) {
    if (!snippets[tag]) snippets[tag] = "Intervención breve.";
  }
  return { speakers, snippets };
}

export const transcribeSession = onCall(CALL_OPTS, async (request) => {
  assertAdmin(request);
  const db = getFirestore();
  const { ref, data } = await loadSession(db, request.data?.sessionId);

  if (data.status === "transcribing" || data.status === "analyzing") {
    // A stale lock (e.g. a previous run that died) is released after 90 min.
    const lockAge = Date.now() - new Date(data.updatedAt || 0).getTime();
    if (lockAge < 90 * 60 * 1000) {
      throw new HttpsError("failed-precondition", "Esta sesión ya se está procesando.");
    }
  }
  if (!data.audioPath) {
    throw new HttpsError("failed-precondition", "La sesión no tiene audio subido.");
  }

  const apiKey = geminiApiKey.value();
  const bucket = getStorage().bucket();
  let geminiFile = null;

  try {
    await ref.update({ status: "transcribing", error: null, errorStage: null, updatedAt: new Date().toISOString() });

    logger.info(`Session ${ref.id}: downloading ${data.audioPath}`);
    const [buffer] = await bucket.file(data.audioPath).download();

    const ext = data.audioPath.toLowerCase().split(".").pop();
    const mimeType = MIME_BY_EXT[ext] || "audio/mp3";

    logger.info(`Session ${ref.id}: uploading ${buffer.length} bytes to Gemini`);
    geminiFile = await uploadToGeminiFiles(buffer, mimeType, data.audioName || "session-audio", apiKey);

    const membersSnap = await db.collection(MEMBERS_COLLECTION).get();
    const members = membersSnap.docs.map((d) => d.data());

    logger.info(`Session ${ref.id}: transcribing`);
    const transcript = await generateContent(
      [
        { file_data: { file_uri: geminiFile.uri, mime_type: mimeType } },
        { text: buildTranscriptionPrompt(members.length) },
      ],
      apiKey
    );

    const { speakers, snippets } = extractSpeakers(transcript);
    if (speakers.length === 0) {
      throw new Error("La transcripción no contiene etiquetas [Speaker N] reconocibles.");
    }

    // Suggested mapping (hint only — a human confirms it in the SPA).
    let suggestedMapping = {};
    try {
      logger.info(`Session ${ref.id}: suggesting speaker mapping`);
      const suggestionRaw = await generateContent(
        [{ text: buildSuggestionPrompt(transcript, members) }],
        apiKey,
        { responseMimeType: "application/json", responseSchema: SUGGESTION_SCHEMA }
      );
      const { suggestions } = JSON.parse(suggestionRaw);
      const validNames = new Set(members.map((m) => m.name));
      for (const s of suggestions || []) {
        if (speakers.includes(s.speaker) && s.memberName && validNames.has(s.memberName)) {
          suggestedMapping[s.speaker] = {
            memberName: s.memberName,
            confidence: s.confidence,
            reason: s.reason,
          };
        }
      }
    } catch (err) {
      logger.warn(`Session ${ref.id}: mapping suggestion failed (non-fatal):`, err.message);
    }

    const transcriptPath = `transcripts/${ref.id}.txt`;
    await bucket.file(transcriptPath).save(transcript, {
      contentType: "text/plain; charset=utf-8",
    });

    await ref.update({
      status: "needs_mapping",
      transcriptPath,
      transcriptExcerpt: transcript.slice(0, 1500),
      detectedSpeakers: speakers,
      speakerSnippets: snippets,
      suggestedMapping,
      updatedAt: new Date().toISOString(),
    });

    logger.info(`Session ${ref.id}: transcription ready, awaiting speaker mapping.`);
    return { status: "needs_mapping", detectedSpeakers: speakers };
  } catch (err) {
    await failSession(ref, "transcription", err);
    throw new HttpsError("internal", err.message || "Transcription failed.");
  } finally {
    if (geminiFile) deleteGeminiFile(geminiFile.name, apiKey);
  }
});

// ---------------------------------------------------------------------------
// Stage 2 — analysis with confirmed names
// ---------------------------------------------------------------------------

const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    bookTitle: { type: "string", nullable: true },
    bookAuthor: { type: "string", nullable: true },
    genre: { type: "string", nullable: true },
    generalSummary: { type: "string" },
    grades: {
      type: "array",
      items: {
        type: "object",
        properties: {
          member: { type: "string" },
          start: { type: "number", nullable: true },
          end: { type: "number", nullable: true },
        },
        required: ["member"],
      },
    },
    speakers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          voiceSnippet: { type: "string" },
          summary: { type: "string" },
        },
        required: ["name", "voiceSnippet", "summary"],
      },
    },
    sessionSummaryMarkdown: { type: "string" },
  },
  required: ["generalSummary", "grades", "speakers", "sessionSummaryMarkdown"],
};

function buildAnalysisPrompt(transcript, participants) {
  return `Eres un analista literario experto. Analiza esta transcripción de una sesión de debate de un club de lectura. Los hablantes ya están identificados con sus nombres reales, confirmados por un humano.

Participantes de esta sesión (usa EXACTAMENTE estos nombres, sin variantes): ${participants.join(", ")}.

RITUAL DE NOTAS DEL CLUB (muy importante): en cada sesión, cada miembro da una nota de 1 a 10 al libro DOS veces: una al principio del debate y otra al final (para medir si el debate cambió su opinión). Busca cuidadosamente ambas rondas de notas en la transcripción. Si un miembro solo da una nota o ninguna, deja el campo correspondiente en null — NO inventes notas.

Transcripción:
"""
${transcript}
"""

Genera un JSON con:
- bookTitle / bookAuthor / genre: deducidos del debate (null si no es posible).
- generalSummary: resumen ejecutivo de la sesión (2-3 párrafos): dinámica de grupo y tono del debate.
- grades: un elemento por participante con su nota inicial (start) y final (end), null donde no haya nota explícita.
- speakers: para cada participante: name, voiceSnippet (una cita textual breve y característica suya) y summary (sus opiniones clave, redactadas en primera persona).
- sessionSummaryMarkdown: documento Markdown con EXACTAMENTE estas secciones en este orden:

# Memoria y Resumen del Debate - [Título del Libro]

## Resumen Ejecutivo de la Sesión
(Ambiente de la reunión, puntos álgidos del debate.)

## Calificaciones y Evolución
(Análisis cualitativo de cómo y por qué variaron las notas de los miembros del principio al final.)

## Temas Debatidos y Posturas Individuales
(Desglose tema por tema. Para cada tema, la opinión y argumentos de CADA participante por su nombre, y el consenso o disenso final.)

## Análisis de Personajes y su Psicología
(Discusión sobre los personajes principales y su desarrollo.)

## Conclusiones, Puntos de Acuerdo y Citas Destacadas
(Conclusiones clave y citas textuales o parafraseadas que resuman el alma de la sesión.)`;
}

// Only grades for confirmed participants may enter the stats; names are
// matched case-insensitively against the confirmed list and normalized to
// the exact confirmed spelling.
function reshapeAndValidateGrades(gradesArray, participants) {
  const canonical = new Map(participants.map((p) => [p.toLowerCase(), p]));
  const grades = { start: {}, end: {} };
  for (const g of gradesArray || []) {
    const name = canonical.get((g.member || "").trim().toLowerCase());
    if (!name) continue;
    const start = Number(g.start);
    const end = Number(g.end);
    if (!isNaN(start) && g.start !== null && start >= 1 && start <= 10) grades.start[name] = start;
    if (!isNaN(end) && g.end !== null && end >= 1 && end <= 10) grades.end[name] = end;
  }
  return grades;
}

export const analyzeSession = onCall(CALL_OPTS, async (request) => {
  assertAdmin(request);
  const db = getFirestore();
  const { ref, data } = await loadSession(db, request.data?.sessionId);
  const mapping = request.data?.mapping;

  if (!data.transcriptPath) {
    throw new HttpsError("failed-precondition", "La sesión no tiene transcripción todavía.");
  }
  if (!mapping || typeof mapping !== "object" || Object.keys(mapping).length === 0) {
    throw new HttpsError("invalid-argument", "Falta el mapeo de hablantes confirmado.");
  }

  const apiKey = geminiApiKey.value();
  const bucket = getStorage().bucket();

  try {
    await ref.update({
      status: "analyzing",
      confirmedMapping: mapping,
      error: null,
      errorStage: null,
      updatedAt: new Date().toISOString(),
    });

    const [transcriptBuffer] = await bucket.file(data.transcriptPath).download();
    let transcript = transcriptBuffer.toString("utf-8");

    // If the transcript was already renamed by a previous analysis run, we
    // need the anonymous original; it is only renamed at the very end, so a
    // retry after failure always still has [Speaker N] tags.
    // Apply mapping, highest speaker number first so "Speaker 12" is not
    // clobbered by the "Speaker 1" replacement.
    const tags = Object.keys(mapping).sort(
      (a, b) => Number(b.replace(/\D/g, "")) - Number(a.replace(/\D/g, ""))
    );
    for (const tag of tags) {
      const name = String(mapping[tag] || "Invitado").trim() || "Invitado";
      const num = tag.replace(/\D/g, "");
      transcript = transcript.replace(new RegExp(`\\[Speaker\\s*${num}\\]`, "gi"), `[${name}]`);
    }

    const participants = [...new Set(Object.values(mapping).map((n) => String(n).trim()).filter(Boolean))];

    logger.info(`Session ${ref.id}: analyzing with participants ${participants.join(", ")}`);
    const analysisRaw = await generateContent(
      [{ text: buildAnalysisPrompt(transcript, participants) }],
      apiKey,
      { responseMimeType: "application/json", responseSchema: ANALYSIS_SCHEMA }
    );
    const parsed = JSON.parse(analysisRaw);

    // Persist the named transcript for BookDetails; keep the anonymous
    // original so re-running the analysis with a corrected mapping works.
    const namedTranscriptPath = `transcripts/${ref.id}_named.txt`;
    await bucket.file(namedTranscriptPath).save(transcript, {
      contentType: "text/plain; charset=utf-8",
    });

    await ref.update({
      status: "draft",
      namedTranscriptPath,
      transcriptExcerpt: transcript.slice(0, 1500),
      analysis: {
        bookTitle: parsed.bookTitle || null,
        bookAuthor: parsed.bookAuthor || null,
        genre: parsed.genre || null,
        generalSummary: parsed.generalSummary || "",
        grades: reshapeAndValidateGrades(parsed.grades, participants),
        speakers: (parsed.speakers || []).filter((s) => participants.includes(s.name)),
        sessionSummaryMarkdown: parsed.sessionSummaryMarkdown || "",
      },
      updatedAt: new Date().toISOString(),
    });

    logger.info(`Session ${ref.id}: draft ready.`);
    return { status: "draft" };
  } catch (err) {
    await failSession(ref, "analysis", err);
    throw new HttpsError("internal", err.message || "Analysis failed.");
  }
});
