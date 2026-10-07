import { useState } from 'react'
import type { UserSession } from '@core/models'
import LoginView from './components/LoginView'
import MainView from './components/MainView'

export default function App() {
  const [session, setSession] = useState<UserSession | null>(null)

  if (!session) return <LoginView onLogin={setSession} />
  return (
    <MainView
      session={session}
      onLogout={async () => {
        try { await window.api.logout() } finally { setSession(null) }
      }}
    />
  )
}
