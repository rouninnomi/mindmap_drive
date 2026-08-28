import { useState, type FormEvent } from 'react'
import type { MapId } from '../../domain/mindmap/valueObjects'
import { MapName } from '../../domain/mindmap/valueObjects'
import { useMindMapCatalog } from '../hooks/useMindMapCatalog'

interface MapListPageProps {
  onOpenMap: (id: MapId) => void
}

/** マップ一覧画面: 一覧・新規作成・名前変更・削除(要件定義4.1節)。 */
export function MapListPage({ onOpenMap }: MapListPageProps) {
  const { summaries, isLoading, error, createMap, renameMap, deleteMap } = useMindMapCatalog()
  const [newMapName, setNewMapName] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const handleCreate = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const trimmed = newMapName.trim()
    if (!trimmed || isCreating) {
      return
    }
    setIsCreating(true)
    try {
      const id = await createMap(MapName.of(trimmed))
      setNewMapName('')
      onOpenMap(id)
    } finally {
      setIsCreating(false)
    }
  }

  const handleRename = async (id: MapId, currentName: string): Promise<void> => {
    const next = window.prompt('新しいマップ名', currentName)
    if (!next || !next.trim()) {
      return
    }
    await renameMap(id, MapName.of(next.trim()))
  }

  const handleDelete = async (id: MapId, name: string): Promise<void> => {
    if (!window.confirm(`「${name}」を削除しますか?`)) {
      return
    }
    await deleteMap(id)
  }

  return (
    <div className="map-list-page">
      <h1>MindMap Drive</h1>

      <form className="new-map-form" onSubmit={(event) => void handleCreate(event)}>
        <input
          type="text"
          value={newMapName}
          onChange={(event) => setNewMapName(event.target.value)}
          placeholder="新しいマップ名"
        />
        <button type="submit" disabled={isCreating || newMapName.trim().length === 0}>
          作成
        </button>
      </form>

      {isLoading && <p>読み込み中…</p>}
      {error && <p className="error-text">読み込みに失敗しました: {error.message}</p>}
      {!isLoading && !error && summaries.length === 0 && (
        <p>マップがありません。上のフォームから新しく作成してください。</p>
      )}

      <ul className="map-list">
        {summaries.map((summary) => (
          <li key={summary.id.value} className="map-list-item">
            <button
              type="button"
              className="map-open-button"
              onClick={() => onOpenMap(summary.id)}
            >
              {summary.name.value}
            </button>
            <span className="map-updated-at">{summary.updatedAt.toLocaleString()}</span>
            <button type="button" onClick={() => void handleRename(summary.id, summary.name.value)}>
              名前変更
            </button>
            <button type="button" onClick={() => void handleDelete(summary.id, summary.name.value)}>
              削除
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
