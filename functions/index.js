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
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

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
  // 2 GiB: the function splits the audio with ffmpeg into /tmp (tmpfs, counts
  // against memory) and buffers segments before uploading them to Gemini.
  memory: "2GiB",
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

// A single generation over a 2h recording degenerates (MALFORMED_RESPONSE),
// and asking Gemini to transcribe "only minute X to Y" of a long file does
// NOT bound the work — it still ingests the whole upload. So we physically
// split the audio with ffmpeg into ~30-min segments and transcribe each
// separately; each request then contains only ~30 min of audio.
const CHUNK_SECONDS = 1800; // 30-minute segments

function buildSegmentPrompt(memberCount, segmentIndex, segmentCount) {
  return `Este es el fragmento ${segmentIndex + 1} de ${segmentCount} de la grabación de una sesión de un club de lectura en español. Transcríbelo ÍNTEGRAMENTE y de forma literal.

Formato de cada intervención (una línea por turno de palabra):
[mm:ss] [Speaker N]: texto
donde mm:ss es el minuto y segundo DENTRO DE ESTE FRAGMENTO en que empieza el turno.

Reglas de diarización:
- Numera las voces de este fragmento por orden de aparición: [Speaker 1], [Speaker 2], ...
- En la sala suele haber ${memberCount || 5} personas. NO crees una etiqueta nueva salvo que oigas una voz CLARAMENTE distinta; ante la duda, reutiliza la etiqueta existente más parecida.
- La misma voz debe llevar SIEMPRE la misma etiqueta durante todo el fragmento (fíjate en el timbre, no en el tema).
- Sin markdown, sin nombres propios en las etiquetas.

Devuelve ÚNICAMENTE la transcripción, empezando directamente por la primera intervención.`;
}

async function generateChunkWithRetry(parts, apiKey, tries = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      return await generateContent(parts, apiKey, { maxOutputTokens: 16384 });
    } catch (err) {
      lastErr = err;
      logger.warn(`Segment generation attempt ${attempt}/${tries} failed: ${err.message}`);
    }
  }
  throw lastErr;
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

