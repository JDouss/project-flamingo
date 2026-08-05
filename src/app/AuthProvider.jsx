import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, authorizedEmails } from '../data/firebase';
import { AuthContext } from './authContext';

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  // Anyone with a Google account may sign in. Authenticating is not the same
  // as being authorized: what a signed-in visitor may actually see or change
  // is decided per club, and enforced server-side by firestore.rules /
  // storage.rules. Before this, an unrecognised email was signed straight back
  // out, which left no way for a future member to reach an invite at all.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setReady(true);
    });
    return () => unsubscribe();
  }, []);

  const value = useMemo(() => {
    const ownerEmail = user ? (user.email || '').toLowerCase() : null;
    return {
      user,
      ownerEmail,
      // The club-admin gate for the legacy collections, which still key their
      // rules off this allowlist. Club membership replaces it once the
      // frontend moves onto the clubs tree; the constant dies with it.
      isAdmin: !!ownerEmail && authorizedEmails.includes(ownerEmail),
      ready,
      logout: async () => {
        try {
          await signOut(auth);
        } catch (err) {
          console.error('Log out failed:', err);
        }
      },
    };
  }, [user, ready]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
