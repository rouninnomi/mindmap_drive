import type { MindMap } from './MindMap'
import type { MapId, MapName, MapSummary } from './valueObjects'

/**
 * マップの永続化を担うリポジトリインターフェース。
 * 実装(Google Drive連携)はinfrastructure層が提供する。
 */
export interface MindMapRepository {
  /**
   * 新しいマップを作成して永続化し、割り当てられたMapIdを含むMindMapを返す。
   * MapId = Google DriveのfileId(architecture.md 4.2節)であるため、
   * IDの割り当ては実際にDrive上へファイルを作成する実装側でしか行えない。
   * そのためアプリケーション層がMapIdを事前に採番することはできず、
   * 生成そのものをリポジトリの責務としている。
   */
  create(name: MapName): Promise<MindMap>
  findById(id: MapId): Promise<MindMap>
  /** マップ一覧表示用の軽量なサマリー一覧(全ノードは読み込まない)。 */
  findAllSummaries(): Promise<MapSummary[]>
  save(map: MindMap): Promise<void>
  delete(id: MapId): Promise<void>
}
