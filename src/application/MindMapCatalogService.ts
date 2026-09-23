import type { MindMapRepository } from '../domain/mindmap/MindMapRepository'
import { MindMapSnapshot, type MapId, type MapName, type MapSummary } from '../domain/mindmap/valueObjects'
import { mindMapFromJson, parseMindMapJson } from '../infrastructure/drive/mindMapJson'

/**
 * マップそのものに対する操作(一覧・作成・名前変更・削除・JSONインポート)を担う
 * アプリケーションサービス(architecture.md 2.1節)。
 */
export class MindMapCatalogService {
  private readonly repository: MindMapRepository

  constructor(repository: MindMapRepository) {
    this.repository = repository
  }

  listMaps(): Promise<MapSummary[]> {
    return this.repository.findAllSummaries()
  }

  async createMap(name: MapName): Promise<MapId> {
    const map = await this.repository.create(name)
    return map.id
  }

  /**
   * JSONファイル(Drive保存形式・`MindMapEditingService.exportJson`が出力するものと同じ
   * スキーマ)からマップを新規作成する。JSON内の`id`はインポート元のファイルを指していた
   * ものであり、このマップの実体としては使わない。`repository.create`でまず新しいDrive
   * ファイル(=新しいid)を確保し、そこへ内容を差し替える(`MindMap.restoreSnapshot`を
   * Undo/Redo以外の用途で再利用: 「与えたname/root/updatedAtの状態にまるごと置き換える」
   * という意味では同じ操作のため)。ユーザーフィードバックにより追加(JSONレスキュー
   * 機能で退避した内容を、実際にマップへ戻せるようにする)。
   */
  async importFromJson(raw: string): Promise<MapId> {
    const json = parseMindMapJson(raw)
    const imported = mindMapFromJson(json)
    const created = await this.repository.create(imported.name)
    created.restoreSnapshot(MindMapSnapshot.capture(imported.name, imported.rootNode, imported.updatedAt))
    await this.repository.save(created)
    return created.id
  }

  async renameMap(id: MapId, name: MapName): Promise<void> {
    const map = await this.repository.findById(id)
    map.rename(name)
    await this.repository.save(map)
  }

  deleteMap(id: MapId): Promise<void> {
    return this.repository.delete(id)
  }
}
