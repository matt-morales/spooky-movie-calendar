import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { getFirestore, serverTimestamp } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyC83D3J95Xb2gXexgc1NnvoRSyOKAPi1oM",
  authDomain: "nightsofhorror-50265.firebaseapp.com",
  projectId: "nightsofhorror-50265",
  storageBucket: "nightsofhorror-50265.firebasestorage.app",
  messagingSenderId: "819294436713",
  appId: "1:819294436713:web:fbfa116bf0266cbb8991f8",
  measurementId: "G-GVJVG8MS5G",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const now = serverTimestamp;

// sign in (or reuse) anonymously on load
export const ensureAnonAuth = () =>
  new Promise<string>((resolve, reject) => {
    onAuthStateChanged(auth, async (user) => {
      if (user) return resolve(user.uid);
      try {
        const cred = await signInAnonymously(auth);
        resolve(cred.user.uid);
      } catch (e) {
        reject(e);
      }
    });
  });
