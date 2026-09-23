import { useState } from 'react'
import './App.css'
import type { MapId } from './domain/mindmap/valueObjects'
import { LoginButton } from './presentation/components/LoginButton'
import { useGoogleAuth } from './presentation/hooks/useGoogleAuth'
import { useNewVersionAvailable } from './presentation/hooks/useNewVersionAvailable'
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
  const isNewVersionAvailable = useNewVersionAvailable()

  return (
    <>
      {isNewVersionAvailable && (
        <div className="new-version-banner">
          <span>
            新しいバージョンがあります。開けっ放しのタブは修正が反映されていない状態です。
          </span>
          <button type="button" onClick={() => window.location.reload()}>
            再読み込み
          </button>
        </div>
      )}
      {selectedMapId ? (
        <MapEditorPage mapId={selectedMapId} onBack={() => setSelectedMapId(null)} />
      ) : (
        <MapListPage onOpenMap={setSelectedMapId} />
      )}
    </>
  )
}

export default App
