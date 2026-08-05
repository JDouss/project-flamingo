import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  runTransaction,
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { db, storage, functions, SESSIONS_COLLECTION, READS_COLLECTION } from "./firebase";

// ---------- helpers ----------

// Single source of truth for the two grade scales: star rating (1-5) is
// derived from the average final debate grade (1-10).
export function ratingFromGrades(grades) {
  const values = Object.values(grades?.end || {})
    .map(Number)
    .filter((v) => !isNaN(v) && v > 0);
  if (values.length === 0) return 5;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.min(5, Math.max(1, Math.round(avg / 2)));
}

function uploadWithProgress(storageRef, file, onProgress) {
  const task = uploadBytesResumable(storageRef, file);
  return new Promise((resolve, reject) => {
    task.on(
      "state_changed",
      (snap) => {
        if (onProgress) {
          onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
        }
      },
      reject,
      async () => {
        try {
          resolve(await getDownloadURL(task.snapshot.ref));
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}

// ---------- sessions ----------

// The server pipeline runs in callable Cloud Functions. They keep running
// after the browser closes; the UI just follows the session doc.
const transcribeSessionFn = httpsCallable(functions, "transcribeSession", { timeout: 70000 });
const analyzeSessionFn = httpsCallable(functions, "analyzeSession", { timeout: 70000 });

// Fires a callable without tying the UI to its (minutes-long) completion.
// The function reports progress/errors into the session doc itself; a
// client-side invocation failure just leaves the doc stale, which the UI
// detects and offers to retry. `onFailure` lets a caller record that
// invocation failure on its own doc instead of waiting for staleness.
function invokePipeline(fn, payload, label, onFailure) {
  fn(payload).catch((err) => {
    // "deadline-exceeded" here only means the *client* stopped waiting for
    // the response; the function keeps running server-side.
    if (err?.code === "functions/deadline-exceeded") return;
    console.error(`${label} invocation failed:`, err);
    onFailure?.(err);
  });
}

export function requestTranscription(sessionId) {
  invokePipeline(transcribeSessionFn, { sessionId }, "transcribeSession");
}

// `grades` is the human-confirmed list: [{ member, round: 'start'|'end', value }]
export function requestAnalysis(sessionId, grades) {
  invokePipeline(analyzeSessionFn, { sessionId, grades }, "analyzeSession");
}

// Retry a stuck or failed session at the right stage. A transcription-stage
// failure always re-transcribes, even if older stage data exists from a
// previous run — otherwise the retry would "resume" over stale data.
export async function retrySession(session) {
  if (session.errorStage === "transcription" || !session.transcriptPath) {
    requestTranscription(session.id);
    return "transcribing";
  }
  if (session.confirmedGrades) {
    requestAnalysis(session.id, session.confirmedGrades);
    return "analyzing";
  }
  // Transcript exists but grades were never confirmed: reopen the grading step.
  await updateDoc(doc(db, SESSIONS_COLLECTION, session.id), {
    status: "needs_grading",
    error: null,
    errorStage: null,
    updatedAt: new Date().toISOString(),
  });
  return "needs_grading";
}

// Reopen the grade-assignment step from a draft (e.g. a mark was misassigned).
export async function reopenGrading(sessionId) {
  await updateDoc(doc(db, SESSIONS_COLLECTION, sessionId), {
    status: "needs_grading",
    updatedAt: new Date().toISOString(),
  });
}

// Creates the session placeholder doc, uploads the audio, then kicks off
// the transcription function.
export async function startSessionUpload(file, onProgress) {
  const sessionRef = doc(collection(db, SESSIONS_COLLECTION));
  const audioPath = `recordings/${sessionRef.id}/${file.name}`;

  await setDoc(sessionRef, {
    status: "uploading",
    audioName: file.name,
    audioPath,
    bookId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  try {
    const audioUrl = await uploadWithProgress(ref(storage, audioPath), file, onProgress);
    await updateDoc(sessionRef, {
      audioUrl,
      status: "queued",
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    await updateDoc(sessionRef, {
      status: "error",
      errorStage: "upload",
      error: `Upload failed: ${err.message}`,
      updatedAt: new Date().toISOString(),
    }).catch(() => {});
    throw err;
  }

  requestTranscription(sessionRef.id);
  return sessionRef.id;
}

export async function updateSessionDraft(sessionId, analysis) {
  await updateDoc(doc(db, SESSIONS_COLLECTION, sessionId), {
    analysis,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteSession(sessionId) {
  await deleteDoc(doc(db, SESSIONS_COLLECTION, sessionId));
}

async function markSessionPublished(sessionId, bookId) {
  await updateDoc(doc(db, SESSIONS_COLLECTION, sessionId), {
    status: "published",
    bookId,
    updatedAt: new Date().toISOString(),
  });
}

// Publish a reviewed session draft as a brand-new book review.
export async function publishSessionAsNewBook(session, analysis) {
  const today = new Date().toISOString().split("T")[0];
  const grades = analysis.grades || { start: {}, end: {} };

  const bookRef = await addDoc(collection(db, "books"), {
    title: (analysis.bookTitle || "Nueva Reseña de Sesión").trim(),
    author: (analysis.bookAuthor || "Autor Desconocido").trim(),
    genre: (analysis.genre || "Debate").trim(),
    sessionLabel: (analysis.sessionLabel || "").trim() || null,
    rating: ratingFromGrades(grades),
    status: "completed",
    startDate: today,
    endDate: today,
    summary: analysis.generalSummary || "",
    review: "",
    privateNotes: analysis.sessionSummaryMarkdown || "",
    grades,
    imageUrl:
      "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?auto=format&fit=crop&q=80&w=300",
    quotes: [],
    references: [],
    transcriptionId: session.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  await markSessionPublished(session.id, bookRef.id);
  return bookRef.id;
}

// Publish a reviewed session draft onto an existing book review.
export async function publishSessionToBook(session, analysis, book) {
  const grades = analysis.grades || { start: {}, end: {} };
  const update = {
    privateNotes: analysis.sessionSummaryMarkdown || "",
    grades,
    rating: ratingFromGrades(grades),
    transcriptionId: session.id,
    updatedAt: new Date().toISOString(),
  };
  if (analysis.sessionLabel && analysis.sessionLabel.trim()) {
    update.sessionLabel = analysis.sessionLabel.trim();
  }
  // Don't clobber an existing synopsis.
  if (analysis.generalSummary && !book.summary) {
    update.summary = analysis.generalSummary;
  }

  await updateDoc(doc(db, "books", book.id), update);
  await markSessionPublished(session.id, book.id);
  return book.id;
}

// ---------- books ----------

export async function saveBook(bookId, bookData) {
  if (bookId) {
    await updateDoc(doc(db, "books", bookId), bookData);
    return bookId;
  }
  const bookRef = await addDoc(collection(db, "books"), bookData);
  return bookRef.id;
}

export async function deleteBook(bookId) {
  await deleteDoc(doc(db, "books", bookId));
}

export async function uploadCover(file, onProgress) {
  const path = `covers/${Date.now()}_${file.name}`;
  return uploadWithProgress(ref(storage, path), file, onProgress);
}

export async function linkSessionToBook(sessionId, bookId) {
  await updateDoc(doc(db, SESSIONS_COLLECTION, sessionId), {
    bookId,
    updatedAt: new Date().toISOString(),
  });
}

// ---------- personal reading log ----------

const analyzeReadingNoteFn = httpsCallable(functions, "analyzeReadingNote", { timeout: 70000 });

// An invocation that never reaches the analysis itself — signed-out session,
// a rejected precondition, a dropped connection — leaves the doc sitting in
// `queued`, where the UI spins for the whole 15-minute staleness window
// before it offers a retry. Record the failure on the doc instead, so the
// message and the retry button show up straight away.
async function markNoteFailed(readId, err) {
  const readRef = doc(db, READS_COLLECTION, readId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(readRef);
      if (!snap.exists()) return;
      // Once the function has claimed the doc it owns the outcome: it writes
      // its own error on failure, so a connection that died *after* the call
      // went through must not overwrite a live run or a finished one.
      const status = snap.data().noteStatus;
      if (status === "transcribing" || status === "ready") return;
      tx.update(readRef, {
        noteStatus: "error",
        errorStage: "invocation",
        error: err?.message || "No se pudo iniciar el análisis de la nota.",
        updatedAt: new Date().toISOString(),
      });
    });
  } catch (writeErr) {
    console.error("Could not record note analysis failure:", writeErr);
  }
}

// Same fire-and-forget contract as the club pipeline: the function keeps
// running server-side and reports progress onto the doc, so closing the tab
// mid-analysis loses nothing.
export function requestNoteAnalysis(readId) {
  invokePipeline(analyzeReadingNoteFn, { readId }, "analyzeReadingNote", (err) =>
    markNoteFailed(readId, err)
  );
}

export async function savePersonalRead(readId, readData) {
  if (readId) {
    await updateDoc(doc(db, READS_COLLECTION, readId), readData);
    return readId;
  }
  const readRef = await addDoc(collection(db, READS_COLLECTION), readData);
  return readRef.id;
}

// Voice notes live under a private Storage prefix (see storage.rules) keyed
// by read id, so deleting a read can clean up after itself.
export async function uploadVoiceNote(readId, file, onProgress) {
  const safeName = file.name.replace(/[^\w.-]+/g, "_");
  const audioPath = `voice-notes/${readId}/${Date.now()}_${safeName}`;
  await uploadWithProgress(ref(storage, audioPath), file, onProgress);
  return { audioPath, audioName: file.name, uploadedAt: new Date().toISOString() };
}

export async function deleteVoiceNoteAudio(audioPath) {
  if (!audioPath) return;
  // Best effort: a missing object must not block replacing or deleting a read.
  await deleteObject(ref(storage, audioPath)).catch((err) => {
    console.warn("Voice note cleanup failed:", err);
  });
}

// Attach (or replace) a voice note and kick off the analysis.
export async function attachVoiceNote(readId, file, onProgress, previousAudioPath) {
  await updateDoc(doc(db, READS_COLLECTION, readId), {
    noteStatus: "uploading",
    error: null,
    errorStage: null,
    updatedAt: new Date().toISOString(),
  });

  const voiceNote = await uploadVoiceNote(readId, file, onProgress);

  await updateDoc(doc(db, READS_COLLECTION, readId), {
    voiceNote,
    noteStatus: "queued",
    // A re-recording invalidates whatever the previous audio produced.
    transcript: "",
    insights: null,
    updatedAt: new Date().toISOString(),
  });

  if (previousAudioPath && previousAudioPath !== voiceNote.audioPath) {
    await deleteVoiceNoteAudio(previousAudioPath);
  }

  requestNoteAnalysis(readId);
  return voiceNote;
}

export async function deletePersonalRead(read) {
  await deleteDoc(doc(db, READS_COLLECTION, read.id));
  await deleteVoiceNoteAudio(read.voiceNote?.audioPath);
}

export async function fetchVoiceNoteUrl(audioPath) {
  if (!audioPath) return "";
  return getDownloadURL(ref(storage, audioPath));
}

// ---------- migration (temporary) ----------

// The one-off copy of Flamingo Rock into the clubs/users tree. Owner-only and
// idempotent server-side; it returns per-collection source and copied counts,
// which is what the cutover is verified against. Removed together with the
// callable once the legacy copies go.
const migrateFlamingoFn = httpsCallable(functions, "migrateFlamingo", { timeout: 540000 });

export async function runFlamingoMigration() {
  const res = await migrateFlamingoFn();
  return res.data;
}
