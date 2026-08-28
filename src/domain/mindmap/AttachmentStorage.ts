import type { Attachment, MapId } from './valueObjects'

/**
 * ノードへの画像添付ファイルの保存を担うリポジトリインターフェース。
 * 実装(Google Drive連携)はinfrastructure層が提供する。
 */
export interface AttachmentStorage {
  upload(mapId: MapId, image: Blob): Promise<Attachment>
  /** 表示用URLの取得。 */
  getUrl(attachment: Attachment): Promise<string>
  delete(attachment: Attachment): Promise<void>
}
