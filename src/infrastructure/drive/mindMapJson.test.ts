import { describe, expect, it } from 'vitest'
import { MindMap } from '../../domain/mindmap/MindMap'
import { Attachment, MapId, MapName, NodeText } from '../../domain/mindmap/valueObjects'
import { mindMapFromJson, mindMapToJson, parseMindMapJson } from './mindMapJson'

describe('mindMapJson', () => {
  it('MindMapをJSONへ変換し、そこから元と同じ状態のMindMapを復元できる', () => {
    const map = MindMap.createNew(MapId.of('drive-file-1'), MapName.of('往復テスト'))
    const a = map.addChildNode(map.rootNode.id, NodeText.of('親ノード'))
    map.addChildNode(a, NodeText.of('子ノード'))
    map.attachImage(a, Attachment.create('drive-attachment-1'))
    map.toggleCollapse(a)

    const json = mindMapToJson(map)
    expect(json.schemaVersion).toBe(1)
    expect(json.id).toBe('drive-file-1')

    const restored = mindMapFromJson(json)

    expect(restored.id.equals(map.id)).toBe(true)
    expect(restored.name.equals(map.name)).toBe(true)
    expect(restored.updatedAt.getTime()).toBe(map.updatedAt.getTime())

    const restoredParent = restored.rootNode.children[0]
    const originalParent = map.rootNode.children[0]
    expect(restoredParent.id.equals(originalParent.id)).toBe(true)
    expect(restoredParent.text.value).toBe('親ノード')
    expect(restoredParent.collapsed).toBe(true)
    expect(restoredParent.children.map((c) => c.text.value)).toEqual(['子ノード'])
    expect(restoredParent.attachments).toHaveLength(1)
    expect(restoredParent.attachments[0].driveFileId).toBe('drive-attachment-1')
  })

  it('JSON文字列にシリアライズしてパースしても内容が保たれる', () => {
    const map = MindMap.createNew(MapId.of('drive-file-2'), MapName.of('シリアライズ'))
    map.addChildNode(map.rootNode.id, NodeText.of('ノード'))

    const roundTripped = mindMapFromJson(JSON.parse(JSON.stringify(mindMapToJson(map))))

    expect(roundTripped.rootNode.children.map((c) => c.text.value)).toEqual(['ノード'])
  })

  it('parseMindMapJsonは正しいスキーマのJSON文字列をパースして返す(インポート用)', () => {
    const map = MindMap.createNew(MapId.of('drive-file-3'), MapName.of('パーステスト'))
    map.addChildNode(map.rootNode.id, NodeText.of('ノード'))
    const raw = JSON.stringify(mindMapToJson(map))

    const json = parseMindMapJson(raw)

    expect(json.schemaVersion).toBe(1)
    expect(json.root.children.map((c) => c.text)).toEqual(['ノード'])
  })

  it('parseMindMapJsonは構文エラーのJSONに分かりやすいエラーを投げる', () => {
    expect(() => parseMindMapJson('{ これは JSON ではない')).toThrow('構文エラー')
  })

  it('parseMindMapJsonはスキーマ形状が合わないJSONにエラーを投げる', () => {
    expect(() => parseMindMapJson(JSON.stringify({ foo: 'bar' }))).toThrow(
      'マインドマップのJSON形式として認識できませんでした',
    )
    expect(() => parseMindMapJson(JSON.stringify({ schemaVersion: 2, root: {} }))).toThrow(
      'マインドマップのJSON形式として認識できませんでした',
    )
  })
})
