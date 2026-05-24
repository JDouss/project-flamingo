import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDtS_8bF3d78uLSnRw0olxjv7ujVvEzibA";
const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "project-flamingo-497112.firebaseapp.com";
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || "project-flamingo-497112";
const storageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "project-flamingo-497112.firebasestorage.app";
const messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "158969769057";
const appId = import.meta.env.VITE_FIREBASE_APP_ID || "1:158969769057:web:aea44ec7603dbaf6894e20";

const hasConfig = apiKey && apiKey !== 'your_api_key_here' && apiKey.trim() !== '';

let app = null;
let db = null;
let storage = null;
let auth = null;
let googleProvider = null;

if (hasConfig) {
  try {
    const firebaseConfig = {
      apiKey,
      authDomain,
      projectId,
      storageBucket,
      messagingSenderId,
      appId,
    };
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    storage = getStorage(app);
    auth = getAuth(app);
    googleProvider = new GoogleAuthProvider();
  } catch (error) {
    console.error("Error initializing Firebase:", error);
  }
} else {
  console.warn("Firebase config keys are missing or incomplete. Running in Demo Mode.");
}

export { db, storage, auth, googleProvider };
export const adminEmail = import.meta.env.VITE_ADMIN_EMAIL || "doussinague95@gmail.com";

