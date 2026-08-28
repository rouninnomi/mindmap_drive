import { describe, expect, it } from 'vitest'
import { MindMap } from '../../domain/mindmap/MindMap'
import { Attachment, MapId, MapName, NodeText } from '../../domain/mindmap/valueObjects'
import { mindMapFromJson, mindMapToJson } from './mindMapJson'

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
})
