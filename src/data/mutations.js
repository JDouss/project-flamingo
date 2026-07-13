import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { db, storage, functions, SESSIONS_COLLECTION } from "./firebase";

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
// detects and offers to retry.
function invokePipeline(fn, payload, label) {
  fn(payload).catch((err) => {
    // "deadline-exceeded" here only means the *client* stopped waiting for
    // the response; the function keeps running server-side.
    if (err?.code !== "functions/deadline-exceeded") {
      console.error(`${label} invocation failed:`, err);
    }
  });
}

export function requestTranscription(sessionId) {
  invokePipeline(transcribeSessionFn, { sessionId }, "transcribeSession");
}

export function requestAnalysis(sessionId, mapping) {
  invokePipeline(analyzeSessionFn, { sessionId, mapping }, "analyzeSession");
}

// Retry a stuck or failed session at the right stage.
export async function retrySession(session) {
  if (session.transcriptPath && session.confirmedMapping) {
    requestAnalysis(session.id, session.confirmedMapping);
    return "analyzing";
  }
  if (session.transcriptPath) {
    // Transcript exists but mapping was never confirmed: reopen the mapping step.
    await updateDoc(doc(db, SESSIONS_COLLECTION, session.id), {
      status: "needs_mapping",
      error: null,
      errorStage: null,
      updatedAt: new Date().toISOString(),
    });
    return "needs_mapping";
  }
  requestTranscription(session.id);
  return "transcribing";
}

// Reopen the mapping step from a draft (e.g. a voice was misassigned).
export async function reopenMapping(sessionId) {
  await updateDoc(doc(db, SESSIONS_COLLECTION, sessionId), {
    status: "needs_mapping",
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
