import { collection, doc } from "firebase/firestore";
import { db } from "./firebase";

// Every Firestore and Storage location the app touches, in one place. Paths
// are club- or user-scoped: a club's catalog and sessions live under the club,
// a reader's log lives under the reader. Nothing is addressed by a root
// collection any more.

export const clubDoc = (clubId) => doc(db, "clubs", clubId);
export const clubBooksCollection = (clubId) => collection(db, "clubs", clubId, "books");
export const clubBookDoc = (clubId, bookId) => doc(db, "clubs", clubId, "books", bookId);
export const clubSessionsCollection = (clubId) => collection(db, "clubs", clubId, "sessions");
export const clubSessionDoc = (clubId, sessionId) => doc(db, "clubs", clubId, "sessions", sessionId);
export const clubMemberDoc = (clubId, email) => doc(db, "clubs", clubId, "members", email);

export const userReadsCollection = (email) => collection(db, "users", email, "reads");
export const userReadDoc = (email, readId) => doc(db, "users", email, "reads", readId);

// Storage. Club recordings are gated by the membership claim; voice notes by
// the owner's email. Covers stay on the shared public prefix — a book jacket
// is not personal data, and per-card signed URLs flicker on a grid.
export const recordingPath = (clubId, sessionId, fileName) =>
  `clubs/${clubId}/recordings/${sessionId}/${fileName}`;
export const voiceNotePath = (email, readId, fileName) =>
  `users/${email}/voice-notes/${readId}/${fileName}`;
export const coverPath = (fileName) => `covers/${Date.now()}_${fileName}`;
