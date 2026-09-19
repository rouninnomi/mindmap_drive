import type { AttachmentStorage } from '../../domain/mindmap/AttachmentStorage'
import { Attachment, type MapId } from '../../domain/mindmap/valueObjects'
import {
  createFileWithContent,
  deleteFile,
  ensureAppFolder,
  ensureFolder,
  getFileBlob,
  type AccessTokenProvider,
} from './driveApi'

/** 画像添付をまとめて保存するアプリ専用フォルダ配下のサブフォルダ名。 */
const IMAGES_FOLDER_NAME = 'images'

/**
 * `AttachmentStorage`のGoogle Drive実装。画像はマップ本体のJSONと同じアプリ専用
 * フォルダを無秩序に埋めないよう、`images/<mapId>/`というマップごとのサブフォルダ配下に
 * UUIDベースのファイル名で個別ファイルとして保存する(architecture.md 4.2節)。
 */
export class DriveAttachmentStorage implements AttachmentStorage {
  private readonly auth: AccessTokenProvider
  // 解決済みの値ではなく、進行中のPromise自体をキャッシュする。値だけをキャッシュすると、
  // 同じフォルダをほぼ同時に要求する複数の画像アップロードが両方とも「未作成」と判定し、
  // 同名のフォルダを重複作成してしまう(検索→作成の間に競合が起きるため)。
  // 同一Promiseを共有させることで、この競合を防ぐ。
  private appFolderIdPromise: Promise<string> | null = null
  private imagesFolderIdPromise: Promise<string> | null = null
  private readonly mapImagesFolderIdPromises = new Map<string, Promise<string>>()

  constructor(auth: AccessTokenProvider) {
    this.auth = auth
  }

  async upload(mapId: MapId, image: Blob): Promise<Attachment> {
    const folderId = await this.getMapImagesFolderId(mapId)
    const contentType = image.type || 'application/octet-stream'
    const fileName = `${crypto.randomUUID()}.${extensionFor(contentType)}`
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

  private getAppFolderId(): Promise<string> {
    if (!this.appFolderIdPromise) {
      this.appFolderIdPromise = ensureAppFolder(this.auth)
    }
    return this.appFolderIdPromise
  }

  private getImagesFolderId(): Promise<string> {
    if (!this.imagesFolderIdPromise) {
      this.imagesFolderIdPromise = this.getAppFolderId().then((appFolderId) =>
        ensureFolder(this.auth, IMAGES_FOLDER_NAME, appFolderId),
      )
    }
    return this.imagesFolderIdPromise
  }

  private getMapImagesFolderId(mapId: MapId): Promise<string> {
    let promise = this.mapImagesFolderIdPromises.get(mapId.value)
    if (!promise) {
      promise = this.getImagesFolderId().then((imagesFolderId) =>
        ensureFolder(this.auth, mapId.value, imagesFolderId),
      )
      this.mapImagesFolderIdPromises.set(mapId.value, promise)
    }
    return promise
  }
}

function extensionFor(mimeType: string): string {
  const subtype = mimeType.split('/')[1]
  return subtype ? subtype.split('+')[0] : 'bin'
}
