import { useRef, useState } from 'react'
import type { MindMapEditingService } from '../../application/MindMapEditingService'
import type { MapName } from '../../domain/mindmap/valueObjects'

interface ToolbarProps {
  mapName: MapName
  editor: MindMapEditingService
  onBack: () => void
  onRename: () => void
}

const RESCUE_MESSAGE_DURATION_MS = 2000

/**
 * マップ編集画面のツールバー。戻る・名前変更・Undo/Redo・保存インジケータに加え、
 * 自動保存が効かない等アプリの挙動がおかしい時の保険として、現在の内容(未保存分も
 * 含む)をJSONとしてコピー/新しいタブで開くボタンを提供する(ユーザーフィードバックにより
 * 追加。何度か自動保存が効かず入力内容が消えた経験から、緊急避難的な手段として追加した)。
 */
export function Toolbar({ mapName, editor, onBack, onRename }: ToolbarProps) {
  const [rescueMessage, setRescueMessage] = useState<string | null>(null)
  const rescueMessageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showRescueMessage = (message: string): void => {
    if (rescueMessageTimerRef.current !== null) {
      clearTimeout(rescueMessageTimerRef.current)
    }
    setRescueMessage(message)
    rescueMessageTimerRef.current = setTimeout(() => {
      setRescueMessage(null)
      rescueMessageTimerRef.current = null
    }, RESCUE_MESSAGE_DURATION_MS)
  }

  const handleCopyJson = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(editor.exportJson())
      showRescueMessage('JSONをコピーしました')
    } catch {
      showRescueMessage('コピーに失敗しました')
    }
  }

  const handleOpenJsonInNewTab = (): void => {
    const blob = new Blob([editor.exportJson()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
  }

  return (
    <div className="toolbar">
      <button type="button" className="toolbar-back" onClick={onBack}>
        ← 一覧へ
      </button>
      <button type="button" className="toolbar-map-name" onClick={onRename}>
        {mapName.value}
      </button>
      <div className="toolbar-spacer" />
      {editor.isSaving() && <span className="toolbar-saving">保存中…</span>}
      {rescueMessage && <span className="toolbar-saving">{rescueMessage}</span>}
      <button type="button" onClick={() => editor.undo()} disabled={!editor.canUndo()}>
        元に戻す
      </button>
      <button type="button" onClick={() => editor.redo()} disabled={!editor.canRedo()}>
        やり直す
      </button>
      <button
        type="button"
        onClick={() => void handleCopyJson()}
        title="自動保存が効かない等の際の保険用: 現在の内容(未保存分も含む)をJSONとしてコピー"
      >
        JSONをコピー
      </button>
      <button
        type="button"
        onClick={handleOpenJsonInNewTab}
        title="自動保存が効かない等の際の保険用: 現在の内容(未保存分も含む)を新しいタブでJSONとして開く"
      >
        JSONを新しいタブで開く
      </button>
    </div>
  )
}
