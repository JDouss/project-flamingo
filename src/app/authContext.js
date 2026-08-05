import { createContext, useContext } from "react";

// Auth state for the whole app. `ready` stays false until Firebase has
// reported once: without it a guarded route cannot tell "signed out" from
// "session not restored yet", and would bounce a signed-in user away on the
// first paint.
export const AuthContext = createContext({
  user: null,
  ownerEmail: null,
  // Which clubs this account belongs to, as { clubId: 'admin' | 'member' },
  // read from the ID token's custom claim. The membership documents are the
  // authority; this is their mirror, and it is what lets the app know which
  // clubs to offer without listing a collection it has no permission to read.
  clubs: {},
  ready: false,
  logout: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}
