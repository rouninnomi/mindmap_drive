import type { MindMap } from './MindMap'
import type { MapId, MapSummary } from './valueObjects'

/**
 * マップの永続化を担うリポジトリインターフェース。
 * 実装(Google Drive連携)はinfrastructure層が提供する。
 */
export interface MindMapRepository {
  findById(id: MapId): Promise<MindMap>
  /** マップ一覧表示用の軽量なサマリー一覧(全ノードは読み込まない)。 */
  findAllSummaries(): Promise<MapSummary[]>
  save(map: MindMap): Promise<void>
  delete(id: MapId): Promise<void>
}
