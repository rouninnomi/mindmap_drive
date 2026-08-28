import type { MindMapRepository } from '../domain/mindmap/MindMapRepository'
import type { MapId, MapName, MapSummary } from '../domain/mindmap/valueObjects'

/**
 * マップそのものに対する操作(一覧・作成・名前変更・削除)を担う
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

  async renameMap(id: MapId, name: MapName): Promise<void> {
    const map = await this.repository.findById(id)
    map.rename(name)
    await this.repository.save(map)
  }

  deleteMap(id: MapId): Promise<void> {
    return this.repository.delete(id)
  }
}
