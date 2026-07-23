// ==========================================================================
// Firebase setup
// ==========================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyC-KnNulgyU07YwiguSpQgdCle_iEvAJF8",
  authDomain: "market-place-app-332b1.firebaseapp.com",
  projectId: "market-place-app-332b1",
  storageBucket: "market-place-app-332b1.firebasestorage.app",
  messagingSenderId: "117473393960",
  appId: "1:117473393960:web:67297a2b11e2786ad3641d"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export function whenAuthReady(callback) {
  onAuthStateChanged(auth, (user) => callback(user));
}