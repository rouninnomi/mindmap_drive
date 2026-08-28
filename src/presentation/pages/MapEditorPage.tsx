import { useCallback, useEffect, useMemo, useRef, type ChangeEvent, type KeyboardEvent } from 'react'
import type { AttachmentId, MapId, NodeId } from '../../domain/mindmap/valueObjects'
import { MapName, NodeText } from '../../domain/mindmap/valueObjects'
import { OutlineEditorContext, type OutlineEditorContextValue } from '../components/OutlineEditorContext'
import { OutlineNode } from '../components/OutlineNode'
import { Toolbar } from '../components/Toolbar'
import { useMindMapEditor } from '../hooks/useMindMapEditor'
import { flattenVisibleNodes } from '../outlineTree'

interface MapEditorPageProps {
  mapId: MapId
  onBack: () => void
}

/**
 * マップ編集画面: アウトライン編集UI・キーボードショートカット(要件定義4.3節)。
 *
 * 要件定義4.3節の表と異なる点(通常のテキスト入力と衝突するため実装時に調整した):
 * - 折りたたみ/展開: 表では「/」または「F」だが、テキスト入力中に文字として
 *   衝突するため`Ctrl+/`に変更
 * - 画像添付: 表では「I」だが、同様の理由で`Ctrl+I`に変更
 * - ノード間移動の←→: テキストカーソルの左右移動という標準動作を優先し、
 *   ノード間移動には割り当てない(↑↓のみノード間移動に使う)
 * - Esc(「ルートに戻る/表示リセット」): v1にズーム機能はないため、
 *   フォーカスを外す(blur)動作として扱う
 */
