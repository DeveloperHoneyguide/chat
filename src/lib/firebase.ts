import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCVTkaR1JTdHi9PEwsGLZTGKnSXWs5phTQ",
  authDomain: "chatai-b7dc9.firebaseapp.com",
  projectId: "chatai-b7dc9",
  storageBucket: "chatai-b7dc9.firebasestorage.app",
  messagingSenderId: "80567577416",
  appId: "1:80567577416:web:3d93012d15da1903b2617d",
  measurementId: "G-7EMZ9N3GTW"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Initialize Cloud Firestore and get a reference to the service
export const db = getFirestore(app);