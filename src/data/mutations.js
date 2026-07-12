import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { db, storage, SESSIONS_COLLECTION } from "./firebase";

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

// Creates the session placeholder doc, then uploads the audio. The Storage
// finalize trigger (functions/processSession) picks it up from there; the
// UI just subscribes to the doc.
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
      status: "processing",
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    await updateDoc(sessionRef, {
      status: "error",
      error: `Upload failed: ${err.message}`,
      updatedAt: new Date().toISOString(),
    }).catch(() => {});
    throw err;
  }

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
