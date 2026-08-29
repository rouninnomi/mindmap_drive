import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useEffect, useRef, useState } from 'react'
import { CANVAS_NODE_WIDTH, type MindMapFlowNode } from '../canvasLayout'
import { AttachmentViewer } from './AttachmentViewer'
import { useOutlineEditorContext } from './OutlineEditorContext'

/**
 * キャンバス上の1ノードを表す箱型のReact Flowカスタムノード。
 *
 * テキストのローカルバッファ・blur時コミットの方針は旧`OutlineNode`と同じ
 * (`commitIfChanged`のコメント参照)。ドラッグ操作(再親子付け)と
 * テキスト入力・ボタン操作が競合しないよう、入力欄とボタンには
 * React Flowの規約に従い`nodrag`クラスを付与している。
 */
export function MindMapCanvasNode({ data }: NodeProps<MindMapFlowNode>) {
  const node = data.node
  const {
    registerInput,
    commitText,
    handleKeyDown,
    handleToggleCollapse,
    handleAttachClick,
    handleRemoveAttachment,
  } = useOutlineEditorContext()

  const [localText, setLocalText] = useState(node.text.value)
  const lastKnownDomainTextRef = useRef(node.text.value)

  useEffect(() => {
    if (node.text.value !== lastKnownDomainTextRef.current) {
      lastKnownDomainTextRef.current = node.text.value
      setLocalText(node.text.value)
    }
  }, [node.text.value])

  const commitIfChanged = (): void => {
    if (localText !== node.text.value) {
      lastKnownDomainTextRef.current = localText
      commitText(node.id, localText)
    }
  }

  const hasChildren = node.children.length > 0

  return (
    <div className="mindmap-node" style={{ width: CANVAS_NODE_WIDTH }}>
      <Handle type="target" position={Position.Left} />
      <div className="mindmap-node-row">
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
        <input
          ref={(el) => registerInput(node.id.value, el)}
          className="mindmap-node-input nodrag"
          type="text"
          value={localText}
          onChange={(event) => setLocalText(event.target.value)}
          onBlur={commitIfChanged}
          onMouseDownCapture={(event) => event.stopPropagation()}
          onClick={(event) => event.currentTarget.focus()}
          onKeyDown={(event) => {
            commitIfChanged()
            handleKeyDown(event, node.id, localText)
          }}
        />
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
