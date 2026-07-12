/**
 * Project Flamingo — serverless AI pipeline.
 *
 * Trigger: an admin uploads a session recording to
 * `recordings/{sessionId}/{filename}` (the SPA creates the matching
 * Firestore doc in `transcriptions/{sessionId}` first).
 *
 * Flow:
 *   1. Mark the session doc as `processing`.
 *   2. Push the audio to the Gemini Files API.
 *   3. Call 1 — diarized transcription, labeling speakers with the club
 *      member names (personas from `speakers_registry` are used as hints).
 *   4. Call 2 — structured analysis (summary, grades, session memory) with
 *      a response schema, so the output is guaranteed-valid JSON.
 *   5. Store the transcript as a text file in Storage, the analysis in the
 *      session doc, and flip status to `draft` for human review in the SPA.
 *
 * The browser never holds AI credentials; the Gemini key lives in the
 * GEMINI_API_KEY secret (Secret Manager).
 */

import { onObjectFinalized } from "firebase-functions/v2/storage";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

initializeApp();

const geminiApiKey = defineSecret("GEMINI_API_KEY");

const GEMINI_MODEL = "gemini-3.5-flash";
const GEMINI_BASE = "https://generativelanguage.googleapis.com";
const SESSIONS_COLLECTION = "transcriptions";
const MEMBERS_COLLECTION = "speakers_registry";

const MIME_BY_EXT = {
  mp3: "audio/mp3",
  wav: "audio/wav",
  flac: "audio/flac",
  ogg: "audio/ogg",
};

// ---------------------------------------------------------------------------
// Gemini helpers (plain fetch — no SDK dependency)
// ---------------------------------------------------------------------------

