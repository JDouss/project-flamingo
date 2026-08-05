import { initializeApp } from "firebase/app";
import { initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFunctions } from "firebase/functions";

// All values come from .env (VITE_*). Firebase web config is public by
// design, but we keep it out of the source tree anyway.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

if (!firebaseConfig.apiKey) {
  throw new Error(
    "Missing Firebase config. Copy .env.example to .env and fill in the VITE_FIREBASE_* keys."
  );
}

const app = initializeApp(firebaseConfig);

// Auto-detect long polling: some networks/browsers silently break Firestore's
// WebChannel transport right after login, leaving listeners hanging forever.
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
});
export const storage = getStorage(app);
export const auth = getAuth(app);
// Cloud Functions region must match functions/index.js CALL_OPTS.
export const functions = getFunctions(app, "europe-west1");

// Plain Google sign-in. No extra OAuth scopes: the AI pipeline runs in a
// Cloud Function with its own service account, so the browser never needs
// (or holds) a GCP access token.
export const googleProvider = new GoogleAuthProvider();

const authorizedEmailsEnv = import.meta.env.VITE_AUTHORIZED_EMAILS || "";
// UX gate only — real enforcement lives in firestore.rules / storage.rules.
export const authorizedEmails = authorizedEmailsEnv
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// Firestore and Storage locations live in ./paths — everything is club- or
// user-scoped now, so there are no root collection ids left to name here.
