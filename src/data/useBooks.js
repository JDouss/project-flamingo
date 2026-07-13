import { useState, useEffect } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "./firebase";

// Live subscription to the full book catalog (small collection, realtime
// updates are effectively free at club scale).
export function useBooks() {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Safety net: if the snapshot never arrives (hung transport, offline),
    // stop showing the infinite spinner. The listener stays attached and
    // will still populate books whenever the connection recovers.
    const safetyTimeout = setTimeout(() => {
      console.warn("Books snapshot timed out; clearing loading state.");
      setLoading(false);
    }, 6000);

    const q = query(collection(db, "books"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        clearTimeout(safetyTimeout);
        setBooks(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        clearTimeout(safetyTimeout);
        console.error("Failed to load books:", err);
        setError(err);
        setLoading(false);
      }
    );
    return () => {
      clearTimeout(safetyTimeout);
      unsubscribe();
    };
  }, []);

  return { books, loading, error };
}
