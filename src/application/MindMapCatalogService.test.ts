import { describe, expect, it } from 'vitest'
import { MindMap } from '../domain/mindmap/MindMap'
import type { MindMapRepository } from '../domain/mindmap/MindMapRepository'
import { MapId, MapName, MapSummary } from '../domain/mindmap/valueObjects'
import { MindMapCatalogService } from './MindMapCatalogService'

class FakeMindMapRepository implements MindMapRepository {
  readonly maps = new Map<string, MindMap>()
  readonly deletedIds: string[] = []
  private nextFileId = 0

  create(name: MapName): Promise<MindMap> {
    const id = MapId.of(`drive-file-${this.nextFileId++}`)
    const map = MindMap.createNew(id, name)
    this.maps.set(id.value, map)
    return Promise.resolve(map)
  }

  findById(id: MapId): Promise<MindMap> {
    const map = this.maps.get(id.value)
    if (!map) {
      throw new Error(`not found: ${id.value}`)
    }
    return Promise.resolve(map)
  }

  findAllSummaries(): Promise<MapSummary[]> {
    return Promise.resolve(
      [...this.maps.values()].map((map) => MapSummary.of(map.id, map.name, map.updatedAt)),
    )
  }

  save(map: MindMap): Promise<void> {
    this.maps.set(map.id.value, map)
    return Promise.resolve()
  }

  delete(id: MapId): Promise<void> {
    this.maps.delete(id.value)
    this.deletedIds.push(id.value)
    return Promise.resolve()
  }
}

describe('MindMapCatalogService', () => {
  it('createMapで作成したマップがlistMapsに反映される', async () => {
    const repository = new FakeMindMapRepository()
    const service = new MindMapCatalogService(repository)

    const id = await service.createMap(MapName.of('新しいマップ'))
    const summaries = await service.listMaps()

    expect(summaries).toHaveLength(1)
    expect(summaries[0].id.equals(id)).toBe(true)
    expect(summaries[0].name.value).toBe('新しいマップ')
  })

  it('renameMapでマップ名を変更して保存する', async () => {
    const repository = new FakeMindMapRepository()
    const service = new MindMapCatalogService(repository)
    const id = await service.createMap(MapName.of('旧名'))

    await service.renameMap(id, MapName.of('新名'))
    const summaries = await service.listMaps()

    expect(summaries[0].name.value).toBe('新名')
  })

  it('deleteMapでリポジトリから削除する', async () => {
    const repository = new FakeMindMapRepository()
    const service = new MindMapCatalogService(repository)
    const id = await service.createMap(MapName.of('消すマップ'))

    await service.deleteMap(id)

    expect(repository.deletedIds).toEqual([id.value])
    expect(await service.listMaps()).toHaveLength(0)
  })
})
