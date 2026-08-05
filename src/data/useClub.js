import { useState, useEffect, useCallback } from "react";
import { onSnapshot, updateDoc } from "firebase/firestore";
import { clubBooksCollection, clubDoc, clubMemberDoc } from "./paths";

// The club document: name, invite code and roster. Members can read it;
// only admins can write, which the rules enforce.
export function useClubDoc(clubId) {
  const [club, setClub] = useState(null);
  const [loading, setLoading] = useState(!!clubId);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!clubId) {
      setClub(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribe = onSnapshot(
      clubDoc(clubId),
      (snap) => {
        setClub(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        setLoading(false);
      },
      (err) => {
        // A non-member gets permission-denied here; that is the rules working,
        // and the caller turns it into "you are not in this club".
        console.error("Failed to load club:", err);
        setError(err);
        setClub(null);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [clubId]);

  return { club, loading, error };
}

// Am I in this club, and as what? The membership doc is the authority — the
// token claim mirrors it for Storage, but can lag until the token refreshes.
export function useClubMembership(clubId, email) {
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(!!(clubId && email));

  useEffect(() => {
    if (!clubId || !email) {
      setRole(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribe = onSnapshot(
      clubMemberDoc(clubId, email),
      (snap) => {
        setRole(snap.exists() ? snap.data().role || "member" : null);
        setLoading(false);
      },
      () => {
        setRole(null);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [clubId, email]);

  return { role, isMember: role !== null, isClubAdmin: role === "admin", loading };
}

// The roster: the humans in the club's ritual, as an array on the club doc.
// Grades are keyed by roster NAME, for ever — renaming an entry does not
// rewrite history, it just relabels who appears in the grade tables.
export function useRoster(clubId) {
  const { club, loading } = useClubDoc(clubId);
  const roster = club?.roster || [];

  const saveRoster = useCallback(
    async (next) => {
      await updateDoc(clubDoc(clubId), { roster: next });
    },
    [clubId]
  );

  return { roster, loading, saveRoster };
}

// Every club I belong to, with its books — the club half of my library.
// One subscription pair per club; at a handful of clubs that is cheaper than
// any index-backed alternative, and it keeps the library live.
export function useMyClubLibraries(clubIds, email) {
  const [libraries, setLibraries] = useState([]);
  const [loading, setLoading] = useState(clubIds.length > 0);
  // Effects key off the joined ids: a fresh array with the same contents
  // must not tear down and rebuild every subscription.
  const key = clubIds.join(",");

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    if (ids.length === 0 || !email) {
      setLibraries([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const state = new Map(ids.map((id) => [id, { club: null, books: null }]));
    const emit = () => {
      const ready = [...state.entries()]
        .filter(([, v]) => v.club && v.books)
        .map(([, v]) => v);
      setLibraries(ready);
      // Usable as soon as every club has reported, rather than waiting on
      // whichever subscription is slowest to settle afterwards.
      if (ready.length === ids.length) setLoading(false);
    };

    const unsubscribes = ids.flatMap((clubId) => [
      onSnapshot(
        clubDoc(clubId),
        (snap) => {
          state.get(clubId).club = snap.exists() ? { id: snap.id, ...snap.data() } : null;
          emit();
        },
        (err) => {
          console.error(`Failed to load club ${clubId}:`, err);
          setLoading(false);
        }
      ),
      onSnapshot(
        clubBooksCollection(clubId),
        (snap) => {
          state.get(clubId).books = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          emit();
        },
        (err) => {
          console.error(`Failed to load books for club ${clubId}:`, err);
          setLoading(false);
        }
      ),
    ]);

    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [key, email]);

  return { libraries, loading };
}

// The clubs I belong to, by name — just enough for a switcher. The ids come
// from the token claim; the names have to be read, since a claim carries only
// roles and there is no listing a reader is allowed to do.
export function useMyClubs(clubIds) {
  const [clubs, setClubs] = useState([]);
  const key = clubIds.join(",");

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    if (ids.length === 0) {
      setClubs([]);
      return;
    }

    const names = new Map(ids.map((id) => [id, { id, name: id }]));
    const emit = () => setClubs(ids.map((id) => names.get(id)));

    const unsubscribes = ids.map((clubId) =>
      onSnapshot(
        clubDoc(clubId),
        (snap) => {
          // Fall back to the id: a club whose document has not arrived yet
          // should still be switchable to, not missing from the menu.
          if (snap.exists()) names.set(clubId, { id: clubId, name: snap.data().name || clubId });
          emit();
        },
        (err) => console.error(`Failed to load club ${clubId}:`, err)
      )
    );
    emit();

    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [key]);

  return clubs;
}
