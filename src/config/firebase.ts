
import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getFirestore, Firestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCP0_WLGL8vG97sDnjn0E2vL2mipwrJP5o",
  authDomain: "classconnect-5f2on.firebaseapp.com",
  projectId: "classconnect-5f2on",
  storageBucket: "classconnect-5f2on.firebasestorage.app",
  messagingSenderId: "970804383570",
  appId: "1:970804383570:web:d36ade4609db8d1503348b"
};

// Define which environment variables are critical for startup IF firebaseConfig is not hardcoded
// Since firebaseConfig is hardcoded above, these checks are for future-proofing or if it's moved to env vars.
const requiredEnvVarsConfig: Record<string, { critical: boolean }> = {
  NEXT_PUBLIC_FIREBASE_API_KEY: { critical: true },
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: { critical: true },
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: { critical: true },
  NEXT_PUBLIC_FIREBASE_APP_ID: { critical: true },
  // These are not always critical for basic Firestore/Auth functionality
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: { critical: false },
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: { critical: false },
  // NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID is optional
};

const missingCriticalVars: string[] = [];
const missingNonCriticalVars: string[] = [];

// Check if environment variables are set, primarily for documentation and future-proofing
// as the provided firebaseConfig is hardcoded.
if (!firebaseConfig.apiKey && process.env.NEXT_PUBLIC_FIREBASE_API_KEY === undefined) {
  missingCriticalVars.push('NEXT_PUBLIC_FIREBASE_API_KEY (or hardcoded apiKey)');
}
if (!firebaseConfig.authDomain && process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN === undefined) {
  missingCriticalVars.push('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN (or hardcoded authDomain)');
}
if (!firebaseConfig.projectId && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID === undefined) {
  missingCriticalVars.push('NEXT_PUBLIC_FIREBASE_PROJECT_ID (or hardcoded projectId)');
}
if (!firebaseConfig.appId && process.env.NEXT_PUBLIC_FIREBASE_APP_ID === undefined) {
  missingCriticalVars.push('NEXT_PUBLIC_FIREBASE_APP_ID (or hardcoded appId)');
}

// This loop is more relevant if firebaseConfig itself was constructed from process.env
for (const envVar in requiredEnvVarsConfig) {
  // If firebaseConfig has a value, it's fine. If not, check process.env.
  const configKey = envVar.replace('NEXT_PUBLIC_FIREBASE_', '').toLowerCase().replace(/_([a-z])/g, (g) => g[1].toUpperCase());
  // @ts-ignore
  if (!firebaseConfig[configKey] && !process.env[envVar]) {
    if (requiredEnvVarsConfig[envVar].critical) {
      // Add to missingCriticalVars only if not already covered by direct checks
      if (!missingCriticalVars.some(v => v.includes(envVar.replace('NEXT_PUBLIC_FIREBASE_', '')))) {
         missingCriticalVars.push(envVar);
      }
    } else {
      missingNonCriticalVars.push(envVar);
    }
  }
}


if (missingNonCriticalVars.length > 0) {
  console.warn(
    `Firebase config warning: The following non-critical environment variable(s) are not set: ${missingNonCriticalVars.join(', ')}. Some Firebase features might not work as expected. Please set these in your .env.local file if not using the hardcoded config.`
  );
}

if (missingCriticalVars.length > 0) {
  const errorMessage = `CRITICAL_ERROR: Firebase cannot be initialized due to missing critical configuration: ${missingCriticalVars.join(', ')}. Application startup failed. Ensure these are in your .env.local file or hardcoded correctly.`;
  console.error(errorMessage);
  throw new Error(errorMessage);
}


// Initialize Firebase
let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

const db: Firestore = getFirestore(app);

export { app, db };
