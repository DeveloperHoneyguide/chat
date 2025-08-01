import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCVTkaR1JTdHi9PEwsGLZTGKnSXWs5phTQ",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "chatai-b7dc9.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "chatai-b7dc9",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "chatai-b7dc9.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "80567577416",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:80567577416:web:3d93012d15da1903b2617d",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-7EMZ9N3GTW"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Initialize Cloud Firestore and get a reference to the service
export const db = getFirestore(app);