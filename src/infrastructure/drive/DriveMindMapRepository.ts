import { MindMap } from '../../domain/mindmap/MindMap'
import type { MindMapRepository } from '../../domain/mindmap/MindMapRepository'
import { MapId, MapName, MapSummary } from '../../domain/mindmap/valueObjects'
import {
  authorizedFetch,
  createFileWithContent,
  deleteFile,
  ensureAppFolder,
  getFileContent,
  updateFileContent,
  type AccessTokenProvider,
} from './driveApi'
import { mindMapFromJson, mindMapToJson, type MindMapJson } from './mindMapJson'

const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files'
const JSON_MIME_TYPE = 'application/json'

/**
 * `MindMapRepository`のGoogle Drive実装。1マップ=1JSONファイルとして
 * アプリ専用フォルダ配下に保存する(architecture.md 4.2〜4.3節)。
 *
 * マップ名・更新日時はJSON本文だけでなくDriveファイルの`properties`にも
 * 複製して保存する。これにより`findAllSummaries`は各ファイルの本文
 * (ノード全体)をダウンロードせずに一覧を取得できる
 * (domain-model.md 4節「MapSummaryは全ノードを読み込まない」の要件に対応)。
 */
export class DriveMindMapRepository implements MindMapRepository {
  private readonly auth: AccessTokenProvider
  private appFolderId: string | null = null

  constructor(auth: AccessTokenProvider) {
    this.auth = auth
  }

  async create(name: MapName): Promise<MindMap> {
    const folderId = await this.getAppFolderId()
    const placeholder = MindMap.createNew(MapId.of('pending'), name)
    const initialJson = mindMapToJson(placeholder)
    const created = await createFileWithContent(
      this.auth,
      {
        name: `${name.value}.json`,
        parents: [folderId],
        properties: { mapName: name.value, updatedAt: initialJson.updatedAt },
      },
      new Blob([JSON.stringify(initialJson)], { type: JSON_MIME_TYPE }),
      JSON_MIME_TYPE,
    )
    const map = MindMap.createNew(MapId.of(created.id), name)
    await this.save(map)
    return map
  }

  async findById(id: MapId): Promise<MindMap> {
    const content = await getFileContent(this.auth, id.value)
    return mindMapFromJson(JSON.parse(content) as MindMapJson)
  }

  async findAllSummaries(): Promise<MapSummary[]> {
    const folderId = await this.getAppFolderId()
    const query = encodeURIComponent(
      `'${folderId}' in parents and trashed=false and mimeType='${JSON_MIME_TYPE}'`,
    )
    const response = await authorizedFetch(
      this.auth,
      `${DRIVE_FILES_URL}?q=${query}&spaces=drive&fields=files(id,properties)`,
    )
    const result = (await response.json()) as {
      files: { id: string; properties?: Record<string, string> }[]
    }
    return result.files
      .filter((file) => file.properties?.mapName && file.properties.updatedAt)
      .map((file) => {
        const properties = file.properties as Record<string, string>
        return MapSummary.of(
          MapId.of(file.id),
          MapName.of(properties.mapName),
          new Date(properties.updatedAt),
        )
      })
  }

  async save(map: MindMap): Promise<void> {
    const json = mindMapToJson(map)
    await updateFileContent(
      this.auth,
      map.id.value,
      { properties: { mapName: map.name.value, updatedAt: json.updatedAt } },
      new Blob([JSON.stringify(json)], { type: JSON_MIME_TYPE }),
      JSON_MIME_TYPE,
    )
  }

  async delete(id: MapId): Promise<void> {
    await deleteFile(this.auth, id.value)
  }

  private async getAppFolderId(): Promise<string> {
    if (!this.appFolderId) {
      this.appFolderId = await ensureAppFolder(this.auth)
    }
    return this.appFolderId
  }
}
