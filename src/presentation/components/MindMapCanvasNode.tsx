import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useEffect, useRef, useState, type DragEvent, type PointerEvent } from 'react'
import { CANVAS_NODE_WIDTH, type MindMapFlowNode } from '../canvasLayout'
import { AttachmentViewer } from './AttachmentViewer'
import { useOutlineEditorContext } from './OutlineEditorContext'

const CLICK_MOVE_THRESHOLD_PX = 5
const DOUBLE_CLICK_MS = 400

/**
 * キャンバス上の1ノードを表す箱型のReact Flowカスタムノード。
 *
 * 「選択(selected)」と「文字入力(editing)」を別モードとして扱う: 選択中はノード全体が
 * キーボードショートカットの対象(Tabで子ノード作成、Backspace/Deleteで削除等)になり、
 * テキストは`<input>`ではなく地の文として表示する。Enterで初めて`<input>`に切り替わり
 * 文字入力モードに入る。モードの切り替えは`selectedNodeId`/`editingNodeId`(親コンポーネントの
 * state)への反映のみを行い、実際のDOMフォーカス移動は本コンポーネント自身の`useEffect`が担う。
 * 新規作成ノードは、React Flowが寸法計測を終えるまでの数フレーム`visibility: hidden`で
 * 描画されるため、そのまま`focus()`すると失敗する。見えるようになるまで
 * `requestAnimationFrame`で再試行してからフォーカスする(この effect のコメント参照)。
 *
 * ドラッグ操作(再親子付け)とテキスト入力・ボタン操作が競合しないよう、入力欄と
 * ボタンにはReact Flowの規約に従い`nodrag`クラスを付与している(外枠の`.mindmap-node`
 * 自体、および選択時のテキスト表示部分は`nodrag`を付けず、ラベル部分をつかんでも
 * ドラッグ移動できるようにしている)。この場合、ネイティブの`click`イベントは
 * React Flow自身のドラッグ判定によって発火しないことがあるため、選択操作は
 * `onClick`ではなくpointerdown/upの移動量で自前判定している(下記ハンドラのコメント参照)。
 */
