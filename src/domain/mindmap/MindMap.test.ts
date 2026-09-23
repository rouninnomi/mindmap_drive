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

  it('splitNodeでテキストを2つに分割し、後半を直後の新規兄弟ノードにする', () => {
    const map = newMap()
    const a = map.addChildNode(map.rootNode.id, NodeText.of('前半後半'))
    const newId = map.splitNode(a, NodeText.of('前半'), NodeText.of('後半'))
    expect(topLevelTexts(map)).toEqual(['前半', '後半'])
    expect(map.rootNode.findById(a)?.text.value).toBe('前半')
    expect(map.rootNode.findById(newId)?.text.value).toBe('後半')
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

  it('deleteNodesで複数の兄弟ノードをまとめて削除する', () => {
    const map = newMap()
    const a = map.addChildNode(map.rootNode.id, NodeText.of('A'))
    map.addChildNode(map.rootNode.id, NodeText.of('B'))
    const c = map.addChildNode(map.rootNode.id, NodeText.of('C'))
    map.deleteNodes([c, a])
    expect(topLevelTexts(map)).toEqual(['B'])
    expect(map.rootNode.findById(a)).toBeUndefined()
    expect(map.rootNode.findById(c)).toBeUndefined()
  })

  it('pasteAsChildで対象ノードの子として末尾にコピー元ノード群を並び順のまま貼り付ける(IDは再採番される)', () => {
    const map = newMap()
    const target = map.addChildNode(map.rootNode.id, NodeText.of('貼り付け先'))
    const existingChild = map.addChildNode(target, NodeText.of('既存の子'))
    const source = map.addChildNode(map.rootNode.id, NodeText.of('コピー元'))
    const sourceChild = map.addChildNode(source, NodeText.of('コピー元の子'))
    map.attachImage(source, Attachment.create('file-source'))
    const sourceNode = map.rootNode.findById(source)!

    const [pastedId] = map.pasteAsChild(target, [sourceNode])

    expect(topLevelTexts(map)).toEqual(['貼り付け先', 'コピー元'])
    expect(pastedId.equals(source)).toBe(false)
    const targetNode = map.rootNode.findById(target)
    // 既存の子は残ったまま、末尾に貼り付けられる
    expect(targetNode?.children.map((n) => n.id.equals(existingChild))).toEqual([true, false])
    const pasted = map.rootNode.findById(pastedId)
    expect(pasted?.text.value).toBe('コピー元')
    expect(pasted?.children.map((n) => n.text.value)).toEqual(['コピー元の子'])
    expect(pasted?.children[0].id.equals(sourceChild)).toBe(false)
    expect(pasted?.attachments.map((att) => att.driveFileId)).toEqual(['file-source'])
    // コピー元はそのまま残る
    expect(map.rootNode.findById(source)).toBeDefined()
  })

  it('pasteAsChildは同じ内容を複数回貼り付けてもIDが重複しない', () => {
    const map = newMap()
    const target = map.addChildNode(map.rootNode.id, NodeText.of('貼り付け先'))
    const source = map.rootNode.findById(map.addChildNode(map.rootNode.id, NodeText.of('コピー元')))!

    const [firstPasteId] = map.pasteAsChild(target, [source])
    const [secondPasteId] = map.pasteAsChild(target, [source])

    expect(firstPasteId.equals(secondPasteId)).toBe(false)
    expect(map.rootNode.findById(firstPasteId)).toBeDefined()
    expect(map.rootNode.findById(secondPasteId)).toBeDefined()
  })

  it('mergeNodesで兄弟ノードを1つに統合する(テキストは並び順で改行連結、子と添付は先頭ノードへ集約)', () => {
    const map = newMap()
    const a = map.addChildNode(map.rootNode.id, NodeText.of('A'))
    const b = map.addChildNode(map.rootNode.id, NodeText.of('B'))
    const c = map.addChildNode(map.rootNode.id, NodeText.of('C'))
    const childOfB = map.addChildNode(b, NodeText.of('Bの子'))
    map.attachImage(a, Attachment.create('file-a'))
    map.attachImage(c, Attachment.create('file-c'))

    // 選択順とツリー上の並び順が違っても、並び順(A,B,C)で連結される
    const mergedId = map.mergeNodes([c, a, b])

    expect(mergedId.equals(a)).toBe(true)
    expect(topLevelTexts(map)).toEqual(['A\nB\nC'])
    expect(map.rootNode.findById(b)).toBeUndefined()
    expect(map.rootNode.findById(c)).toBeUndefined()
    const merged = map.rootNode.findById(a)
    expect(merged?.children.map((n) => n.id.equals(childOfB))).toEqual([true])
    expect(merged?.attachments.map((att) => att.driveFileId)).toEqual(['file-a', 'file-c'])
  })

  it('mergeNodesは親が異なるノードを渡すと例外を投げる', () => {
    const map = newMap()
    const a = map.addChildNode(map.rootNode.id, NodeText.of('A'))
    const parent = map.addChildNode(map.rootNode.id, NodeText.of('親'))
    const child = map.addChildNode(parent, NodeText.of('子'))
    expect(() => map.mergeNodes([a, child])).toThrow()
  })

  it('toggleCollapseで折りたたみ状態が反転する', () => {
    const map = newMap()
    const a = map.addChildNode(map.rootNode.id, NodeText.of('A'))
    expect(map.rootNode.findById(a)?.collapsed).toBe(false)
    map.toggleCollapse(a)
    expect(map.rootNode.findById(a)?.collapsed).toBe(true)
  })

  it('折りたたんだノードを展開すると、直下の子ノードまでの表示に留める(孫は畳まれたまま)', () => {
    const map = newMap()
    const a = map.addChildNode(map.rootNode.id, NodeText.of('A'))
    const b = map.addChildNode(a, NodeText.of('B'))
    map.addChildNode(b, NodeText.of('C'))

    // 展開したまま畳んで、また展開する
    map.toggleCollapse(a)
    map.toggleCollapse(a)

    expect(map.rootNode.findById(a)?.collapsed).toBe(false)
    expect(map.rootNode.findById(b)?.collapsed).toBe(true)
  })

  it('expandNextLevelは押すたびに1階層ずつ深く展開する(Ctrl+→連打での掘り下げ)', () => {
    const map = newMap()
    const a = map.addChildNode(map.rootNode.id, NodeText.of('A'))
    const b = map.addChildNode(a, NodeText.of('B'))
    const c = map.addChildNode(b, NodeText.of('C'))
    map.addChildNode(c, NodeText.of('D'))
    // 新規ノードはデフォルトで展開済みのため、実際の利用時と同様まずAだけ畳んでおく
    map.toggleCollapse(a)

    expect(map.hasMoreToExpand(a)).toBe(true)
    map.expandNextLevel(a) // 1回目: Bまで表示、Bは畳んだまま
    expect(map.rootNode.findById(a)?.collapsed).toBe(false)
    expect(map.rootNode.findById(b)?.collapsed).toBe(true)

    expect(map.hasMoreToExpand(a)).toBe(true)
    map.expandNextLevel(a) // 2回目: Cまで表示、Cは畳んだまま
    expect(map.rootNode.findById(b)?.collapsed).toBe(false)
    expect(map.rootNode.findById(c)?.collapsed).toBe(true)

    expect(map.hasMoreToExpand(a)).toBe(true)
    map.expandNextLevel(a) // 3回目: Dまで表示(Dは子が無いので折りたたみ対象外)
    expect(map.rootNode.findById(c)?.collapsed).toBe(false)

    // これ以上展開する階層は無い
    expect(map.hasMoreToExpand(a)).toBe(false)
  })

  it('expandAll/collapseAllでマップ内の全ノードを一括展開/折りたたみできる', () => {
    const map = newMap()
    const a = map.addChildNode(map.rootNode.id, NodeText.of('A'))
    const b = map.addChildNode(a, NodeText.of('B'))
    const c = map.addChildNode(b, NodeText.of('C'))
    map.toggleCollapse(a)
    map.toggleCollapse(b)

    map.collapseAll()
    expect(map.rootNode.findById(a)?.collapsed).toBe(true)
    expect(map.rootNode.findById(b)?.collapsed).toBe(true)
    expect(map.rootNode.findById(c)?.collapsed).toBe(true)

    map.expandAll()
    expect(map.rootNode.findById(a)?.collapsed).toBe(false)
    expect(map.rootNode.findById(b)?.collapsed).toBe(false)
    expect(map.rootNode.findById(c)?.collapsed).toBe(false)
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
