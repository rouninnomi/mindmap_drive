import type { MindMapEditingService } from '../../application/MindMapEditingService'
import type { MapName } from '../../domain/mindmap/valueObjects'

interface ToolbarProps {
  mapName: MapName
  editor: MindMapEditingService
  onBack: () => void
  onRename: () => void
}

/** マップ編集画面のツールバー。戻る・名前変更・Undo/Redo・保存インジケータを提供する。 */
export function Toolbar({ mapName, editor, onBack, onRename }: ToolbarProps) {
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
      <button type="button" onClick={() => editor.undo()} disabled={!editor.canUndo()}>
        元に戻す
      </button>
      <button type="button" onClick={() => editor.redo()} disabled={!editor.canRedo()}>
        やり直す
      </button>
    </div>
  )
}