// Transcribe the whole recording segment by segment. Each segment uses its
// own LOCAL speaker numbering — carrying voice identity across separate API
// calls via text hints is unreliable (a model cannot match a voice it hears
// now to a quote from another call), so unification happens afterwards in a
// dedicated text-based consolidation pass. Returns the parsed turn entries
// ({label, t, text}), or null if the audio could not be split.
async function transcribeInSegments(buffer, ext, mimeType, apiKey, memberCount, onProgress) {
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
            { text: buildSegmentPrompt(memberCount, i, total) },
          ],
          apiKey
        );
        const segEntries = parseSegment(raw, i);
        if (segEntries.length === 0) {
          logger.warn(`Segment ${i + 1}/${total} produced no speaker tags; raw starts: ${raw.slice(0, 300)}`);
          if (i === 0) {
            throw new Error(
              "La transcripción se generó pero no se reconocieron etiquetas de hablante en el primer fragmento. Revisa los logs de la función."
            );
          }
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

// Detects a diarized turn at the start of a line, tolerating the ways an LLM
// tends to drift from the requested "[mm:ss] [Speaker N]:" format: missing
// brackets, markdown bold, Spanish label words, a leading bullet, and the
// timestamp before OR after the speaker tag (or absent).
// Groups: 1-3 leading timestamp, 4 speaker number, 5-7 trailing timestamp,
// 8 spoken text.
const TS_PART = String.raw`\[?\(?(\d{1,2}):(\d{2})(?::(\d{2}))?\)?\]?`;
const SPEAKER_LINE = new RegExp(
  String.raw`^\s*(?:[-*>]\s*)?(?:${TS_PART}\s*)?` +
    String.raw`\*{0,2}_{0,2}\[?\s*(?:speaker|hablante|interlocutor|orador|participante|persona|voz)\s*(\d+)\s*\]?_{0,2}\*{0,2}` +
    String.raw`\s*(?:${TS_PART})?` +
    String.raw`\s*[:\.\-–—)]\s*(.*)$`,
  "i"
);

function tsToSeconds(a, b, c) {
  if (a === undefined) return null;
  // Two components = mm:ss (segments are 30 min); three = hh:mm:ss.
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

// Parse one segment's raw transcript into turn entries with segment-local
// voice labels ("F2-S1" = fragment 2, its Speaker 1) and ABSOLUTE seconds
// (segment offset + in-segment timestamp; null if the model omitted it).
// Continuation lines are appended to the current turn so no dialogue is lost.
function parseSegment(raw, segIndex) {
  const entries = [];
  for (const line of raw.split("\n")) {
    const m = line.match(SPEAKER_LINE);
    if (m) {
      const rel = tsToSeconds(m[1], m[2], m[3]) ?? tsToSeconds(m[5], m[6], m[7]);
      const text = m[8].replace(/^[*_\s]+/, "").trim();
      entries.push({
        label: `F${segIndex + 1}-S${m[4]}`,
        t: rel === null ? null : segIndex * CHUNK_SECONDS + rel,
        text,
      });
    } else if (entries.length > 0) {
      const cont = line.trim();
      if (cont) entries[entries.length - 1].text += " " + cont;
    }
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Voice consolidation: merge segment-local voices into global speakers
// ---------------------------------------------------------------------------

const CONSOLIDATION_SCHEMA = {
  type: "object",
  properties: {
    clusters: {
      type: "array",
      items: {
        type: "object",
        properties: {
          voices: { type: "array", items: { type: "string" } },
          rationale: { type: "string" },
        },
        required: ["voices"],
      },
    },
  },
  required: ["clusters"],
};

function buildConsolidationPrompt(transcript, labels, memberCount) {
  return `La siguiente transcripción de una sesión de un club de lectura se generó por fragmentos de audio independientes. Cada etiqueta de voz es LOCAL a su fragmento (F2-S1 = fragmento 2, su hablante 1), así que la misma persona real aparece con etiquetas distintas en fragmentos distintos, y a veces una voz se dividió en dos etiquetas dentro del mismo fragmento.

Tu tarea: agrupa las etiquetas que correspondan a la MISMA persona real.

Pistas que debes usar:
- Continuidad de la conversación en las fronteras entre fragmentos (quien hablaba al final de un fragmento suele seguir al principio del siguiente).
- Cómo se llaman entre ellos y autorreferencias ("como decía antes yo...").
- Estilo de análisis, opiniones sostenidas y muletillas de cada persona.

Reglas:
- En la sala suele haber ${memberCount || 5} personas; el número de grupos debe rondar esa cifra (nunca puede haber más grupos que personas plausibles, pero fusiona SOLO con evidencia).
- Cada etiqueta debe aparecer en EXACTAMENTE un grupo. Etiquetas: ${labels.join(", ")}.

Transcripción:
"""
${transcript}
"""`;
}

// Returns a Map label -> global speaker number (1..K, ordered by first
// appearance). Falls back to one-group-per-label if the pass fails.
async function consolidateVoices(entries, memberCount, apiKey) {
  const labels = [...new Set(entries.map((e) => e.label))];
  const identity = () => new Map(labels.map((l, i) => [l, i + 1]));
  if (labels.length <= 1) return identity();

  const firstIdx = new Map();
  entries.forEach((e, i) => {
    if (!firstIdx.has(e.label)) firstIdx.set(e.label, i);
  });

  try {
    let text = entries.map((e) => `[${e.label}]: ${e.text}`).join("\n");
    if (text.length > 300000) text = text.slice(0, 300000);
    const raw = await generateContent(
      [{ text: buildConsolidationPrompt(text, labels, memberCount) }],
      apiKey,
      { responseMimeType: "application/json", responseSchema: CONSOLIDATION_SCHEMA }
    );
    const { clusters } = JSON.parse(raw);

    const groups = (clusters || [])
      .map((c) => (c.voices || []).filter((v) => labels.includes(v)))
      .filter((g) => g.length > 0);
    groups.sort(
      (g1, g2) =>
        Math.min(...g1.map((v) => firstIdx.get(v))) - Math.min(...g2.map((v) => firstIdx.get(v)))
    );

    const map = new Map();
    let k = 0;
    for (const g of groups) {
      k += 1;
      for (const v of g) if (!map.has(v)) map.set(v, k);
    }
    for (const l of labels) if (!map.has(l)) map.set(l, ++k);
    logger.info(`Consolidated ${labels.length} local voices into ${k} speakers.`);
    return map;
  } catch (err) {
    logger.warn(`Voice consolidation failed (${err.message}); keeping per-segment voices.`);
    return identity();
  }
}

// Per-speaker evidence for the human mapping step: participation stats and
// up to 3 long excerpts spread across the session, each with its timestamp
// so the UI can seek the audio player to that exact moment.
function buildSpeakerEvidence(entries) {
  const byNum = new Map();
  let totalWords = 0;
  entries.forEach((e, idx) => {
    const words = e.text.split(/\s+/).filter(Boolean).length;
    totalWords += words;
    if (!byNum.has(e.num)) byNum.set(e.num, []);
    byNum.get(e.num).push({ ...e, words, idx });
  });

  const speakers = [...byNum.keys()].sort((a, b) => a - b).map((n) => `Speaker ${n}`);
  const stats = {};
  const excerpts = {};
  const snippets = {};

  for (const [num, turns] of byNum) {
    const tag = `Speaker ${num}`;
    const words = turns.reduce((s, t) => s + t.words, 0);
    stats[tag] = {
      turns: turns.length,
      wordShare: totalWords ? Math.round((words / totalWords) * 100) : 0,
    };

    // Longest turns, at least ~5 minutes apart so they sample different
    // moments of the session (fall back to turn index when no timestamp).
    const pos = (t) => (t.t !== null && t.t !== undefined ? t.t : t.idx * 30);
    const picked = [];
    for (const turn of [...turns].sort((a, b) => b.words - a.words)) {
      if (picked.length >= 3) break;
      if (picked.some((p) => Math.abs(pos(p) - pos(turn)) < 300)) continue;
      picked.push(turn);
    }
    picked.sort((a, b) => pos(a) - pos(b));

    excerpts[tag] = picked.map((p) => ({
      t: p.t ?? null,
      text: p.text.length > 280 ? p.text.slice(0, 280) + "…" : p.text,
    }));
    snippets[tag] = excerpts[tag][0]?.text || "Intervención breve.";
  }

  return { speakers, stats, excerpts, snippets };
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

    const membersSnap = await db.collection(MEMBERS_COLLECTION).get();
    const members = membersSnap.docs.map((d) => d.data());

    const touchLock = (note) =>
      ref.update({ status: "transcribing", progressNote: note, updatedAt: new Date().toISOString() });

    logger.info(`Session ${ref.id}: transcribing (${buffer.length} bytes) by segments`);
    let entries = await transcribeInSegments(buffer, ext, mimeType, apiKey, members.length, touchLock);

    // Fallback: ffmpeg unavailable/failed — transcribe the whole file in one
    // call (works for short recordings; long ones may hit MALFORMED_RESPONSE).
    if (entries === null) {
      logger.info(`Session ${ref.id}: single-file transcription fallback`);
      const geminiFile = await uploadToGeminiFiles(buffer, mimeType, data.audioName || "session-audio", apiKey);
      try {
        const raw = await generateChunkWithRetry(
          [
            { file_data: { file_uri: geminiFile.uri, mime_type: mimeType } },
            { text: buildSegmentPrompt(members.length, 0, 1) },
          ],
          apiKey
        );
        entries = parseSegment(raw, 0);
        if (entries.length === 0) {
          logger.error(`Session ${ref.id}: no speaker tags recognized. Raw starts:\n${raw.slice(0, 800)}`);
        }
      } finally {
        deleteGeminiFile(geminiFile.name, apiKey);
      }
    }

    if (entries.length === 0) {
      throw new Error(
        "La transcripción se generó pero no se reconocieron etiquetas de hablante. Revisa los logs de la función."
      );
    }

    // Unify segment-local voices into global speakers, then build the
    // canonical timestamped transcript every downstream step consumes.
    await touchLock("unificando voces");
    logger.info(`Session ${ref.id}: consolidating voices`);
    const clusterMap = await consolidateVoices(entries, members.length, apiKey);
    entries = entries.map((e) => ({ ...e, num: clusterMap.get(e.label) }));

    const canonical = entries
      .map((e) => (e.t !== null ? `[${fmtTime(e.t)}] ` : "") + `[Speaker ${e.num}]: ${e.text}`)
      .join("\n");

    const { speakers, stats, excerpts, snippets } = buildSpeakerEvidence(entries);
    logger.info(`Session ${ref.id}: recognized ${speakers.length} speakers (${speakers.join(", ")})`);

    // Suggested mapping (hint only — a human confirms it in the SPA).
    let suggestedMapping = {};
    try {
      logger.info(`Session ${ref.id}: suggesting speaker mapping`);
      const suggestionRaw = await generateContent(
        [{ text: buildSuggestionPrompt(canonical, members) }],
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
    await bucket.file(transcriptPath).save(canonical, {
      contentType: "text/plain; charset=utf-8",
    });

    await ref.update({
      status: "needs_mapping",
      transcriptPath,
      transcriptExcerpt: canonical.slice(0, 1500),
      detectedSpeakers: speakers,
      speakerSnippets: snippets,
      speakerExcerpts: excerpts,
      speakerStats: stats,
      suggestedMapping,
      progressNote: null,
      updatedAt: new Date().toISOString(),
    });

    logger.info(`Session ${ref.id}: transcription ready, awaiting speaker mapping.`);
    return { status: "needs_mapping", detectedSpeakers: speakers };
  } catch (err) {
    await failSession(ref, "transcription", err);
    throw new HttpsError("internal", err.message || "Transcription failed.");
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