async function uploadToGeminiFiles(buffer, mimeType, displayName, apiKey) {
  // Resumable upload: start, then send all bytes and finalize in one go.
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

  // Wait until the file is processed and usable.
  let state = file.state;
  let fileName = file.name;
  const deadline = Date.now() + 5 * 60 * 1000;
  while (state === "PROCESSING") {
    if (Date.now() > deadline) throw new Error("Gemini file processing timed out.");
    await new Promise((r) => setTimeout(r, 5000));
    const pollRes = await fetch(`${GEMINI_BASE}/v1beta/${fileName}?key=${apiKey}`);
    if (!pollRes.ok) throw new Error(`Gemini file poll failed (${pollRes.status})`);
    const polled = await pollRes.json();
    state = polled.state;
  }
  if (state !== "ACTIVE") throw new Error(`Gemini file ended in state ${state}.`);

  return { uri: file.uri, name: fileName };
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

// Structured-output schema for the analysis call. Grades are an array
// (OpenAPI subset has no free-form map support) and get reshaped to the
// { start: {}, end: {} } format the frontend expects.
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

function buildTranscriptionPrompt(members) {
  const roster = members
    .map((m) => `- ${m.name}: ${m.persona || "sin descripción"}`)
    .join("\n");
  return `Transcribe íntegramente esta grabación de una sesión de un club de lectura en español.

Reglas:
- Formato de cada intervención: [Nombre]: texto de la intervención (una línea por turno de palabra).
- Diariza por voz e intenta identificar a cada hablante con uno de los miembros del club listados abajo, usando pistas de contexto (cómo se llaman entre ellos, sus estilos de análisis descritos).
- Si no puedes atribuir una voz con confianza razonable, etiquétala como [Invitado 1], [Invitado 2], etc.
- No resumas ni omitas nada; transcripción literal con puntuación correcta.

Miembros del club:
${roster}

Devuelve ÚNICAMENTE la transcripción, sin comentarios adicionales.`;
}

function buildAnalysisPrompt(transcript) {
  return `Eres un analista literario experto. Analiza esta transcripción de una sesión de debate de un club de lectura (los hablantes ya están identificados por nombre).

Transcripción:
"""
${transcript}
"""

Genera un JSON con:
- bookTitle / bookAuthor / genre: deducidos del debate (null si no es posible).
- generalSummary: resumen ejecutivo de la sesión (2-3 párrafos): dinámica de grupo y tono del debate.
- grades: para cada miembro, la nota (1-10) que dio al libro al INICIO y al FINAL del debate, si las mencionan (null si no).
- speakers: para cada participante: name, voiceSnippet (una cita textual breve y característica suya) y summary (sus opiniones clave, redactadas en primera persona).
- sessionSummaryMarkdown: documento Markdown con EXACTAMENTE estas secciones en este orden:

# Memoria y Resumen del Debate - [Título del Libro]

## Resumen Ejecutivo de la Sesión
(Ambiente de la reunión, puntos álgidos del debate.)

## Calificaciones y Evolución
(Análisis cualitativo de cómo y por qué variaron las notas de los miembros del principio al final.)

## Temas Debatidos y Posturas Individuales
(Desglose tema por tema. Para cada tema, la opinión y argumentos de CADA miembro por su nombre, y el consenso o disenso final.)

## Análisis de Personajes y su Psicología
(Discusión sobre los personajes principales y su desarrollo.)

## Conclusiones, Puntos de Acuerdo y Citas Destacadas
(Conclusiones clave y citas textuales o parafraseadas que resuman el alma de la sesión.)`;
}

function reshapeGrades(gradesArray) {
  const grades = { start: {}, end: {} };
  for (const g of gradesArray || []) {
    if (!g.member) continue;
    if (g.start !== null && g.start !== undefined) grades.start[g.member] = g.start;
    if (g.end !== null && g.end !== undefined) grades.end[g.member] = g.end;
  }
  return grades;
}

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------

export const processSession = onObjectFinalized(
  {
    region: "europe-west1",
    memory: "1GiB",
    timeoutSeconds: 540,
    secrets: [geminiApiKey],
  },
  async (event) => {
    const filePath = event.data.name || "";
    const match = filePath.match(/^recordings\/([^/]+)\/(.+)$/);
    if (!match) return; // not a session recording (covers, transcripts, ...)

    const [, sessionId, fileName] = match;
    const db = getFirestore();
    const bucket = getStorage().bucket(event.data.bucket);
    const sessionRef = db.collection(SESSIONS_COLLECTION).doc(sessionId);

    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists) {
      logger.warn(`No session doc for upload ${filePath}; ignoring.`);
      return;
    }
    if (sessionSnap.data().status === "draft" || sessionSnap.data().status === "published") {
      logger.info(`Session ${sessionId} already processed; ignoring re-upload.`);
      return;
    }

    const apiKey = geminiApiKey.value();
    const ext = fileName.toLowerCase().split(".").pop();
    const mimeType = MIME_BY_EXT[ext] || event.data.contentType || "audio/mp3";

    try {
      await sessionRef.update({
        status: "processing",
        error: null,
        updatedAt: new Date().toISOString(),
      });

      // 1. Download audio from GCS and push it to the Gemini Files API.
      logger.info(`Session ${sessionId}: downloading ${filePath}`);
      const [buffer] = await bucket.file(filePath).download();

      logger.info(`Session ${sessionId}: uploading ${buffer.length} bytes to Gemini`);
      const geminiFile = await uploadToGeminiFiles(buffer, mimeType, fileName, apiKey);

      // 2. Diarized transcription with member-name hints.
      const membersSnap = await db.collection(MEMBERS_COLLECTION).get();
      const members = membersSnap.docs.map((d) => d.data());

      logger.info(`Session ${sessionId}: transcribing`);
      const transcript = await generateContent(
        [
          { file_data: { file_uri: geminiFile.uri, mime_type: mimeType } },
          { text: buildTranscriptionPrompt(members) },
        ],
        apiKey
      );

      // 3. Structured analysis from the transcript text.
      logger.info(`Session ${sessionId}: analyzing`);
      const analysisRaw = await generateContent(
        [{ text: buildAnalysisPrompt(transcript) }],
        apiKey,
        {
          responseMimeType: "application/json",
          responseSchema: ANALYSIS_SCHEMA,
        }
      );
      const parsed = JSON.parse(analysisRaw);

      // 4. Persist: full transcript as a Storage text file, excerpt + analysis
      //    in the session doc.
      const transcriptPath = `transcripts/${sessionId}.txt`;
      await bucket.file(transcriptPath).save(transcript, {
        contentType: "text/plain; charset=utf-8",
      });

      await sessionRef.update({
        status: "draft",
        transcriptPath,
        transcriptExcerpt: transcript.slice(0, 1500),
        analysis: {
          bookTitle: parsed.bookTitle || null,
          bookAuthor: parsed.bookAuthor || null,
          genre: parsed.genre || null,
          generalSummary: parsed.generalSummary || "",
          grades: reshapeGrades(parsed.grades),
          speakers: parsed.speakers || [],
          sessionSummaryMarkdown: parsed.sessionSummaryMarkdown || "",
        },
        updatedAt: new Date().toISOString(),
      });

      // Best effort cleanup of the Gemini file (they auto-expire in 48h anyway).
      fetch(`${GEMINI_BASE}/v1beta/${geminiFile.name}?key=${apiKey}`, { method: "DELETE" }).catch(
        () => {}
      );

      logger.info(`Session ${sessionId}: draft ready.`);
    } catch (err) {
      logger.error(`Session ${sessionId} failed:`, err);
      await sessionRef
        .update({
          status: "error",
          error: err.message || String(err),
          updatedAt: new Date().toISOString(),
        })
        .catch(() => {});
    }
  }
);
