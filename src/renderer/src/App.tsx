import { useState } from 'react'
import type { UserSession } from '@core/models'
import LoginView from './components/LoginView'
import MainView from './components/MainView'
import type { Profile } from '@core/models'

export default function App() {
  const [session, setSession] = useState<UserSession | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)

  if (!session) return <LoginView onLogin={(s) => { setSession(s); void window.api.getAuthState().then((a) => setProfile(a.profiles.find((p) => p.id === a.selectedProfileId) ?? null)) }} />
  return (
    <MainView
      session={session}
      profile={profile}
      onLogout={async () => {
        try {
          await window.api.logout()
          const auth = await window.api.getAuthState()
          await window.api.saveAuthState({ ...auth, dontSignOut: false })
        } finally { setSession(null); setProfile(null) }
      }}
    />
  )
}
