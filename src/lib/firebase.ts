import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Validate required config — fail loudly instead of cryptic Firebase errors
const _required = ['apiKey', 'authDomain', 'projectId'] as const;
for (const k of _required) {
    if (!firebaseConfig[k]) {
        console.error(`[Firebase] Missing env var VITE_FIREBASE_${k.replace(/([A-Z])/g, '_$1').toUpperCase()}`);
    }
}

// Guard against double-init in dev hot-reload
const app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Explicitly persist auth state in localStorage so sign-in survives page refresh
setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.warn('[Auth] Failed to set persistence:', err);
});

// Modern offline persistence — replaces deprecated enableIndexedDbPersistence().
// Uses IndexedDB cache + multi-tab support out of the box.
let db_instance;
try {
    db_instance = initializeFirestore(app, {
        localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager(),
        }),
    });
} catch {
    // Already initialized (e.g. hot-reload) — get existing instance via ESM import
    db_instance = getFirestore(app);
}
export const db = db_instance;

