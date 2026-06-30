import { useAuth } from './lib/auth'
import SignIn from './features/SignIn'
import Dashboard from './features/Dashboard'

function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        Loading…
      </div>
    )
  }

  return user ? <Dashboard /> : <SignIn />
}

export default App
