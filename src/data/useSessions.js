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
// analyzed, so they behave as published.
export function sessionStatus(session) {
  return session?.status || "published";
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

// Full diarized transcript, fetched on demand. New sessions store it as a
// text file in Storage; legacy docs carry it inline.
export async function fetchTranscript(session) {
  if (!session) return "";
  if (session.transcript) return session.transcript; // legacy inline
  if (!session.transcriptPath) return "";
  const url = await getDownloadURL(ref(storage, session.transcriptPath));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Transcript download failed (${res.status})`);
  return res.text();
}
