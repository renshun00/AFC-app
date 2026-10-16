// src/firebase.js
import { initializeApp } from "firebase/app";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAIZ2xSHOqTUObwf09N92uCuYelAXzHezM",
  authDomain: "afc-pwa.firebaseapp.com",
  projectId: "afc-pwa",
  storageBucket: "afc-pwa.firebasestorage.app",
  messagingSenderId: "511194851888",
  appId: "1:511194851888:web:5ef836ba400b9e8985dbf5",
  measurementId: "G-Z3Q1SPFFXW"
};

// Initialize Firebase app
const app = initializeApp(firebaseConfig);

// Initialize and export services
// Persistent IndexedDB cache: reloads/reconnects serve unchanged docs locally
// and only bill for changed documents.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
export const auth = getAuth(app);
export default app;