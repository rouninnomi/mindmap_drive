import { createContext, useContext, type KeyboardEvent } from 'react'
import type { AttachmentId, NodeId } from '../../domain/mindmap/valueObjects'

export interface OutlineEditorContextValue {
  selectedNodeId: string | null
  editingNodeId: string | null
  /** Ctrl+クリック/Shift+クリックで追加された、マージ待ちの複数選択ノード群。 */
  multiSelectedIds: ReadonlySet<string>
  commitText: (nodeId: NodeId, text: string) => void
  handleWrapperClick: (nodeId: NodeId) => void
  handleWrapperCtrlClick: (nodeId: NodeId) => void
  handleWrapperShiftClick: (nodeId: NodeId) => void
  handleWrapperDoubleClick: (nodeId: NodeId) => void
  handleSelectedKeyDown: (event: KeyboardEvent<HTMLDivElement>, nodeId: NodeId) => void
  handleEditingKeyDown: (event: KeyboardEvent<HTMLInputElement>, nodeId: NodeId, currentText: string) => void
  handleToggleCollapse: (nodeId: NodeId) => void
  handleAttachClick: (nodeId: NodeId) => void
  handleRemoveAttachment: (nodeId: NodeId, attachmentId: AttachmentId) => void
  handleDropImage: (nodeId: NodeId, file: File) => void
}

export const OutlineEditorContext = createContext<OutlineEditorContextValue | null>(null)

export function useOutlineEditorContext(): OutlineEditorContextValue {
  const value = useContext(OutlineEditorContext)
  if (!value) {
    throw new Error('useOutlineEditorContext must be used within an OutlineEditorContext.Provider')
  }
  return value
}
