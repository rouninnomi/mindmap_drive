import { Node } from './Node'
import {
  Attachment,
  AttachmentId,
  MapId,
  MapName,
  MindMapSnapshot,
  NodeId,
  NodeText,
} from './valueObjects'

/**
 * 集約ルート。1つのマインドマップ全体を表す。
 * 木構造に対するすべての変更操作はMindMapを経由してのみ行う
 * (domain-model.md 2節)。
 *
 * ユーザーに見えるトップレベルノード群は、非表示のルートノードの子として
 * 表現する(architecture.md 4.4節)。
 */
export class MindMap {
  readonly id: MapId
  private _name: MapName
  private root: Node
  private _updatedAt: Date

  private constructor(id: MapId, name: MapName, root: Node, updatedAt: Date) {
    this.id = id
    this._name = name
    this.root = root
    this._updatedAt = updatedAt
  }

  static createNew(id: MapId, name: MapName): MindMap {
    return new MindMap(id, name, Node.create(), new Date())
  }

  static reconstruct(id: MapId, name: MapName, root: Node, updatedAt: Date): MindMap {
    return new MindMap(id, name, root, updatedAt)
  }

  get name(): MapName {
    return this._name
  }

  get updatedAt(): Date {
    return this._updatedAt
  }

  /** 非表示のルートノード。トップレベルノードはこの子として並ぶ。 */
  get rootNode(): Node {
    return this.root
  }

  rename(newName: MapName): void {
    this._name = newName
    this.touch()
  }

  addSiblingNode(afterNodeId: NodeId, text: NodeText): NodeId {
    const parent = this.findParentOrThrow(afterNodeId)
    const index = parent.indexOfChild(afterNodeId)
    const node = Node.create(text)
    parent.insertChildAt(index + 1, node)
    this.touch()
    return node.id
  }

  addChildNode(parentNodeId: NodeId, text: NodeText): NodeId {
    const parent = this.findNodeOrThrow(parentNodeId)
    const node = Node.create(text)
    parent.appendChild(node)
    this.touch()
    return node.id
  }

  /**
   * ノードのテキストをカーソル位置で2つに分割する(Shift+Enter)。対象ノードの
   * テキストを`beforeText`に置き換え、`afterText`を持つ新しい兄弟ノードを直後に
   * 挿入する。1回の操作としてUndo可能にするため、`MindMapEditingService`側では
   * 1回の`mutate`呼び出しにまとめる。
   */
  splitNode(nodeId: NodeId, beforeText: NodeText, afterText: NodeText): NodeId {
    const node = this.findNodeOrThrow(nodeId)
    node.updateText(beforeText)
    return this.addSiblingNode(nodeId, afterText)
  }

  /** 選択ノードを直前の兄弟の子として1段深くする。直前の兄弟がなければ何もしない。 */
  indent(nodeId: NodeId): void {
    const parent = this.findParentOrThrow(nodeId)
    const index = parent.indexOfChild(nodeId)
    if (index <= 0) {
      return
    }
    const previousSibling = parent.children[index - 1]
    const node = parent.removeChildAt(index)
    previousSibling.appendChild(node)
    this.touch()
  }

  /** 選択ノードを親の直後の兄弟として1段浅くする。すでに最上位なら何もしない。 */
  outdent(nodeId: NodeId): void {
    const parent = this.findParentOrThrow(nodeId)
    if (parent === this.root) {
      return
    }
    const grandParent = this.findParentOrThrow(parent.id)
    const parentIndex = grandParent.indexOfChild(parent.id)
    const index = parent.indexOfChild(nodeId)
    const node = parent.removeChildAt(index)
    grandParent.insertChildAt(parentIndex + 1, node)
    this.touch()
  }

  moveUp(nodeId: NodeId): void {
    const parent = this.findParentOrThrow(nodeId)
    const index = parent.indexOfChild(nodeId)
    if (index <= 0) {
      return
    }
    parent.swapChildren(index - 1, index)
    this.touch()
  }

  moveDown(nodeId: NodeId): void {
    const parent = this.findParentOrThrow(nodeId)
    const index = parent.indexOfChild(nodeId)
    if (index < 0 || index >= parent.children.length - 1) {
      return
    }
    parent.swapChildren(index, index + 1)
    this.touch()
  }

