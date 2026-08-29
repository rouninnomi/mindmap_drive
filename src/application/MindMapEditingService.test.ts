import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AttachmentStorage } from '../domain/mindmap/AttachmentStorage'
import { MindMap } from '../domain/mindmap/MindMap'
import type { MindMapRepository } from '../domain/mindmap/MindMapRepository'
import { Attachment, MapId, MapName, MapSummary, NodeText } from '../domain/mindmap/valueObjects'
import { MindMapEditingService } from './MindMapEditingService'

class FakeMindMapRepository implements MindMapRepository {
  readonly saveCalls: MindMap[] = []
  private readonly map: MindMap

  constructor(map: MindMap) {
    this.map = map
  }

  create(name: MapName): Promise<MindMap> {
    return Promise.resolve(MindMap.createNew(MapId.of('unused'), name))
  }

  findById(): Promise<MindMap> {
    return Promise.resolve(this.map)
  }

  findAllSummaries(): Promise<MapSummary[]> {
    return Promise.resolve([])
  }

  save(map: MindMap): Promise<void> {
    this.saveCalls.push(map)
    return Promise.resolve()
  }

  delete(): Promise<void> {
    return Promise.resolve()
  }
}

class FakeAttachmentStorage implements AttachmentStorage {
  upload(): Promise<Attachment> {
    return Promise.resolve(Attachment.create('fake-drive-file-id'))
  }

  getUrl(): Promise<string> {
    return Promise.resolve('blob:fake')
  }

  delete(): Promise<void> {
    return Promise.resolve()
  }
}

function topLevelTexts(map: MindMap): string[] {
  return map.rootNode.children.map((n) => n.text.value)
}

async function loadedService(): Promise<{
  service: MindMapEditingService
  repository: FakeMindMapRepository
  map: MindMap
}> {
  const map = MindMap.createNew(MapId.of('map-1'), MapName.of('編集テスト'))
  const repository = new FakeMindMapRepository(map)
  const service = new MindMapEditingService(repository, new FakeAttachmentStorage())
  await service.load(MapId.of('map-1'))
  return { service, repository, map }
}

