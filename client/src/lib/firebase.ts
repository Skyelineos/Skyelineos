import { initializeApp, getApps } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
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

export { app };
export const auth = getAuth(app);
export const db = getFirestore(app);
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
