import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

// These are public client identifiers (not secrets). Security is enforced by
// Firebase Auth + Firestore security rules, so it is safe to commit them.
const firebaseConfig = {
  apiKey: 'AIzaSyC-PzQkzBiSFJDwOy7nZKhMht0Ps8vDggo',
  authDomain: 'hackathon---vibe2ship.firebaseapp.com',
  projectId: 'hackathon---vibe2ship',
  storageBucket: 'hackathon---vibe2ship.firebasestorage.app',
  messagingSenderId: '566436571473',
  appId: '1:566436571473:web:0db012fdaa3f9b04778b70',
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)

export const googleProvider = new GoogleAuthProvider()
// Request Calendar access at login so two-way sync works automatically.
googleProvider.addScope('https://www.googleapis.com/auth/calendar.events')
googleProvider.addScope('https://www.googleapis.com/auth/calendar.readonly')
