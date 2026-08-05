import { useState, useEffect } from "react";
import { onSnapshot } from "firebase/firestore";
import { userReadsCollection } from "./paths";

// Pipeline state of a read's voice note. Reads created before the voice note
// existed (or saved without one) have no field at all — that's "idle".
export function noteStatus(read) {
  return read?.noteStatus || (read?.voiceNote ? "queued" : "idle");
}

export function isNoteWorking(read) {
  const status = noteStatus(read);
  return status === "uploading" || status === "queued" || status === "transcribing";
}

// A note stuck in a working state for longer than the callable can possibly
// run (9 min ceiling) is dead — offer a retry instead of a forever spinner.
export function isNoteStale(read) {
  if (!isNoteWorking(read)) return false;
  const lastTouch = new Date(read.updatedAt || read.createdAt || 0).getTime();
  return Date.now() - lastTouch > 15 * 60 * 1000;
}

// Live subscription to a reader's own log. The path scopes it to the owner —
// no ownerEmail filter is needed any more, and no composite index either.
// Sorting stays client-side; the collection is small.
export function usePersonalReads(ownerEmail) {
  const [reads, setReads] = useState([]);
  const [loading, setLoading] = useState(!!ownerEmail);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!ownerEmail) {
      setReads([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(
      userReadsCollection(ownerEmail),
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        // Newest read first; a book still in progress sorts by when it was
        // logged, so it doesn't sink to the bottom of the list.
        const readDate = (r) => new Date(r.finishedAt || r.startDate || r.createdAt || 0);
        list.sort((a, b) => readDate(b) - readDate(a));
        setReads(list);
        setLoading(false);
      },
      (err) => {
        console.error("Failed to load personal reads:", err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [ownerEmail]);

  return { reads, loading, error };
}
