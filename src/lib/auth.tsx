import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
  GoogleAuthProvider,
  type User,
} from 'firebase/auth'
import { auth, googleProvider } from './firebase'
import { setAccessToken } from './calendar'

interface AuthState {
  user: User | null
  loading: boolean
  authError: string | null
  signIn: () => Promise<void>
  signInAsDemo: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  authError: null,
  signIn: async () => {},
  signInAsDemo: async () => {},
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    const savedDemo = localStorage.getItem('clutch:demo_user')
    if (savedDemo) {
      try {
        setUser(JSON.parse(savedDemo))
        setLoading(false)
        return
      } catch {
        localStorage.removeItem('clutch:demo_user')
      }
    }

    return onAuthStateChanged(auth, (u) => {
      if (!localStorage.getItem('clutch:demo_user')) {
        setUser(u)
      }
      setLoading(false)
    }, (error) => {
      console.error("Firebase Auth state observer error:", error)
      setLoading(false)
    })
  }, [])

  const signIn = async () => {
    setAuthError(null)
    try {
      const result = await signInWithPopup(auth, googleProvider)
      const cred = GoogleAuthProvider.credentialFromResult(result)
      if (cred?.accessToken) setAccessToken(cred.accessToken)
      localStorage.removeItem('clutch:demo_user')
    } catch (err: any) {
      console.error('Firebase Auth Error details:', err)
      let customMsg = err.message || String(err)
      if (err.code === 'auth/unauthorized-domain' || customMsg.includes('unauthorized-domain')) {
        const currentHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
        customMsg = `Domain Unauthorized: "${currentHost}" needs to be added to Authorized Domains in your Firebase Console.`
      }
      setAuthError(customMsg)
      throw err
    }
  }

  const signInAsDemo = async () => {
    const demoUser = {
      uid: 'demo-user-123',
      displayName: 'Hacker Mode',
      email: 'hacker@clutch.dev',
      photoURL: 'https://api.dicebear.com/7.x/bottts/svg?seed=Clutch',
    } as any as User
    localStorage.setItem('clutch:demo_user', JSON.stringify(demoUser))
    setUser(demoUser)
    setAuthError(null)
  }

  const signOut = async () => {
    setAccessToken(null)
    localStorage.removeItem('clutch:demo_user')
    try {
      await fbSignOut(auth)
    } catch (e) {
      console.error("Error signing out from Firebase:", e)
    }
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, authError, signIn, signInAsDemo, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext)
}
