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