export function MapEditorPage({ mapId, onBack }: MapEditorPageProps) {
  const { snapshot, editor } = useMindMapEditor(mapId)

  const inputsRef = useRef(new Map<string, HTMLInputElement>())
  const pendingFocusRef = useRef<string | null>(null)
  const attachTargetRef = useRef<NodeId | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const flattened = useMemo(() => {
    if (!snapshot.map) {
      return []
    }
    return flattenVisibleNodes(snapshot.map.rootNode)
    // snapshot.mapは同一インスタンスのまま内部でミューテートされるため、
    // snapshot.version(編集のたびに増える)も依存に含めないと再計算されない。
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.map, snapshot.version])

  // マップ読み込み直後、トップレベルノードが1つもなければ最初の空ノードを用意する
  // (「思考のスピードを止めない」ため、すぐ入力を始められるようにする)。
  useEffect(() => {
    if (snapshot.map && snapshot.map.rootNode.children.length === 0) {
      const newId = editor.addChildNode(snapshot.map.rootNode.id, NodeText.empty())
      pendingFocusRef.current = newId.value
    }
  }, [snapshot.map, editor])

  // 構造的な変更(ノード追加・削除・インデント等)の直後にフォーカスを復元する。
  useEffect(() => {
    const id = pendingFocusRef.current
    if (id) {
      pendingFocusRef.current = null
      inputsRef.current.get(id)?.focus()
    }
  }, [snapshot.version])

  const registerInput = useCallback((id: string, el: HTMLInputElement | null) => {
    if (el) {
      inputsRef.current.set(id, el)
    } else {
      inputsRef.current.delete(id)
    }
  }, [])

  const commitText = useCallback(
    (nodeId: NodeId, text: string) => {
      editor.updateText(nodeId, NodeText.of(text))
    },
    [editor],
  )

  const handleToggleCollapse = useCallback(
    (nodeId: NodeId) => {
      editor.toggleCollapse(nodeId)
    },
    [editor],
  )

  const handleAttachClick = useCallback((nodeId: NodeId) => {
    attachTargetRef.current = nodeId
    fileInputRef.current?.click()
  }, [])

  const handleRemoveAttachment = useCallback(
    (nodeId: NodeId, attachmentId: AttachmentId) => {
      editor.removeAttachment(nodeId, attachmentId)
    },
    [editor],
  )

  const handleFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      const targetId = attachTargetRef.current
      event.target.value = ''
      attachTargetRef.current = null
      if (file && targetId) {
        void editor.attachImage(targetId, file)
      }
    },
    [editor],
  )

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>, nodeId: NodeId, currentText: string) => {
      const isCtrlOrCmd = event.ctrlKey || event.metaKey

      if (isCtrlOrCmd && !event.shiftKey && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        // Undo/Redoは構造変更を伴いinputが再マウントされうるため、同じノードIDへの
        // フォーカス復元を試みる(存在しなくなっていれば単に何も起きない)。
        pendingFocusRef.current = nodeId.value
        editor.undo()
        return
      }
      if (
        isCtrlOrCmd &&
        (event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z'))
      ) {
        event.preventDefault()
        pendingFocusRef.current = nodeId.value
        editor.redo()
        return
      }
      if (isCtrlOrCmd && event.key === 'ArrowUp') {
        event.preventDefault()
        editor.moveUp(nodeId)
        pendingFocusRef.current = nodeId.value
        return
      }
      if (isCtrlOrCmd && event.key === 'ArrowDown') {
        event.preventDefault()
        editor.moveDown(nodeId)
        pendingFocusRef.current = nodeId.value
        return
      }
      if (isCtrlOrCmd && event.key === '/') {
        event.preventDefault()
        editor.toggleCollapse(nodeId)
        return
      }
      if (isCtrlOrCmd && event.key.toLowerCase() === 'i') {
        event.preventDefault()
        attachTargetRef.current = nodeId
        fileInputRef.current?.click()
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        const newId = editor.addSiblingNode(nodeId, NodeText.empty())
        pendingFocusRef.current = newId.value
        return
      }
      if (event.key === 'Tab') {
        event.preventDefault()
        if (event.shiftKey) {
          editor.outdent(nodeId)
        } else {
          editor.indent(nodeId)
        }
        pendingFocusRef.current = nodeId.value
        return
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        if (currentText !== '') {
          return
        }
        event.preventDefault()
        const index = flattened.findIndex((n) => n.id.equals(nodeId))
        const fallback = flattened[index - 1] ?? flattened[index + 1] ?? null
        editor.deleteNode(nodeId)
        pendingFocusRef.current = fallback ? fallback.id.value : null
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        const index = flattened.findIndex((n) => n.id.equals(nodeId))
        const prev = flattened[index - 1]
        if (prev) {
          inputsRef.current.get(prev.id.value)?.focus()
        }
        return
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        const index = flattened.findIndex((n) => n.id.equals(nodeId))
        const next = flattened[index + 1]
        if (next) {
          inputsRef.current.get(next.id.value)?.focus()
        }
        return
      }
      if (event.key === 'Escape') {
        event.currentTarget.blur()
      }
    },
    [editor, flattened],
  )

  const handleRename = useCallback(() => {
    if (!snapshot.map) {
      return
    }
    const next = window.prompt('新しいマップ名', snapshot.map.name.value)
    if (!next || !next.trim()) {
      return
    }
    editor.rename(MapName.of(next.trim()))
  }, [editor, snapshot.map])

  const contextValue: OutlineEditorContextValue = useMemo(
    () => ({
      registerInput,
      commitText,
      handleKeyDown,
      handleToggleCollapse,
      handleAttachClick,
      handleRemoveAttachment,
    }),
    [registerInput, commitText, handleKeyDown, handleToggleCollapse, handleAttachClick, handleRemoveAttachment],
  )

  if (!snapshot.map) {
    return <div className="map-editor-loading">読み込み中…</div>
  }

  return (
    <div className="map-editor-page">
      <Toolbar
        mapName={snapshot.map.name}
        editor={editor}
        onBack={onBack}
        onRename={handleRename}
      />
      <OutlineEditorContext.Provider value={contextValue}>
        <ul className="outline-root">
          {snapshot.map.rootNode.children.map((child) => (
            <OutlineNode key={child.id.value} node={child} />
          ))}
        </ul>
      </OutlineEditorContext.Provider>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden-file-input"
        onChange={handleFileInputChange}
      />
    </div>
  )
}
