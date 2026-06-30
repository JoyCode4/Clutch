import { useAuth } from '../lib/auth'
import { useState } from 'react'

export default function SignIn() {
  const { signIn, signInAsDemo, authError } = useAuth()
  const [loading, setLoading] = useState(false)

  const handleSignIn = async () => {
    setLoading(true)
    try {
      await signIn()
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-8 px-6 text-center">
      <div className="max-w-xl">
        <div className="mb-3 text-5xl">⚡</div>
        <h1 className="text-4xl font-bold tracking-tight text-text sm:text-5xl">
          Clutch
        </h1>
        <p className="mt-4 text-lg text-muted">
          Every other app <span className="line-through">reminds</span> you.
          Clutch reads your chaos, breaks it down, schedules it into your real
          free time, and re-plans when you slip —{' '}
          <span className="text-accent">autonomously.</span>
        </p>
      </div>

      <div className="flex flex-col items-center gap-4 w-full max-w-sm">
        <button
          onClick={handleSignIn}
          disabled={loading}
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-white px-6 py-3 font-medium text-gray-800 shadow-lg transition hover:scale-[1.02] disabled:opacity-50 cursor-pointer"
        >
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path
              fill="#FFC107"
              d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"
            />
            <path
              fill="#FF3D00"
              d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
            />
            <path
              fill="#4CAF50"
              d="M24 44c5.5 0 10.4-2.1 14.1-5.5l-6.5-5.5c-2 1.5-4.7 2.5-7.6 2.5-5.2 0-9.6-3.3-11.2-8l-6.6 5.1C9.6 39.6 16.2 44 24 44z"
            />
            <path
              fill="#1976D2"
              d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.5 5.5c-.5.4 7-5 7-15 0-1.3-.1-2.3-.4-3.5z"
            />
          </svg>
          {loading ? 'Connecting…' : 'Continue with Google'}
        </button>

        <button
          onClick={() => void signInAsDemo()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent/10 border border-accent/20 text-accent px-6 py-3 font-medium transition hover:bg-accent/20 cursor-pointer"
        >
          ✨ Enter Offline Demo Mode
        </button>
      </div>

      {authError && (
        <div className="max-w-md rounded-xl bg-red-500/10 p-5 border border-red-500/20 text-sm text-red-400 text-left">
          <p className="font-semibold text-red-300 mb-1 flex items-center gap-2">
            ⚠️ Firebase Auth Error Detected
          </p>
          <p className="mb-3 leading-relaxed text-xs font-mono bg-red-500/5 p-2 rounded border border-red-500/10 text-red-300">
            {authError}
          </p>
          
          <div className="space-y-3 text-xs text-muted leading-relaxed">
            <p>
              To authorize Google Auth for this workspace, add this active domain to your Firebase settings:
            </p>
            <div className="flex items-center gap-2 bg-black/25 p-2 rounded font-mono text-accent select-all text-center justify-between border border-white/5">
              <span>{typeof window !== 'undefined' ? window.location.hostname : 'localhost'}</span>
              <button
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    navigator.clipboard.writeText(window.location.hostname)
                  }
                }}
                className="px-2 py-1 bg-white/10 hover:bg-white/20 active:scale-95 rounded text-[10px] text-white font-sans transition cursor-pointer"
              >
                Copy
              </button>
            </div>
            <div className="bg-white/5 p-3 rounded space-y-1 text-[11px]">
              <p className="font-semibold text-white/80">How to authorize in 30 seconds:</p>
              <ol className="list-decimal pl-4 space-y-1 text-muted">
                <li>Go to the <a href="https://console.firebase.google.com/" target="_blank" rel="noreferrer" className="text-accent hover:underline font-medium">Firebase Console</a></li>
                <li>Select your project <strong>hackathon---vibe2ship</strong></li>
                <li>Go to <strong>Authentication</strong> &gt; <strong>Settings</strong> &gt; <strong>Authorized Domains</strong></li>
                <li>Click <strong>Add domain</strong> and paste the copied domain</li>
              </ol>
            </div>
            <p>
              Alternatively, you can instantly use all features with mock sync using <span className="text-accent font-medium">Offline Demo Mode</span> above!
            </p>
          </div>
        </div>
      )}

      <p className="text-sm text-muted">
        Intelligent calendar & task scheduler · Clutch
      </p>
    </div>
  )
}
