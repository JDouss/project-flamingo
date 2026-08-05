import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, authorizedEmails } from '../data/firebase';
import { AuthContext } from './authContext';

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  // Auth listener. This is a UX gate only: write access is enforced by
  // firestore.rules / storage.rules on the server.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        setUser(null);
        setReady(true);
        return;
      }
      const emailLower = currentUser.email ? currentUser.email.toLowerCase() : '';
      if (authorizedEmails.includes(emailLower)) {
        setUser(currentUser);
      } else {
        signOut(auth).catch((err) => console.error(err));
        setUser(null);
      }
      setReady(true);
    });
    return () => unsubscribe();
  }, []);

  const value = useMemo(
    () => ({
      user,
      ownerEmail: user ? (user.email || '').toLowerCase() : null,
      ready,
      logout: async () => {
        try {
          await signOut(auth);
        } catch (err) {
          console.error('Log out failed:', err);
        }
      },
    }),
    [user, ready]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