export function MindMapCanvasNode({ data }: NodeProps<MindMapFlowNode>) {
  const node = data.node
  const {
    selectedNodeId,
    editingNodeId,
    commitText,
    handleWrapperClick,
    handleWrapperDoubleClick,
    handleSelectedKeyDown,
    handleEditingKeyDown,
    handleToggleCollapse,
    handleAttachClick,
    handleRemoveAttachment,
    handleDropImage,
  } = useOutlineEditorContext()

  const isSelected = selectedNodeId === node.id.value
  const isEditing = editingNodeId === node.id.value

  const [localText, setLocalText] = useState(node.text.value)
  const lastKnownDomainTextRef = useRef(node.text.value)
  const [isDragOver, setIsDragOver] = useState(false)

  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const pointerDownPosRef = useRef<{ x: number; y: number } | null>(null)
  const lastClickAtRef = useRef(0)

  useEffect(() => {
    if (node.text.value !== lastKnownDomainTextRef.current) {
      lastKnownDomainTextRef.current = node.text.value
      setLocalText(node.text.value)
    }
  }, [node.text.value])

  // 新規作成直後のノードは、React Flowが寸法計測を終えるまでの数フレーム、
  // 内部的に`visibility: hidden`で描画される。この間に`focus()`を呼んでも
  // 静かに失敗する(既知の軽微な課題として`docs/task.md` 4.5節に記載していたものの
  // 根本原因)。見えるようになるまで`requestAnimationFrame`で再試行することで解消する。
  useEffect(() => {
    if (!isEditing) {
      if (isSelected) {
        wrapperRef.current?.focus()
      }
      return
    }
    let rafId: number | null = null
    let cancelled = false
    const tryFocus = (): void => {
      if (cancelled) {
        return
      }
      const el = inputRef.current
      if (!el) {
        return
      }
      if (getComputedStyle(el).visibility === 'hidden') {
        rafId = requestAnimationFrame(tryFocus)
        return
      }
      el.focus()
      const length = el.value.length
      el.setSelectionRange(length, length)
    }
    tryFocus()
    return () => {
      cancelled = true
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }
    }
  }, [isEditing, isSelected])

  const commitIfChanged = (): void => {
    if (localText !== node.text.value) {
      lastKnownDomainTextRef.current = localText
      commitText(node.id, localText)
    }
  }

  const hasChildren = node.children.length > 0

  const handleDragOver = (event: DragEvent<HTMLDivElement>): void => {
    if (!event.dataTransfer.types.includes('Files')) {
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setIsDragOver(true)
  }

  const handleDragLeave = (): void => {
    setIsDragOver(false)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    const file = event.dataTransfer.files[0]
    if (!file) {
      return
    }
    event.preventDefault()
    setIsDragOver(false)
    if (file.type.startsWith('image/')) {
      handleDropImage(node.id, file)
    }
  }

  // ノード本体をドラッグでつかんで再親子付けできるよう、テキスト表示部分も
  // (`nodrag`を付けず)React Flowのドラッグ対象にしている。そのため、押した位置から
  // ほぼ動かず離した場合だけを「クリック」とみなす必要がある(通常の`onClick`だと、
  // React Flow自身のドラッグ判定によってネイティブのclickイベントが発火しない
  // ことがあるため、pointerdown/upの移動量で自前判定する)。
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    pointerDownPosRef.current = { x: event.clientX, y: event.clientY }
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>): void => {
    const start = pointerDownPosRef.current
    pointerDownPosRef.current = null
    if (!start || isEditing) {
      return
    }
    const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y)
    if (distance > CLICK_MOVE_THRESHOLD_PX) {
      return
    }
    const now = Date.now()
    if (now - lastClickAtRef.current < DOUBLE_CLICK_MS) {
      lastClickAtRef.current = 0
      handleWrapperDoubleClick(node.id)
      return
    }
    lastClickAtRef.current = now
    handleWrapperClick(node.id)
  }

  return (
    <div
      ref={wrapperRef}
      className={`mindmap-node${isSelected ? ' is-selected' : ''}${isDragOver ? ' is-drag-over' : ''}`}
      style={{ width: CANVAS_NODE_WIDTH }}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onKeyDown={(event) => {
        if (!isEditing) {
          handleSelectedKeyDown(event, node.id)
        }
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Handle type="target" position={Position.Left} />
      <div className="mindmap-node-row">
        {isEditing ? (
          <input
            ref={inputRef}
            className="mindmap-node-input nodrag"
            type="text"
            value={localText}
            onChange={(event) => setLocalText(event.target.value)}
            onBlur={commitIfChanged}
            onMouseDownCapture={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              // IME変換中(isComposing)にcommitIfChangedを呼ぶと、まだ確定していない
              // 入力途中の文字列をドメインへコミットしてしまい、その結果としての
              // 再レンダリングが原因でIMEの変換が強制的に確定・中断されてしまう
              // (制御された`<input>`の`value`を変換中に書き換えると起こる既知の挙動)。
              // 変換中は何もせず、ブラウザ・IMEにそのまま処理させる。
              if (event.nativeEvent.isComposing) {
                return
              }
              commitIfChanged()
              handleEditingKeyDown(event, node.id, localText)
            }}
          />
        ) : (
          <div className="mindmap-node-text">{node.text.value || ' '}</div>
        )}
        {node.attachments.length > 0 && (
          <button
            type="button"
            className="attachment-indicator nodrag"
            onClick={() => handleAttachClick(node.id)}
            aria-label="画像を追加"
            tabIndex={-1}
          >
            📷 {node.attachments.length}
          </button>
        )}
        {hasChildren && (
          <button
            type="button"
            className="collapse-toggle nodrag"
            onClick={() => handleToggleCollapse(node.id)}
            aria-label={node.collapsed ? '展開' : '折りたたみ'}
            tabIndex={-1}
          >
            {node.collapsed ? '▸' : '▾'}
          </button>
        )}
      </div>
      {node.attachments.length > 0 && (
        <div className="nodrag">
          <AttachmentViewer
            attachments={node.attachments}
            onRemove={(attachmentId) => handleRemoveAttachment(node.id, attachmentId)}
          />
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
