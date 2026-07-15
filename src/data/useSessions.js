import { useState, useEffect, useCallback } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";
import { ref, getDownloadURL } from "firebase/storage";
import { db, storage, SESSIONS_COLLECTION } from "./firebase";

// Legacy docs (pre-pipeline) have no status field: they were saved fully
// analyzed, so they behave as published. "processing" (storage-trigger era)
// maps to queued; "needs_mapping" (diarization era) maps to needs_grading —
// the grading step tells the user to re-transcribe if grade data is missing.
export function sessionStatus(session) {
  const status = session?.status || "published";
  if (status === "processing") return "queued";
  if (status === "needs_mapping") return "needs_grading";
  return status;
}

// A session is stale when a working status has not been touched for longer
// than plausible. Thresholds match the server: the function refuses to
// re-enter transcribing/analyzing until its 90-minute lock expires.
const STALE_MS = {
  uploading: 15 * 60 * 1000,
  queued: 15 * 60 * 1000,
  transcribing: 90 * 60 * 1000,
  analyzing: 90 * 60 * 1000,
};

export function isSessionStale(session) {
  const status = sessionStatus(session);
  const threshold = STALE_MS[status];
  if (!threshold) return false;
  const lastTouch = new Date(session.updatedAt || session.createdAt || 0).getTime();
  return Date.now() - lastTouch > threshold;
}

// Live subscription to a single session doc — this is how the UI follows
// the Cloud Function pipeline (uploading → processing → draft → published).
export function useSession(sessionId) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(!!sessionId);

  useEffect(() => {
    if (!sessionId) {
      setSession(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribe = onSnapshot(
      doc(db, SESSIONS_COLLECTION, sessionId),
      (snap) => {
        setSession(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        setLoading(false);
      },
      (err) => {
        console.error("Failed to subscribe to session:", err);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [sessionId]);

  return { session, loading };
}

// One-shot session list for the history tab (docs are light: transcripts
// live in Storage, only an excerpt is inlined).
export function useSessionList(enabled) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const q = query(collection(db, SESSIONS_COLLECTION), orderBy("createdAt", "desc"));
      const snapshot = await getDocs(q);
      setSessions(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Failed to load session history:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) refresh();
  }, [enabled, refresh]);

  return { sessions, loading, refresh };
}

export async function fetchSessionById(sessionId) {
  const snap = await getDoc(doc(db, SESSIONS_COLLECTION, sessionId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// Full diarized transcript, fetched on demand. Prefer the named version
// (real member names); fall back to the anonymous one, then legacy inline.
export async function fetchTranscript(session) {
  if (!session) return "";
  if (session.transcript) return session.transcript; // legacy inline
  const path = session.namedTranscriptPath || session.transcriptPath;
  if (!path) return "";
  const url = await getDownloadURL(ref(storage, path));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Transcript download failed (${res.status})`);
  return res.text();
}
