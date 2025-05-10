
import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getFirestore, Firestore } from "firebase/firestore";

// Define which environment variables are critical for startup
const requiredEnvVarsConfig: Record<string, { critical: boolean }> = {
  NEXT_PUBLIC_FIREBASE_API_KEY: { critical: true },
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: { critical: true },
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: { critical: true }, // Fundamental for identifying the project
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: { critical: false }, // May not be used by all features
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: { critical: false }, // May not be used by all features
  NEXT_PUBLIC_FIREBASE_APP_ID: { critical: true },
  // NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID is optional
};

const missingCriticalVars: string[] = [];
const missingNonCriticalVars: string[] = [];

for (const envVar in requiredEnvVarsConfig) {
  if (!process.env[envVar]) {
    if (requiredEnvVarsConfig[envVar].critical) {
      missingCriticalVars.push(envVar);
    } else {
      missingNonCriticalVars.push(envVar);
    }
  }
}

if (missingNonCriticalVars.length > 0) {
  console.warn(
    `Firebase config warning: The following non-critical environment variable(s) are not set: ${missingNonCriticalVars.join(', ')}. Some Firebase features might not work as expected. Please set these in your .env.local file.`
  );
}

if (missingCriticalVars.length > 0) {
  const errorMessage = `CRITICAL_ERROR: Firebase cannot be initialized due to missing critical environment variable(s): ${missingCriticalVars.join(', ')}. Application startup failed. Please set these in your .env.local file.`;
  console.error(errorMessage);
  throw new Error(errorMessage); // Fail fast if critical Firebase config is missing
}

// At this point, all critical environment variables are guaranteed to be set.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID // Optional
};

// Initialize Firebase
let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

const db: Firestore = getFirestore(app);

export { app, db };

