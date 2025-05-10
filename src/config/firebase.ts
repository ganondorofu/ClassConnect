
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCk6SxSsED59n287DbVswqgrhff-HUtj6o",
  authDomain: "tool-prototype.firebaseapp.com",
  projectId: "tool-prototype",
  storageBucket: "tool-prototype.firebasestorage.app",
  messagingSenderId: "807568903802",
  appId: "1:807568903802:web:11375abe72ae7b6314f5c3"
};

// Initialize Firebase
let app;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

const db = getFirestore(app);

export { app, db };

