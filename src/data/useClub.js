import { useState, useEffect, useCallback } from "react";
import { onSnapshot, updateDoc } from "firebase/firestore";
import { clubDoc, clubMemberDoc } from "./paths";

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
