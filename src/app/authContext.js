import { createContext, useContext } from "react";

// Auth state for the whole app. `ready` stays false until Firebase has
// reported once: without it a guarded route cannot tell "signed out" from
// "session not restored yet", and would bounce a signed-in user away on the
// first paint.
export const AuthContext = createContext({
  user: null,
  ownerEmail: null,
  // Signed in is not the same as allowed to act: `user` answers "who is
  // this?", `isAdmin` answers "may they edit the club?".
  isAdmin: false,
  ready: false,
  logout: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}