describe('MindMapEditingService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loadするとgetSnapshotForRenderに読み込んだマップが反映される', async () => {
    const { service, map } = await loadedService()
    expect(service.getSnapshotForRender().map).toBe(map)
  })

  it('編集操作のたびにsubscribeしたリスナーへ通知する', async () => {
    const { service, map } = await loadedService()
    const listener = vi.fn()
    service.subscribe(listener)

    service.addChildNode(map.rootNode.id, NodeText.of('A'))

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('unsubscribeすると以降通知されない', async () => {
    const { service, map } = await loadedService()
    const listener = vi.fn()
    const unsubscribe = service.subscribe(listener)
    unsubscribe()

    service.addChildNode(map.rootNode.id, NodeText.of('A'))

    expect(listener).not.toHaveBeenCalled()
  })

  it('編集から1.5秒後にリポジトリへ自動保存される', async () => {
    const { service, repository, map } = await loadedService()

    service.addChildNode(map.rootNode.id, NodeText.of('A'))
    expect(repository.saveCalls).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(1500)

    expect(repository.saveCalls).toHaveLength(1)
  })

  it('デバウンス中に連続編集すると保存は1回にまとまる', async () => {
    const { service, repository, map } = await loadedService()

    service.addChildNode(map.rootNode.id, NodeText.of('A'))
    await vi.advanceTimersByTimeAsync(1000)
    service.addChildNode(map.rootNode.id, NodeText.of('B'))
    await vi.advanceTimersByTimeAsync(1000)
    service.addChildNode(map.rootNode.id, NodeText.of('C'))
    await vi.advanceTimersByTimeAsync(1500)

    expect(repository.saveCalls).toHaveLength(1)
  })

  it('undoで直前の操作を取り消し、redoでやり直せる', async () => {
    const { service, map } = await loadedService()

    const a = service.addChildNode(map.rootNode.id, NodeText.of('A'))
    service.updateText(a, NodeText.of('A編集後'))
    expect(topLevelTexts(map)).toEqual(['A編集後'])

    service.undo()
    expect(topLevelTexts(map)).toEqual(['A'])

    service.undo()
    expect(topLevelTexts(map)).toEqual([])

    service.redo()
    expect(topLevelTexts(map)).toEqual(['A'])

    service.redo()
    expect(topLevelTexts(map)).toEqual(['A編集後'])
  })

  it('undo後に新しい編集をするとredoできなくなる(redoStackがclearされる)', async () => {
    const { service, map } = await loadedService()

    service.addChildNode(map.rootNode.id, NodeText.of('A'))
    service.undo()
    expect(topLevelTexts(map)).toEqual([])

    service.addChildNode(map.rootNode.id, NodeText.of('B'))
    service.redo()

    expect(topLevelTexts(map)).toEqual(['B'])
  })

  it('moveNodeでドラッグ&ドロップの再親子付けができ、undoで取り消せる', async () => {
    const { service, map } = await loadedService()

    const a = service.addChildNode(map.rootNode.id, NodeText.of('A'))
    const b = service.addSiblingNode(a, NodeText.of('B'))
    service.moveNode(b, a)

    expect(topLevelTexts(map)).toEqual(['A'])
    expect(map.rootNode.findById(a)?.children.map((n) => n.text.value)).toEqual(['B'])

    service.undo()
    expect(topLevelTexts(map)).toEqual(['A', 'B'])
  })

  it('undoStackは上限50件を超えると古いものから破棄される', async () => {
    const { service, map } = await loadedService()

    for (let i = 0; i < 60; i++) {
      service.addChildNode(map.rootNode.id, NodeText.of(`node-${i}`))
    }
    expect(topLevelTexts(map)).toHaveLength(60)

    for (let i = 0; i < 50; i++) {
      service.undo()
    }
    // 上限50件分しか戻せないため、60件追加した状態から50回undoしても
    // 追加前(0件)までは戻らず10件残る
    expect(topLevelTexts(map)).toHaveLength(10)

    // これ以上undoしても変化しない(スタックが空)
    service.undo()
    expect(topLevelTexts(map)).toHaveLength(10)
  })

  it('flushPendingSaveはダーティ状態ならデバウンスを待たず即座に保存する', async () => {
    const { service, repository, map } = await loadedService()

    service.addChildNode(map.rootNode.id, NodeText.of('A'))
    await service.flushPendingSave()

    expect(repository.saveCalls).toHaveLength(1)

    // 保存後は自動保存タイマーもキャンセルされ、二重保存されない
    await vi.advanceTimersByTimeAsync(1500)
    expect(repository.saveCalls).toHaveLength(1)
  })

  it('ダーティでなければflushPendingSaveは何もしない', async () => {
    const { service, repository } = await loadedService()

    await service.flushPendingSave()

    expect(repository.saveCalls).toHaveLength(0)
  })

  it('canUndo/canRedoはスタックの状態を反映する', async () => {
    const { service, map } = await loadedService()

    expect(service.canUndo()).toBe(false)
    expect(service.canRedo()).toBe(false)

    const a = service.addChildNode(map.rootNode.id, NodeText.of('A'))
    expect(service.canUndo()).toBe(true)
    expect(service.canRedo()).toBe(false)

    service.undo()
    expect(service.canUndo()).toBe(false)
    expect(service.canRedo()).toBe(true)

    service.redo()
    expect(service.canUndo()).toBe(true)
    expect(service.canRedo()).toBe(false)
    expect(map.rootNode.findById(a)).toBeDefined()
  })

  it('flushPendingSave中はisSavingがtrueになる', async () => {
    const { service, repository, map } = await loadedService()
    let resolveSave: () => void = () => {}
    repository.save = () =>
      new Promise((resolve) => {
        resolveSave = resolve
      })

    service.addChildNode(map.rootNode.id, NodeText.of('A'))
    expect(service.isSaving()).toBe(false)

    const flushPromise = service.flushPendingSave()
    expect(service.isSaving()).toBe(true)

    resolveSave()
    await flushPromise

    expect(service.isSaving()).toBe(false)
  })
})
