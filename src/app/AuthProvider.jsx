import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '../data/firebase';
import { AuthContext } from './authContext';

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [clubs, setClubs] = useState({});
  const [ready, setReady] = useState(false);

  // Anyone with a Google account may sign in. Authenticating is not the same
  // as being authorized: what a signed-in visitor may see or change is decided
  // per club and enforced server-side by firestore.rules / storage.rules.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setClubs({});
        setReady(true);
        return;
      }
      try {
        // Force a refresh: memberships granted since this token was minted —
        // by the migration, or by joining — are only in the claim after one.
        const token = await currentUser.getIdTokenResult(true);
        setClubs(token.claims.clubs || {});
      } catch (err) {
        // A stale or unreachable token must not lock the user out of the
        // landing page; they simply appear to belong to no club yet.
        console.error('Could not read club claims:', err);
        setClubs({});
      }
      setReady(true);
    });
    return () => unsubscribe();
  }, []);

  const value = useMemo(
    () => ({
      user,
      ownerEmail: user ? (user.email || '').toLowerCase() : null,
      clubs,
      ready,
      logout: async () => {
        try {
          await signOut(auth);
        } catch (err) {
          console.error('Log out failed:', err);
        }
      },
    }),
    [user, clubs, ready]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
