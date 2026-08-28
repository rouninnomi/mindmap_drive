import { useEffect, useState } from 'react'
import type { Attachment, AttachmentId } from '../../domain/mindmap/valueObjects'
import { attachmentStorage } from '../services'

interface AttachmentViewerProps {
  attachments: readonly Attachment[]
  onRemove: (attachmentId: AttachmentId) => void
}

/** ノードに添付された画像をサムネイル表示する(要件定義4.6節)。 */
export function AttachmentViewer({ attachments, onRemove }: AttachmentViewerProps) {
  return (
    <div className="attachment-viewer">
      {attachments.map((attachment) => (
        <AttachmentThumbnail
          key={attachment.id.value}
          attachment={attachment}
          onRemove={() => onRemove(attachment.id)}
        />
      ))}
    </div>
  )
}

interface AttachmentThumbnailProps {
  attachment: Attachment
  onRemove: () => void
}

function AttachmentThumbnail({ attachment, onRemove }: AttachmentThumbnailProps) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    void attachmentStorage.getUrl(attachment).then((resolved) => {
      if (cancelled) {
        URL.revokeObjectURL(resolved)
        return
      }
      objectUrl = resolved
      setUrl(resolved)
    })
    return () => {
      cancelled = true
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [attachment])

  return (
    <div className="attachment-thumbnail">
      {url ? (
        <a href={url} target="_blank" rel="noreferrer">
          <img src={url} alt="添付画像" />
        </a>
      ) : (
        <div className="attachment-loading">読み込み中…</div>
      )}
      <button type="button" className="attachment-remove" onClick={onRemove} tabIndex={-1}>
        ×
      </button>
    </div>
  )
}
