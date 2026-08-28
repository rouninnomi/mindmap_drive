import type { AttachmentStorage } from '../../domain/mindmap/AttachmentStorage'
import { Attachment, type MapId } from '../../domain/mindmap/valueObjects'
import {
  createFileWithContent,
  deleteFile,
  ensureAppFolder,
  getFileBlob,
  type AccessTokenProvider,
} from './driveApi'

/**
 * `AttachmentStorage`のGoogle Drive実装。画像はマップ本体のJSONと同じ
 * アプリ専用フォルダ配下に、UUIDベースのファイル名で個別ファイルとして
 * 保存する(architecture.md 4.2節)。
 */
export class DriveAttachmentStorage implements AttachmentStorage {
  private readonly auth: AccessTokenProvider
  private appFolderId: string | null = null

  constructor(auth: AccessTokenProvider) {
    this.auth = auth
  }

  async upload(mapId: MapId, image: Blob): Promise<Attachment> {
    const folderId = await this.getAppFolderId()
    const contentType = image.type || 'application/octet-stream'
    const fileName = `${mapId.value}_${crypto.randomUUID()}.${extensionFor(contentType)}`
    const created = await createFileWithContent(
      this.auth,
      { name: fileName, parents: [folderId], mimeType: contentType },
      image,
      contentType,
    )
    return Attachment.create(created.id)
  }

  /**
   * 表示用URLを取得する。`drive.file`スコープでは公開リンクを発行しないため、
   * 認可付きリクエストで画像本体を取得し、`Blob URL`として返す
   * (呼び出し側は不要になったら`URL.revokeObjectURL`で解放する)。
   */
  async getUrl(attachment: Attachment): Promise<string> {
    const blob = await getFileBlob(this.auth, attachment.driveFileId)
    return URL.createObjectURL(blob)
  }

  async delete(attachment: Attachment): Promise<void> {
    await deleteFile(this.auth, attachment.driveFileId)
  }

  private async getAppFolderId(): Promise<string> {
    if (!this.appFolderId) {
      this.appFolderId = await ensureAppFolder(this.auth)
    }
    return this.appFolderId
  }
}

function extensionFor(mimeType: string): string {
  const subtype = mimeType.split('/')[1]
  return subtype ? subtype.split('+')[0] : 'bin'
}
