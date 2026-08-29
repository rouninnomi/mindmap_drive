import { describe, expect, it } from 'vitest'
import { MindMap } from './MindMap'
import { Attachment, MapId, MapName, NodeId, NodeText } from './valueObjects'

function newMap(name = 'テストマップ'): MindMap {
  return MindMap.createNew(MapId.of('map-1'), MapName.of(name))
}

function topLevelTexts(map: MindMap): string[] {
  return map.rootNode.children.map((n) => n.text.value)
}

describe('MindMap', () => {
  it('新規作成時は非表示のルートノードのみを持ち、トップレベルは空', () => {
    const map = newMap()
    expect(map.rootNode.children).toHaveLength(0)
  })

  it('マップ名が空文字だと作成できない', () => {
    expect(() => MapName.of('')).toThrow()
    expect(() => MapName.of('   ')).toThrow()
  })

  it('addChildNodeでルートの子としてトップレベルノードを追加できる', () => {
    const map = newMap()
    const id = map.addChildNode(map.rootNode.id, NodeText.of('最初のノード'))
    expect(topLevelTexts(map)).toEqual(['最初のノード'])
    expect(map.rootNode.findById(id)?.text.value).toBe('最初のノード')
  })

  it('addSiblingNodeで指定ノードの直後に兄弟ノードを追加する', () => {
    const map = newMap()
    const first = map.addChildNode(map.rootNode.id, NodeText.of('A'))
    map.addSiblingNode(first, NodeText.of('B'))
    map.addSiblingNode(first, NodeText.of('C'))
    // Cを先にfirstの直後へ挿入した後、Bもfirstの直後へ挿入されるためC,Bの順になる
    expect(topLevelTexts(map)).toEqual(['A', 'C', 'B'])
  })

  it('addChildNodeで既存ノードの子としてノードを追加できる', () => {
    const map = newMap()
    const parent = map.addChildNode(map.rootNode.id, NodeText.of('親'))
    const child = map.addChildNode(parent, NodeText.of('子'))
    const parentNode = map.rootNode.findById(parent)
    expect(parentNode?.children.map((c) => c.text.value)).toEqual(['子'])
    expect(map.rootNode.findById(child)?.text.value).toBe('子')
  })

  it('indentで直前の兄弟の子になる', () => {
    const map = newMap()
    const a = map.addChildNode(map.rootNode.id, NodeText.of('A'))
    const b = map.addSiblingNode(a, NodeText.of('B'))
    map.indent(b)
    expect(topLevelTexts(map)).toEqual(['A'])
    const nodeA = map.rootNode.findById(a)
    expect(nodeA?.children.map((c) => c.text.value)).toEqual(['B'])
  })

  it('先頭ノードはindentしても何も起きない', () => {
    const map = newMap()
    const a = map.addChildNode(map.rootNode.id, NodeText.of('A'))
    map.indent(a)
    expect(topLevelTexts(map)).toEqual(['A'])
  })

  it('outdentで親の直後の兄弟(1段浅い階層)に移動する', () => {
    const map = newMap()
    const a = map.addChildNode(map.rootNode.id, NodeText.of('A'))
    const b = map.addChildNode(a, NodeText.of('B'))
    map.outdent(b)
    expect(topLevelTexts(map)).toEqual(['A', 'B'])
  })

  it('すでに最上位のノードはoutdentしても何も起きない', () => {
    const map = newMap()
    const a = map.addChildNode(map.rootNode.id, NodeText.of('A'))
    map.outdent(a)
    expect(topLevelTexts(map)).toEqual(['A'])
  })

  it('moveUp/moveDownで同階層内の並び順を入れ替える', () => {
    const map = newMap()
    const a = map.addChildNode(map.rootNode.id, NodeText.of('A'))
    map.addSiblingNode(a, NodeText.of('B'))
    expect(topLevelTexts(map)).toEqual(['A', 'B'])

    const b = map.rootNode.children[1].id
    map.moveUp(b)
    expect(topLevelTexts(map)).toEqual(['B', 'A'])

    map.moveDown(b)
    expect(topLevelTexts(map)).toEqual(['A', 'B'])
  })

  it('先頭ノードのmoveUp・末尾ノードのmoveDownは何も起きない', () => {
    const map = newMap()
    const a = map.addChildNode(map.rootNode.id, NodeText.of('A'))
    const b = map.addSiblingNode(a, NodeText.of('B'))
    map.moveUp(a)
    map.moveDown(b)
    expect(topLevelTexts(map)).toEqual(['A', 'B'])
  })

  it('moveNodeで任意のノードの子として付け替えられる(ドラッグ&ドロップの再親子付け)', () => {
    const map = newMap()
    const a = map.addChildNode(map.rootNode.id, NodeText.of('A'))
    const b = map.addSiblingNode(a, NodeText.of('B'))
    const c = map.addChildNode(a, NodeText.of('C'))

    map.moveNode(b, c)

    expect(topLevelTexts(map)).toEqual(['A'])
    const nodeC = map.rootNode.findById(c)
    expect(nodeC?.children.map((n) => n.text.value)).toEqual(['B'])
  })

  it('moveNodeで移動すると子孫の構造も一緒に移動する', () => {
    const map = newMap()
    const a = map.addChildNode(map.rootNode.id, NodeText.of('A'))
    const b = map.addSiblingNode(a, NodeText.of('B'))
    const child = map.addChildNode(a, NodeText.of('Aの子'))

    map.moveNode(a, b)

    expect(topLevelTexts(map)).toEqual(['B'])
    const nodeB = map.rootNode.findById(b)
    expect(nodeB?.children.map((n) => n.text.value)).toEqual(['A'])
    expect(map.rootNode.findById(a)?.children.map((n) => n.text.value)).toEqual(['Aの子'])
    expect(map.rootNode.findById(child)).toBeDefined()
  })

  it('moveNodeは自分自身の子孫への移動(循環参照)を禁止する', () => {
    const map = newMap()
    const parent = map.addChildNode(map.rootNode.id, NodeText.of('親'))
    const child = map.addChildNode(parent, NodeText.of('子'))

    expect(() => map.moveNode(parent, child)).toThrow()
    expect(() => map.moveNode(parent, parent)).toThrow()
  })

  it('deleteNodeは子孫ノードもまとめてカスケード削除する', () => {
    const map = newMap()
    const parent = map.addChildNode(map.rootNode.id, NodeText.of('親'))
    const child = map.addChildNode(parent, NodeText.of('子'))
    map.deleteNode(parent)
    expect(topLevelTexts(map)).toEqual([])
    expect(map.rootNode.findById(parent)).toBeUndefined()
    expect(map.rootNode.findById(child)).toBeUndefined()
  })

  it('toggleCollapseで折りたたみ状態が反転する', () => {
    const map = newMap()
    const a = map.addChildNode(map.rootNode.id, NodeText.of('A'))
    expect(map.rootNode.findById(a)?.collapsed).toBe(false)
    map.toggleCollapse(a)
    expect(map.rootNode.findById(a)?.collapsed).toBe(true)
  })

  it('updateTextでテキストを更新できる(空文字も許容)', () => {
    const map = newMap()
    const a = map.addChildNode(map.rootNode.id, NodeText.of('A'))
    map.updateText(a, NodeText.of(''))
    expect(map.rootNode.findById(a)?.text.value).toBe('')
  })

  it('attachImage/removeAttachmentで画像添付を追加・削除できる', () => {
    const map = newMap()
    const a = map.addChildNode(map.rootNode.id, NodeText.of('A'))
    const attachment = Attachment.create('drive-file-id')
    map.attachImage(a, attachment)
    expect(map.rootNode.findById(a)?.attachments).toHaveLength(1)
    map.removeAttachment(a, attachment.id)
    expect(map.rootNode.findById(a)?.attachments).toHaveLength(0)
  })

  it('renameでマップ名を変更できる', () => {
    const map = newMap()
    map.rename(MapName.of('新しい名前'))
    expect(map.name.value).toBe('新しい名前')
  })

  it('createSnapshot/restoreSnapshotで編集前の状態に復元できる(Undoの土台)', () => {
    const map = newMap()
    const a = map.addChildNode(map.rootNode.id, NodeText.of('A'))
    const snapshot = map.createSnapshot()

    map.updateText(a, NodeText.of('編集後'))
    map.addSiblingNode(a, NodeText.of('B'))
    expect(topLevelTexts(map)).toEqual(['編集後', 'B'])

    map.restoreSnapshot(snapshot)
    expect(topLevelTexts(map)).toEqual(['A'])
    expect(map.rootNode.findById(a)?.text.value).toBe('A')
  })

  it('スナップショットは捕捉後の変更から影響を受けない(不変)', () => {
    const map = newMap()
    const a = map.addChildNode(map.rootNode.id, NodeText.of('A'))
    const snapshot = map.createSnapshot()

    map.addChildNode(a, NodeText.of('後から追加した子'))

    map.restoreSnapshot(snapshot)
    expect(map.rootNode.findById(a)?.children).toHaveLength(0)
  })

  it('存在しないノードIDを操作するとエラーになる', () => {
    const map = newMap()
    expect(() => map.updateText(NodeId.of('no-such-id'), NodeText.of('x'))).toThrow()
  })
})
