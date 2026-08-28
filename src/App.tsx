import { useState } from 'react'
import './App.css'
import type { MapId } from './domain/mindmap/valueObjects'
import { LoginButton } from './presentation/components/LoginButton'
import { useGoogleAuth } from './presentation/hooks/useGoogleAuth'
import { MapEditorPage } from './presentation/pages/MapEditorPage'
import { MapListPage } from './presentation/pages/MapListPage'

function App() {
  const { status, error, login } = useGoogleAuth()

  if (status === 'checking') {
    return <div className="app-loading">読み込み中…</div>
  }

  if (status === 'signedOut') {
    return <LoginButton onLogin={() => void login()} error={error} />
  }

  return <AuthenticatedApp />
}

function AuthenticatedApp() {
  const [selectedMapId, setSelectedMapId] = useState<MapId | null>(null)

  if (selectedMapId) {
    return <MapEditorPage mapId={selectedMapId} onBack={() => setSelectedMapId(null)} />
  }

  return <MapListPage onOpenMap={setSelectedMapId} />
}

export default App
