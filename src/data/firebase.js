import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

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

export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);

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

// Firestore collection ids. Kept as the original names to avoid a data
// migration; code-level naming uses "sessions" / "members".
export const SESSIONS_COLLECTION = "transcriptions";
export const MEMBERS_COLLECTION = "speakers_registry";
