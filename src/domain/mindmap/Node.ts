import { Attachment, AttachmentId, NodeId, NodeText } from './valueObjects'

/**
 * MindMap集約に属するエンティティ。
 * 木構造の直接操作は可能だが、外部からの利用はMindMap集約経由に限定する
 * (domain-model.md 2節の方針)。
 */
export class Node {
  readonly id: NodeId
  private _text: NodeText
  private _children: Node[]
  private _collapsed: boolean
  private _attachments: Attachment[]

  private constructor(
    id: NodeId,
    text: NodeText,
    children: Node[],
    collapsed: boolean,
    attachments: Attachment[],
  ) {
    this.id = id
    this._text = text
    this._children = children
    this._collapsed = collapsed
    this._attachments = attachments
  }

  static create(text: NodeText = NodeText.empty()): Node {
    return new Node(NodeId.generate(), text, [], false, [])
  }

  static reconstruct(
    id: NodeId,
    text: NodeText,
    children: Node[],
    collapsed: boolean,
    attachments: Attachment[],
  ): Node {
    return new Node(id, text, children, collapsed, attachments)
  }

  get text(): NodeText {
    return this._text
  }

  get children(): readonly Node[] {
    return this._children
  }

  get collapsed(): boolean {
    return this._collapsed
  }

  get attachments(): readonly Attachment[] {
    return this._attachments
  }

  updateText(text: NodeText): void {
    this._text = text
  }

  toggleCollapse(): void {
    this._collapsed = !this._collapsed
  }

  addAttachment(attachment: Attachment): void {
    this._attachments = [...this._attachments, attachment]
  }

  removeAttachment(attachmentId: AttachmentId): void {
    this._attachments = this._attachments.filter((a) => !a.id.equals(attachmentId))
  }

  appendChild(node: Node): void {
    this._children = [...this._children, node]
  }

  insertChildAt(index: number, node: Node): void {
    this._children = [...this._children.slice(0, index), node, ...this._children.slice(index)]
  }

  removeChildAt(index: number): Node {
    const removed = this._children[index]
    this._children = [...this._children.slice(0, index), ...this._children.slice(index + 1)]
    return removed
  }

  swapChildren(i: number, j: number): void {
    const children = [...this._children]
    const tmp = children[i]
    children[i] = children[j]
    children[j] = tmp
    this._children = children
  }

  indexOfChild(id: NodeId): number {
    return this._children.findIndex((child) => child.id.equals(id))
  }

  findById(id: NodeId): Node | undefined {
    if (this.id.equals(id)) {
      return this
    }
    for (const child of this._children) {
      const found = child.findById(id)
      if (found) {
        return found
      }
    }
    return undefined
  }

  /** idを直接の子として持つノード(親)を木全体から探す。 */
  findParentOf(id: NodeId): Node | undefined {
    for (const child of this._children) {
      if (child.id.equals(id)) {
        return this
      }
      const found = child.findParentOf(id)
      if (found) {
        return found
      }
    }
    return undefined
  }

  clone(): Node {
    return new Node(
      this.id,
      this._text,
      this._children.map((child) => child.clone()),
      this._collapsed,
      [...this._attachments],
    )
  }
}
