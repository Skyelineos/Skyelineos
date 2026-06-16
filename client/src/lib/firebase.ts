import { initializeApp, getApps } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, initializeFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { getStorage, connectStorageEmulator } from "firebase/storage";

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            || 'AIzaSyA4Yad3iMPyNGMiijucmJm5j4sa5O0I0E0',
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        || 'skyelineos.firebaseapp.com',
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         || 'skyelineos',
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     || 'skyelineos.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '1062333414392',
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             || '1:1062333414392:web:cd5b4ffa2d6345b3ca340d',
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Guard against HMR double-init
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// ── App Check ────────────────────────────────────────────────────────────────
// Activates reCAPTCHA v3 attestation on Firebase requests in production. Closes
// the Security_Exposure_Assessment.md §3 finding — App Check was implemented
// but never wired into bootstrap, so a stolen web config could hammer the
// backend directly. Conditional so local dev (no key) still boots; in PROD the
// inner function bails cleanly if the key is missing (logs a warning, returns
// null) so a missing key won't crash production either.
if (import.meta.env.PROD || import.meta.env.VITE_FIREBASE_APP_CHECK_KEY) {
  // Lazy import so the App Check SDK isn't pulled into the dev bundle when the
  // feature is off — saves ~30kb on hot-reload roundtrips.
  import('./firebase-appcheck').then(({ initializeFirebaseAppCheck }) => {
    initializeFirebaseAppCheck();
  }).catch((err) => {
    console.warn('App Check init failed (continuing without):', err);
  });
}

export { app };
export const auth = getAuth(app);
// Firestore with in-memory cache (default). Persistent IndexedDB cache was
// tried but iPad Safari + multi-tab manager misbehaves in some configs and
// can leave the app stuck on first load. Performance gains from onSnapshot
// + React Query are already substantial without persistent local cache.
//
// `ignoreUndefinedProperties: true` — many forms build write payloads with
// `field || undefined` for empty optionals. Without this flag Firestore
// REJECTS the whole write ("Unsupported field value: undefined"), which e.g.
// left the estimate editor stuck on "Saving…" and silently dropped edits.
// Ignoring undefined fields makes those writes succeed (the field is simply
// omitted). Wrapped so HMR re-runs fall back to the already-initialized store.
function initDb() {
  try {
    return initializeFirestore(app, { ignoreUndefinedProperties: true });
  } catch {
    return getFirestore(app);
  }
}
export const db = initDb();
export const functions = getFunctions(app, 'us-central1');
export const storage = getStorage(app);

// Connect to emulators in development if enabled
if (import.meta.env.MODE === 'development' && import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
  try {
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, 'localhost', 8080);
    connectFunctionsEmulator(functions, 'localhost', 5001);
    connectStorageEmulator(storage, 'localhost', 9199);
  } catch {
    // Already connected
  }
}
