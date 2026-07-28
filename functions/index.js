/**
 * Project Flamingo — serverless AI pipeline (callable, two stages).
 *
 * Diarization was deliberately dropped: LLM voice-matching proved unreliable
 * (same person split across tags, different people merged), and the club's
 * stats only need the GRADES to be right. So the pipeline centers on that:
 *
 * Stage 1 — transcribeSession({ sessionId }):
 *   Audio (Storage, ffmpeg-split into 15-min segments) → plain TIMESTAMPED
 *   transcript (no speaker tags) → a focused pass detects every moment in
 *   the opening/closing stretches where someone states a book grade
 *   (timestamp + verbatim quote + value + suggested member when a name is
 *   audible nearby). Ends in status `needs_grading`.
 *
 * Stage 2 — analyzeSession({ sessionId, grades }):
 *   Receives the HUMAN-confirmed grade list (member/round/value — the human
 *   listened to each moment in the UI and assigned it). Those are the stats,
 *   verbatim. Gemini then writes the general summary + session memory from
 *   the transcript, attributing opinions to members ONLY when a name is
 *   audible in the conversation. Ends in status `draft`.
 *
 * Both are HTTPS callables (3600s, retryable, keep running if the browser
 * closes). All generations retry with varied temperature: MALFORMED_RESPONSE
 * is stochastic degeneration and identical re-sends tend to repeat it.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { fetch, Agent, setGlobalDispatcher } from "undici";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

// Node's built-in fetch aborts after undici's default 300s headers timeout,
// which long Gemini generations exceed. Disable header/body timeouts — the
// function's own 3600s timeout is the real ceiling.
setGlobalDispatcher(new Agent({ headersTimeout: 0, bodyTimeout: 0, connectTimeout: 60_000 }));

initializeApp();

const geminiApiKey = defineSecret("GEMINI_API_KEY");

// 3.6 Flash: same input price as 3.5 Flash, cheaper output ($7.50 vs $9.00
// per 1M) and ~17% fewer output tokens, with the same 1M context / 65k
// output / structured-output surface this pipeline relies on.
const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_BASE = "https://generativelanguage.googleapis.com";
const SESSIONS_COLLECTION = "transcriptions";
const MEMBERS_COLLECTION = "speakers_registry";
const READS_COLLECTION = "personal_reads";

// Keep in sync with firestore.rules / storage.rules.
const ADMIN_EMAILS = ["doussinague95@gmail.com"];

const CALL_OPTS = {
  region: "europe-west1",
  // 2 GiB: ffmpeg writes segments to /tmp (tmpfs counts against memory).
  memory: "2GiB",
  timeoutSeconds: 3600,
  secrets: [geminiApiKey],
};

// A voice note is minutes, not hours: it needs neither the 2 GiB of tmpfs the
// session splitter uses nor a one-hour ceiling.
const NOTE_CALL_OPTS = {
  ...CALL_OPTS,
  memory: "1GiB",
  timeoutSeconds: 540,
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

// Retries VARY the sampling temperature: an identical re-send tends to fall
// into the same degenerate mode; changing the temperature breaks the pattern.
const RETRY_TEMPERATURES = [0.7, 1.0, 0.3, 1.3];

async function generateChunkWithRetry(parts, apiKey, tries = 4) {
  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt++) {
    const temperature = RETRY_TEMPERATURES[(attempt - 1) % RETRY_TEMPERATURES.length];
    try {
      return await generateContent(parts, apiKey, { maxOutputTokens: 16384, temperature });
    } catch (err) {
      lastErr = err;
      logger.warn(`Generation attempt ${attempt}/${tries} (temp ${temperature}) failed: ${err.message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw lastErr;
}

// Accepts either a plain prompt string or a full parts array (so the same
// retry/repair logic covers multimodal calls, e.g. audio + instructions).
async function generateJsonWithRetry(promptOrParts, schema, apiKey, tries = 3) {
  const parts = Array.isArray(promptOrParts) ? promptOrParts : [{ text: promptOrParts }];
  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt++) {
    const temperature = RETRY_TEMPERATURES[(attempt - 1) % RETRY_TEMPERATURES.length];
    try {
      const raw = await generateContent(parts, apiKey, {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature,
      });
      return JSON.parse(raw);
    } catch (err) {
      lastErr = err;
      logger.warn(`JSON generation attempt ${attempt}/${tries} (temp ${temperature}) failed: ${err.message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// Stage 1 — timestamped transcription (no diarization) in ffmpeg segments
// ---------------------------------------------------------------------------

// 15-min segments keep each generation short: degeneration is rarer and a
// failed retry is cheap. (Prompting Gemini to transcribe "only minute X-Y"
// of a long upload does NOT bound the work — hence real audio splitting.)
const CHUNK_SECONDS = 900;

function buildSegmentPrompt(segmentIndex, segmentCount) {
  return `Este es el fragmento ${segmentIndex + 1} de ${segmentCount} de la grabación de una sesión de un club de lectura en español. Transcríbelo ÍNTEGRAMENTE y de forma literal.

Formato: párrafos cortos, cada uno empezando con el minuto y segundo DENTRO DE ESTE FRAGMENTO en que empieza:
[mm:ss] texto de lo que se dice

Reglas:
- Empieza un párrafo nuevo cada vez que cambie quien habla o cambie el tema (párrafos de 1-4 frases).
- NO intentes identificar ni etiquetar a los hablantes; solo transcribe lo dicho.
- Sin markdown. Transcripción literal, con puntuación correcta.

Devuelve ÚNICAMENTE la transcripción, empezando directamente por el primer párrafo.`;
}

// "[mm:ss] text" (or hh:mm:ss, optional brackets/parens) at line start.
const TS_LINE = /^\s*(?:[-*>]\s*)?\[?\(?(\d{1,2}):(\d{2})(?::(\d{2}))?\)?\]?\s*[:\-–—]?\s*(.*)$/;

function tsToSeconds(a, b, c) {
  if (a === undefined) return null;
  return c !== undefined
    ? Number(a) * 3600 + Number(b) * 60 + Number(c)
    : Number(a) * 60 + Number(b);
}

function fmtTime(totalSec) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

// Parse one segment's raw transcript into { t (absolute seconds), text }
// entries. Untimestamped lines are appended to the current entry.
function parseSegment(raw, segIndex) {
  const entries = [];
  for (const line of raw.split("\n")) {
    const m = line.match(TS_LINE);
    if (m && m[4] !== undefined && m[1] !== undefined) {
      const rel = tsToSeconds(m[1], m[2], m[3]);
      const text = m[4].replace(/^[*_\s]+/, "").trim();
      if (text) entries.push({ t: segIndex * CHUNK_SECONDS + rel, text });
    } else {
      const cont = line.trim();
      if (!cont) continue;
      if (entries.length > 0) {
        entries[entries.length - 1].text += " " + cont;
      } else {
        // Preamble without timestamp: keep it, anchored at segment start.
        entries.push({ t: segIndex * CHUNK_SECONDS, text: cont });
      }
    }
  }
  return entries;
}

// Split an audio buffer into ~CHUNK_SECONDS segments using a stream copy (no
// re-encode: fast, lossless). Returns the segment buffers plus a cleanup fn.
async function splitAudio(buffer, ext) {
  const dir = await mkdtemp(path.join(tmpdir(), "flamingo-"));
  const cleanup = () => rm(dir, { recursive: true, force: true }).catch(() => {});
  try {
    const inputPath = path.join(dir, `input.${ext}`);
    await writeFile(inputPath, buffer);
    const pattern = path.join(dir, `seg_%03d.${ext}`);

    await new Promise((resolve, reject) => {
      const ff = spawn(ffmpegPath, [
        "-hide_banner", "-loglevel", "error",
        "-i", inputPath,
        "-f", "segment",
        "-segment_time", String(CHUNK_SECONDS),
        "-c", "copy",
        "-reset_timestamps", "1",
        pattern,
      ]);
      let stderr = "";
      ff.stderr.on("data", (d) => (stderr += d.toString()));
      ff.on("error", reject);
      ff.on("close", (code) =>
        code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(0, 300)}`))
      );
    });

    const files = (await readdir(dir)).filter((f) => f.startsWith("seg_")).sort();
    const segments = [];
    for (const f of files) segments.push(await readFile(path.join(dir, f)));
    if (segments.length === 0) throw new Error("ffmpeg produced no segments.");
    return { segments, cleanup };
  } catch (err) {
    await cleanup();
    throw err;
  }
}

// Transcribe the whole recording segment by segment; returns { t, text }
// entries, or null if the audio could not be split (caller falls back).
async function transcribeInSegments(buffer, ext, mimeType, apiKey, onProgress) {
  let split;
  try {
    split = await splitAudio(buffer, ext);
  } catch (err) {
    logger.warn(`ffmpeg split failed (${err.message}); falling back to single-file transcription.`);
    return null;
  }

  try {
    const total = split.segments.length;
    logger.info(`Split audio into ${total} segment(s).`);
    const entries = [];

    for (let i = 0; i < total; i++) {
      if (onProgress) await onProgress(`fragmento ${i + 1}/${total}`);
      const geminiFile = await uploadToGeminiFiles(split.segments[i], mimeType, `segment-${i}`, apiKey);
      try {
        const raw = await generateChunkWithRetry(
          [
            { file_data: { file_uri: geminiFile.uri, mime_type: mimeType } },
            { text: buildSegmentPrompt(i, total) },
          ],
          apiKey
        );
        const segEntries = parseSegment(raw, i);
        if (segEntries.length === 0 && i === 0) {
          logger.error(`First segment produced no text. Raw starts:\n${raw.slice(0, 500)}`);
          throw new Error("La transcripción del primer fragmento llegó vacía. Revisa los logs de la función.");
        }
        entries.push(...segEntries);
      } finally {
        deleteGeminiFile(geminiFile.name, apiKey);
      }
    }

    return entries;
  } finally {
    await split.cleanup();
  }
}

// ---------------------------------------------------------------------------
// Grade-moment detection (the heart of the pipeline)
// ---------------------------------------------------------------------------

const GRADE_EVENTS_SCHEMA = {
  type: "object",
  properties: {
    events: {
      type: "array",
      items: {
        type: "object",
        properties: {
          round: { type: "string", enum: ["start", "end"] },
          timestamp: { type: "string" },
          quote: { type: "string" },
          value: { type: "number", nullable: true },
          suggestedMember: { type: "string", nullable: true },
        },
        required: ["round", "timestamp", "quote"],
      },
    },
  },
  required: ["events"],
};

function buildGradeEventsPrompt(head, tail, members) {
  const roster = members.map((m) => m.name).join(", ");
  return `RITUAL DE NOTAS de un club de lectura: en cada sesión, cada miembro puntúa el libro de 1 a 10 DOS veces — una RONDA INICIAL cerca del principio del debate y una RONDA FINAL cerca del final.

Abajo tienes el TRAMO INICIAL y el TRAMO FINAL de la transcripción (con marcas de tiempo [hh:mm:ss] por párrafo). Localiza CADA momento en que alguien dice su nota:

- round: "start" si el momento está en el TRAMO INICIAL, "end" si está en el TRAMO FINAL.
- timestamp: copia EXACTAMENTE la marca [hh:mm:ss] del párrafo donde se dice la nota.
- quote: la frase textual donde se dice la nota.
- value: la nota como número ("un ocho y medio" = 8.5, "entre 7 y 8" = 7.5, "nueve" = 9); null si dice que puntúa pero el número no queda claro.
- suggestedMember: SOLO si en la conversación cercana se oye claramente el nombre de quien habla (p. ej. "Jaime, ¿tu nota?" justo antes). Debe ser uno de: ${roster}. En caso contrario null — NO adivines.

Incluye un evento por CADA nota que se diga, aunque haya varias muy seguidas. No inventes eventos: si una ronda no aparece en el texto, devuelve solo los eventos reales.

TRAMO INICIAL:
"""
${head}
"""

TRAMO FINAL:
"""
${tail}
"""`;
}

function parseEventTimestamp(str) {
  const m = String(str || "").match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return tsToSeconds(m[1], m[2], m[3]);
}

async function detectGradeEvents(canonical, members, apiKey) {
  const head = canonical.slice(0, 24000);
  const tail = canonical.slice(-32000);
  const result = await generateJsonWithRetry(
    buildGradeEventsPrompt(head, tail, members),
    GRADE_EVENTS_SCHEMA,
    apiKey
  );
  const validNames = new Set(members.map((m) => m.name));
  const events = (result.events || [])
    .map((e) => ({
      round: e.round === "end" ? "end" : "start",
      t: parseEventTimestamp(e.timestamp),
      quote: String(e.quote || "").slice(0, 300),
      value:
        e.value !== null && e.value !== undefined && Number(e.value) >= 1 && Number(e.value) <= 10
          ? Number(e.value)
          : null,
      suggestedMember: validNames.has(e.suggestedMember) ? e.suggestedMember : null,
    }))
    .filter((e) => e.quote);
  events.sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
  return events;
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

  try {
    await ref.update({ status: "transcribing", error: null, errorStage: null, updatedAt: new Date().toISOString() });

    logger.info(`Session ${ref.id}: downloading ${data.audioPath}`);
    const [buffer] = await bucket.file(data.audioPath).download();

    const ext = data.audioPath.toLowerCase().split(".").pop();
    const mimeType = MIME_BY_EXT[ext] || "audio/mp3";

    const touchLock = (note) =>
      ref.update({ status: "transcribing", progressNote: note, updatedAt: new Date().toISOString() });

    logger.info(`Session ${ref.id}: transcribing (${buffer.length} bytes) by segments`);
    let entries = await transcribeInSegments(buffer, ext, mimeType, apiKey, touchLock);

    // Fallback: ffmpeg unavailable — single call (fine for short recordings).
    if (entries === null) {
      logger.info(`Session ${ref.id}: single-file transcription fallback`);
      const geminiFile = await uploadToGeminiFiles(buffer, mimeType, data.audioName || "session-audio", apiKey);
      try {
        const raw = await generateChunkWithRetry(
          [
            { file_data: { file_uri: geminiFile.uri, mime_type: mimeType } },
            { text: buildSegmentPrompt(0, 1) },
          ],
          apiKey
        );
        entries = parseSegment(raw, 0);
      } finally {
        deleteGeminiFile(geminiFile.name, apiKey);
      }
    }

    if (entries.length === 0) {
      throw new Error("La transcripción llegó vacía. Revisa los logs de la función.");
    }

    const canonical = entries.map((e) => `[${fmtTime(e.t)}] ${e.text}`).join("\n");

    const membersSnap = await db.collection(MEMBERS_COLLECTION).get();
    const members = membersSnap.docs.map((d) => d.data());

    await touchLock("localizando notas");
    logger.info(`Session ${ref.id}: detecting grade moments`);
    const gradeEvents = await detectGradeEvents(canonical, members, apiKey);
    logger.info(
      `Session ${ref.id}: found ${gradeEvents.length} grade moment(s): ` +
        gradeEvents.map((e) => `${e.round}@${e.t !== null ? fmtTime(e.t) : "?"}=${e.value ?? "?"}`).join(", ")
    );

    const transcriptPath = `transcripts/${ref.id}.txt`;
    await bucket.file(transcriptPath).save(canonical, {
      contentType: "text/plain; charset=utf-8",
    });

    await ref.update({
      status: "needs_grading",
      transcriptPath,
      transcriptExcerpt: canonical.slice(0, 1500),
      gradeEvents,
      progressNote: null,
      updatedAt: new Date().toISOString(),
    });

    logger.info(`Session ${ref.id}: transcription ready, awaiting grade assignment.`);
    return { status: "needs_grading", gradeEvents: gradeEvents.length };
  } catch (err) {
    await failSession(ref, "transcription", err);
    throw new HttpsError("internal", err.message || "Transcription failed.");
  }
});

// ---------------------------------------------------------------------------
// Stage 2 — analysis with human-confirmed grades
// ---------------------------------------------------------------------------

const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    bookTitle: { type: "string", nullable: true },
    bookAuthor: { type: "string", nullable: true },
    genre: { type: "string", nullable: true },
    generalSummary: { type: "string" },
  },
  required: ["generalSummary"],
};

function buildAnalysisJsonPrompt(transcript) {
  return `Analiza esta transcripción de una sesión de debate de un club de lectura en español.

Transcripción:
"""
${transcript}
"""

Genera un JSON con:
- bookTitle / bookAuthor / genre: el libro debatido, deducidos de la conversación (null si no es posible).
- generalSummary: resumen ejecutivo de la sesión (2-3 párrafos): dinámica de grupo, tono del debate y grandes temas.

Sé conciso.`;
}

function formatGradesForPrompt(grades) {
  const lines = [];
  const names = new Set([...Object.keys(grades.start), ...Object.keys(grades.end)]);
  for (const name of names) {
    lines.push(
      `- ${name}: inicial ${grades.start[name] ?? "sin nota"}, final ${grades.end[name] ?? "sin nota"}`
    );
  }
  return lines.length ? lines.join("\n") : "(sin notas registradas)";
}

function buildMemoriaPrompt(transcript, grades, bookTitle) {
  return `Eres un analista literario experto. A partir de esta transcripción de una sesión de debate de un club de lectura, redacta la memoria de la sesión.

IMPORTANTE sobre atribución: la transcripción NO identifica quién habla. Atribuye una opinión a un miembro concreto SOLO cuando su nombre se oiga en la conversación ("como decía Almu...", "Jaime, ¿tú qué opinas?"). En el resto de casos usa fórmulas neutras ("uno de los miembros", "otra participante", "el grupo"). NO inventes atribuciones.

NOTAS CONFIRMADAS por los miembros (1-10, verificadas por un humano — úsalas tal cual en la sección de calificaciones):
${formatGradesForPrompt(grades)}

Transcripción:
"""
${transcript}
"""

Redacta un documento Markdown con EXACTAMENTE estas secciones en este orden (y nada más):

# Memoria y Resumen del Debate - ${bookTitle || "[Título del Libro]"}

## Resumen Ejecutivo de la Sesión
(Ambiente de la reunión, puntos álgidos del debate.)

## Calificaciones y Evolución
(Las notas confirmadas de arriba y un análisis cualitativo de cómo evolucionó la opinión del grupo del principio al final.)

## Temas Debatidos y Posturas
(Desglose tema por tema de lo discutido, posturas enfrentadas y consensos, con atribución solo cuando sea segura.)

## Análisis de Personajes y su Psicología
(Discusión sobre los personajes principales y su desarrollo.)

## Conclusiones, Puntos de Acuerdo y Citas Destacadas
(Conclusiones clave y citas textuales o parafraseadas que resuman el alma de la sesión.)

Devuelve ÚNICAMENTE el documento Markdown, sin envolverlo en \`\`\`.`;
}

// Strip a ```markdown ... ``` wrapper if the model added one.
function unwrapMarkdown(text) {
  const t = text.trim();
  const m = t.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n?```$/);
  return m ? m[1].trim() : t;
}

// Human-confirmed grade rows -> { start: {name: n}, end: {name: n} }.
// Guests are excluded from stats; values clamped to the 1-10 ritual range.
function buildGradesFromConfirmed(list) {
  const grades = { start: {}, end: {} };
  for (const g of list || []) {
    const member = String(g.member || "").trim();
    const value = Number(g.value);
    if (!member || member.toLowerCase() === "invitado") continue;
    if (isNaN(value) || value < 1 || value > 10) continue;
    if (g.round === "end") grades.end[member] = value;
    else grades.start[member] = value;
  }
  return grades;
}

export const analyzeSession = onCall(CALL_OPTS, async (request) => {
  assertAdmin(request);
  const db = getFirestore();
  const { ref, data } = await loadSession(db, request.data?.sessionId);
  const confirmedGrades = request.data?.grades;

  if (!data.transcriptPath) {
    throw new HttpsError("failed-precondition", "La sesión no tiene transcripción todavía.");
  }
  if (!Array.isArray(confirmedGrades)) {
    throw new HttpsError("invalid-argument", "Faltan las notas confirmadas.");
  }

  const apiKey = geminiApiKey.value();
  const bucket = getStorage().bucket();

  try {
    await ref.update({
      status: "analyzing",
      confirmedGrades,
      error: null,
      errorStage: null,
      updatedAt: new Date().toISOString(),
    });

    const [transcriptBuffer] = await bucket.file(data.transcriptPath).download();
    const transcript = transcriptBuffer.toString("utf-8");

    const grades = buildGradesFromConfirmed(confirmedGrades);

    logger.info(`Session ${ref.id}: analyzing`);
    const parsed = await generateJsonWithRetry(buildAnalysisJsonPrompt(transcript), ANALYSIS_SCHEMA, apiKey);

    logger.info(`Session ${ref.id}: writing session memory`);
    const memoriaRaw = await generateChunkWithRetry(
      [{ text: buildMemoriaPrompt(transcript, grades, parsed.bookTitle) }],
      apiKey
    );
    const sessionSummaryMarkdown = unwrapMarkdown(memoriaRaw);

    await ref.update({
      status: "draft",
      analysis: {
        bookTitle: parsed.bookTitle || null,
        bookAuthor: parsed.bookAuthor || null,
        genre: parsed.genre || null,
        generalSummary: parsed.generalSummary || "",
        grades,
        sessionSummaryMarkdown,
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

// ---------------------------------------------------------------------------
// Personal reading log — voice note -> transcript + structured takeaways
// ---------------------------------------------------------------------------

const READING_NOTE_SCHEMA = {
  type: "object",
  properties: {
    transcript: { type: "string" },
    summary: { type: "string" },
    keyInsights: { type: "array", items: { type: "string" } },
    standouts: { type: "array", items: { type: "string" } },
    themes: { type: "array", items: { type: "string" } },
    verdict: { type: "string", nullable: true },
    suggestedRating: { type: "number", nullable: true },
  },
  required: ["transcript", "summary"],
};

function buildReadingNotePrompt(read) {
  const book = [read.title, read.author && `de ${read.author}`].filter(Boolean).join(" ");
  return `Este es un audio en español: una nota de voz que una persona se graba a sí misma justo después de terminar un libro${book ? ` (${book})` : ""}. Habla de forma informal, sin guion, y puede divagar o corregirse.

Devuelve un JSON con:
- transcript: la transcripción LITERAL de lo que dice, con puntuación correcta. No resumas aquí, no añadas marcas de tiempo ni etiquetas de hablante.
- summary: 2-3 frases con la idea general de lo que opina del libro.
- keyInsights: las ideas que merece la pena guardar (lo que aprendió, lo que le hizo pensar). Frases completas y concretas, en SUS palabras siempre que se pueda. Lista vacía si realmente no dice ninguna.
- standouts: lo que le llamó la atención — escenas, personajes, la prosa, la estructura, el ritmo.
- themes: 3-6 etiquetas cortas (1-3 palabras) con los temas del libro o de su reflexión.
- verdict: una sola frase que capture su valoración final, en su mismo registro. null si no llega a valorarlo.
- suggestedRating: SOLO si dice explícitamente una nota numérica (del 1 al 10). Si no dice ningún número, null. NO deduzcas una nota a partir del tono.

Reglas: no inventes nada que no esté en el audio. Si la nota es muy corta, devuelve listas cortas o vacías en lugar de rellenar con paja.`;
}

// MediaRecorder in Chrome produces audio/webm;codecs=opus, which the Gemini
// Files API rejects. Normalizing to 16 kHz mono WAV sidesteps the whole
// container/codec question: PCM needs no encoder compiled into ffmpeg, and
// 16 kHz mono is plenty for speech.
async function transcodeToWav(buffer, ext) {
  const dir = await mkdtemp(path.join(tmpdir(), "flamingo-note-"));
  try {
    const inputPath = path.join(dir, `input.${ext || "bin"}`);
    const outputPath = path.join(dir, "note.wav");
    await writeFile(inputPath, buffer);

    await new Promise((resolve, reject) => {
      const ff = spawn(ffmpegPath, [
        "-hide_banner", "-loglevel", "error",
        "-i", inputPath,
        "-ac", "1",
        "-ar", "16000",
        "-f", "wav",
        outputPath,
      ]);
      let stderr = "";
      ff.stderr.on("data", (d) => (stderr += d.toString()));
      ff.on("error", reject);
      ff.on("close", (code) =>
        code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(0, 300)}`))
      );
    });

    return await readFile(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function cleanStringList(value, maxItems, maxLen = 400) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, maxItems)
    .map((item) => item.slice(0, maxLen));
}

export const analyzeReadingNote = onCall(NOTE_CALL_OPTS, async (request) => {
  const email = request.auth?.token?.email?.toLowerCase();
  if (!email) {
    throw new HttpsError("permission-denied", "Necesitas iniciar sesión.");
  }

  const readId = request.data?.readId;
  if (!readId || typeof readId !== "string") {
    throw new HttpsError("invalid-argument", "Falta readId.");
  }

  const db = getFirestore();
  const ref = db.collection(READS_COLLECTION).doc(readId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", `No existe la lectura ${readId}.`);
  }

  const data = snap.data();
  // Ownership, not just "is an admin": this collection is private per owner,
  // and the Admin SDK bypasses the Firestore rules that would say so.
  if (data.ownerEmail !== email) {
    throw new HttpsError("permission-denied", "Esta lectura no es tuya.");
  }

  const audioPath = data.voiceNote?.audioPath;
  if (!audioPath) {
    throw new HttpsError("failed-precondition", "Esta lectura no tiene nota de voz.");
  }

  // Release a stale lock from a run that died mid-flight (the callable's own
  // ceiling is 9 minutes, so 30 is comfortably past any live run).
  if (data.noteStatus === "transcribing") {
    const lockAge = Date.now() - new Date(data.updatedAt || 0).getTime();
    if (lockAge < 30 * 60 * 1000) {
      throw new HttpsError("failed-precondition", "Esta nota ya se está procesando.");
    }
  }

  const apiKey = geminiApiKey.value();
  const bucket = getStorage().bucket();

  try {
    await ref.update({
      noteStatus: "transcribing",
      error: null,
      errorStage: null,
      updatedAt: new Date().toISOString(),
    });

    logger.info(`Read ${ref.id}: downloading ${audioPath}`);
    const [rawBuffer] = await bucket.file(audioPath).download();
    const ext = audioPath.toLowerCase().split(".").pop();

    let audioBuffer;
    let mimeType;
    try {
      audioBuffer = await transcodeToWav(rawBuffer, ext);
      mimeType = "audio/wav";
    } catch (err) {
      // Better to try the original bytes than to fail outright: an .mp3 or
      // .ogg upload is already something Gemini accepts.
      logger.warn(`Read ${ref.id}: transcode failed (${err.message}); sending original audio.`);
      audioBuffer = rawBuffer;
      mimeType = MIME_BY_EXT[ext] || "audio/mp3";
    }

    logger.info(`Read ${ref.id}: analyzing voice note (${audioBuffer.length} bytes, ${mimeType})`);
    const geminiFile = await uploadToGeminiFiles(audioBuffer, mimeType, `note-${ref.id}`, apiKey);

    let parsed;
    try {
      parsed = await generateJsonWithRetry(
        [
          { file_data: { file_uri: geminiFile.uri, mime_type: mimeType } },
          { text: buildReadingNotePrompt(data) },
        ],
        READING_NOTE_SCHEMA,
        apiKey
      );
    } finally {
      deleteGeminiFile(geminiFile.name, apiKey);
    }

    const transcript = String(parsed.transcript || "").trim();
    if (!transcript) {
      throw new Error("La transcripción de la nota llegó vacía. ¿Se grabó algo de audio?");
    }

    const suggested = Number(parsed.suggestedRating);
    await ref.update({
      noteStatus: "ready",
      transcript,
      insights: {
        summary: String(parsed.summary || "").trim().slice(0, 2000),
        keyInsights: cleanStringList(parsed.keyInsights, 12),
        standouts: cleanStringList(parsed.standouts, 12),
        themes: cleanStringList(parsed.themes, 8, 60),
        verdict: parsed.verdict ? String(parsed.verdict).trim().slice(0, 400) : null,
        suggestedRating: !isNaN(suggested) && suggested >= 1 && suggested <= 10 ? suggested : null,
      },
      error: null,
      errorStage: null,
      updatedAt: new Date().toISOString(),
    });

    logger.info(`Read ${ref.id}: voice note ready.`);
    return { status: "ready" };
  } catch (err) {
    logger.error(`Read ${ref.id}: voice note analysis failed:`, err);
    await ref
      .update({
        noteStatus: "error",
        errorStage: "analysis",
        error: err.message || String(err),
        updatedAt: new Date().toISOString(),
      })
      .catch(() => {});
    throw new HttpsError("internal", err.message || "Voice note analysis failed.");
  }
});
