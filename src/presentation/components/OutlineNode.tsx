import { useEffect, useRef, useState } from 'react'
import type { Node } from '../../domain/mindmap/Node'
import { AttachmentViewer } from './AttachmentViewer'
import { useOutlineEditorContext } from './OutlineEditorContext'

interface OutlineNodeProps {
  node: Node
}

/**
 * アウトラインの1ノードを表示する再帰コンポーネント。
 *
 * テキストはキー入力のたびにドメインへ反映せず、ローカルstateにバッファして
 * blur時にのみ`commitText`でドメインへコミットする。理由:
 * ドメイン層の`updateText`呼び出しは`MindMapEditingService`のUndoスタックに
 * 積まれるため、キーストロークごとにコミットすると1文字ごとにUndo単位が
 * 増えてしまい「直前の操作を取り消す」という要件の粒度に合わなくなる。
 *
 * ただし、indent/outdent等はノードを別の親の子リストへ移動させるため、
 * React上ではDOM上の別位置への再マウントになりblurを待たずにinput自体が
 * アンマウントされてローカルの未コミットテキストが失われうる。そのため
 * 構造変更・移動を伴うキー操作の前には必ず(変更があれば)先にコミットする。
 */
export function OutlineNode({ node }: OutlineNodeProps) {
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
    <li className="outline-node">
      <div className="outline-row">
        <button
          type="button"
          className="collapse-toggle"
          onClick={() => handleToggleCollapse(node.id)}
          aria-label={node.collapsed ? '展開' : '折りたたみ'}
          tabIndex={-1}
        >
          {hasChildren ? (node.collapsed ? '▸' : '▾') : '・'}
        </button>
        <input
          ref={(el) => registerInput(node.id.value, el)}
          className="outline-input"
          type="text"
          value={localText}
          onChange={(event) => setLocalText(event.target.value)}
          onBlur={commitIfChanged}
          onKeyDown={(event) => {
            commitIfChanged()
            handleKeyDown(event, node.id, localText)
          }}
        />
        {node.attachments.length > 0 && (
          <button
            type="button"
            className="attachment-indicator"
            onClick={() => handleAttachClick(node.id)}
            aria-label="画像を追加"
            tabIndex={-1}
          >
            📷 {node.attachments.length}
          </button>
        )}
      </div>
      {node.attachments.length > 0 && (
        <AttachmentViewer
          attachments={node.attachments}
          onRemove={(attachmentId) => handleRemoveAttachment(node.id, attachmentId)}
        />
      )}
      {!node.collapsed && hasChildren && (
        <ul className="outline-children">
          {node.children.map((child) => (
            <OutlineNode key={child.id.value} node={child} />
          ))}
        </ul>
      )}
    </li>
  )
}
