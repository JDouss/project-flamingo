import { createContext, useContext } from "react";

// Auth state for the whole app. `ready` stays false until Firebase has
// reported once: without it a guarded route cannot tell "signed out" from
// "session not restored yet", and would bounce a signed-in user away on the
// first paint.
export const AuthContext = createContext({
  user: null,
  ownerEmail: null,
  ready: false,
  logout: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}