  /**
   * ノード(とその子孫全体)を任意の別ノードの子として移動する
   * (ドラッグ&ドロップでの自由な再親子付けに対応)。
   * 自分自身、または自分の子孫への移動は循環参照になるため禁止する
   * (domain-model.md 7節 不変条件1)。
   */
  moveNode(nodeId: NodeId, newParentId: NodeId): void {
    const node = this.findNodeOrThrow(nodeId)
    const newParent = this.findNodeOrThrow(newParentId)
    if (node.findById(newParentId)) {
      throw new Error(`Cannot move a node into itself or its own descendant: ${nodeId.value}`)
    }
    const oldParent = this.findParentOrThrow(nodeId)
    const index = oldParent.indexOfChild(nodeId)
    oldParent.removeChildAt(index)
    newParent.appendChild(node)
    this.touch()
  }

  /**
   * 同じ親を持つ兄弟ノード2つ以上を1つに統合する(Ctrl+クリック/Shift+クリックでの
   * 複数選択に対応。ユーザーフィードバックにより追加)。テキストは兄弟内の並び順で
   * 改行連結し、子ノード・添付画像もすべて先頭(並び順で最初)のノードへ集約する。
   * 統合後は先頭ノードの位置に残り、残りのノードは削除される。
   * 異なる親を持つノード同士は統合できない(例外を投げる)。
   */
  mergeNodes(nodeIds: NodeId[]): NodeId {
    if (nodeIds.length < 2) {
      throw new Error('mergeNodes requires at least 2 nodes')
    }
    const parent = this.findParentOrThrow(nodeIds[0])
    for (const id of nodeIds) {
      if (this.findParentOrThrow(id) !== parent) {
        throw new Error('mergeNodes only supports sibling nodes sharing the same parent')
      }
    }
    const sortedIds = [...nodeIds].sort(
      (a, b) => parent.indexOfChild(a) - parent.indexOfChild(b),
    )
    const nodes = sortedIds.map((id) => this.findNodeOrThrow(id))
    const [first, ...rest] = nodes

    first.updateText(NodeText.of(nodes.map((n) => n.text.value).join('\n')))
    for (const node of rest) {
      for (const child of node.children) {
        first.appendChild(child)
      }
      for (const attachment of node.attachments) {
        first.addAttachment(attachment)
      }
    }
    for (const node of rest) {
      parent.removeChildAt(parent.indexOfChild(node.id))
    }
    this.touch()
    return first.id
  }

  /** ノードを削除する。子孫ノードもすべて削除される(カスケード削除)。 */
  deleteNode(nodeId: NodeId): void {
    const parent = this.findParentOrThrow(nodeId)
    const index = parent.indexOfChild(nodeId)
    parent.removeChildAt(index)
    this.touch()
  }

  toggleCollapse(nodeId: NodeId): void {
    this.findNodeOrThrow(nodeId).toggleCollapse()
    this.touch()
  }

  updateText(nodeId: NodeId, text: NodeText): void {
    this.findNodeOrThrow(nodeId).updateText(text)
    this.touch()
  }

  attachImage(nodeId: NodeId, attachment: Attachment): void {
    this.findNodeOrThrow(nodeId).addAttachment(attachment)
    this.touch()
  }

  removeAttachment(nodeId: NodeId, attachmentId: AttachmentId): void {
    this.findNodeOrThrow(nodeId).removeAttachment(attachmentId)
    this.touch()
  }

  createSnapshot(): MindMapSnapshot {
    return MindMapSnapshot.capture(this._name, this.root, this._updatedAt)
  }

  restoreSnapshot(snapshot: MindMapSnapshot): void {
    const { name, root, updatedAt } = snapshot.restore()
    this._name = name
    this.root = root
    this._updatedAt = updatedAt
  }

  private touch(): void {
    this._updatedAt = new Date()
  }

  private findNodeOrThrow(nodeId: NodeId): Node {
    const node = this.root.findById(nodeId)
    if (!node) {
      throw new Error(`Node not found: ${nodeId.value}`)
    }
    return node
  }

  private findParentOrThrow(nodeId: NodeId): Node {
    const parent = this.root.findParentOf(nodeId)
    if (!parent) {
      throw new Error(`Node has no parent (missing, or is the root node): ${nodeId.value}`)
    }
    return parent
  }
}
