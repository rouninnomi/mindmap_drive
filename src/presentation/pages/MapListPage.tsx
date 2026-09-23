import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import type { MapId } from '../../domain/mindmap/valueObjects'
import { MapName } from '../../domain/mindmap/valueObjects'
import { useMindMapCatalog } from '../hooks/useMindMapCatalog'

interface MapListPageProps {
  onOpenMap: (id: MapId) => void
}

/** マップ一覧画面: 一覧・新規作成・JSONインポート・名前変更・削除(要件定義4.1節)。 */
export function MapListPage({ onOpenMap }: MapListPageProps) {
  const { summaries, isLoading, error, createMap, importFromJson, renameMap, deleteMap } =
    useMindMapCatalog()
  const [newMapName, setNewMapName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const importFileInputRef = useRef<HTMLInputElement | null>(null)

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

  // Google DriveのJSONレスキューボタンで退避したファイル、あるいはそれを手元に保存した
  // ものを取り込んでマップに戻す(要件定義4.1節・ユーザーフィードバックにより追加)。
  // Drive上のファイルを直接選ぶ場合も、いったんローカルへダウンロードしてから
  // この入力で選択すれば同じ経路で読み込める。
  const handleImportClick = (): void => {
    importFileInputRef.current?.click()
  }

  const handleImportFileChange = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      return
    }
    setIsImporting(true)
    setImportError(null)
    try {
      const raw = await file.text()
      const id = await importFromJson(raw)
      onOpenMap(id)
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsImporting(false)
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
        <button type="button" onClick={handleImportClick} disabled={isImporting}>
          JSONから読み込む
        </button>
        <input
          ref={importFileInputRef}
          type="file"
          accept="application/json"
          className="hidden-file-input"
          onChange={(event) => void handleImportFileChange(event)}
        />
      </form>

      {isLoading && <p>読み込み中…</p>}
      {error && <p className="error-text">読み込みに失敗しました: {error.message}</p>}
      {importError && <p className="error-text">JSONの読み込みに失敗しました: {importError}</p>}
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
