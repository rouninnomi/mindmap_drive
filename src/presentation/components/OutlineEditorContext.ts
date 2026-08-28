import { createContext, useContext, type KeyboardEvent } from 'react'
import type { AttachmentId, NodeId } from '../../domain/mindmap/valueObjects'

export interface OutlineEditorContextValue {
  registerInput: (id: string, el: HTMLInputElement | null) => void
  commitText: (nodeId: NodeId, text: string) => void
  handleKeyDown: (event: KeyboardEvent<HTMLInputElement>, nodeId: NodeId, currentText: string) => void
  handleToggleCollapse: (nodeId: NodeId) => void
  handleAttachClick: (nodeId: NodeId) => void
  handleRemoveAttachment: (nodeId: NodeId, attachmentId: AttachmentId) => void
}

export const OutlineEditorContext = createContext<OutlineEditorContextValue | null>(null)

export function useOutlineEditorContext(): OutlineEditorContextValue {
  const value = useContext(OutlineEditorContext)
  if (!value) {
    throw new Error('useOutlineEditorContext must be used within an OutlineEditorContext.Provider')
  }
  return value
}
