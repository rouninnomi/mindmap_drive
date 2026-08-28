import type { Node } from './Node'

export class MapId {
  readonly value: string

  private constructor(value: string) {
    this.value = value
  }

  static of(value: string): MapId {
    if (value.length === 0) {
      throw new Error('MapId must not be empty')
    }
    return new MapId(value)
  }

  equals(other: MapId): boolean {
    return this.value === other.value
  }
}

export class MapName {
  readonly value: string

  private constructor(value: string) {
    this.value = value
  }

  static of(value: string): MapName {
    if (value.trim().length === 0) {
      throw new Error('MapName must not be empty')
    }
    return new MapName(value)
  }

  equals(other: MapName): boolean {
    return this.value === other.value
  }
}

export class NodeId {
  readonly value: string

  private constructor(value: string) {
    this.value = value
  }

  static of(value: string): NodeId {
    if (value.length === 0) {
      throw new Error('NodeId must not be empty')
    }
    return new NodeId(value)
  }

  static generate(): NodeId {
    return new NodeId(crypto.randomUUID())
  }

  equals(other: NodeId): boolean {
    return this.value === other.value
  }
}

export class NodeText {
  readonly value: string

  private constructor(value: string) {
    this.value = value
  }

  static of(value: string): NodeText {
    return new NodeText(value)
  }

  static empty(): NodeText {
    return new NodeText('')
  }

  equals(other: NodeText): boolean {
    return this.value === other.value
  }
}

export class AttachmentId {
  readonly value: string

  private constructor(value: string) {
    this.value = value
  }

  static of(value: string): AttachmentId {
    if (value.length === 0) {
      throw new Error('AttachmentId must not be empty')
    }
    return new AttachmentId(value)
  }

  static generate(): AttachmentId {
    return new AttachmentId(crypto.randomUUID())
  }

  equals(other: AttachmentId): boolean {
    return this.value === other.value
  }
}

export class Attachment {
  readonly id: AttachmentId
  readonly driveFileId: string
  readonly addedAt: Date

  private constructor(id: AttachmentId, driveFileId: string, addedAt: Date) {
    this.id = id
    this.driveFileId = driveFileId
    this.addedAt = addedAt
  }

  static create(driveFileId: string, addedAt: Date = new Date()): Attachment {
    return new Attachment(AttachmentId.generate(), driveFileId, addedAt)
  }

  static reconstruct(id: AttachmentId, driveFileId: string, addedAt: Date): Attachment {
    return new Attachment(id, driveFileId, addedAt)
  }

  equals(other: Attachment): boolean {
    return this.id.equals(other.id)
  }
}

export class MapSummary {
  readonly id: MapId
  readonly name: MapName
  readonly updatedAt: Date

  private constructor(id: MapId, name: MapName, updatedAt: Date) {
    this.id = id
    this.name = name
    this.updatedAt = updatedAt
  }

  static of(id: MapId, name: MapName, updatedAt: Date): MapSummary {
    return new MapSummary(id, name, updatedAt)
  }
}

/**
 * MindMap集約のある時点の状態を表す不変のスナップショット。
 * Undo/Redo用の履歴管理はアプリケーション層の責務で、ここでは
 * 「捕捉(capture)」と「復元(restore)」のみを提供する。
 */
export class MindMapSnapshot {
  private readonly name: MapName
  private readonly root: Node
  private readonly updatedAt: Date

  private constructor(name: MapName, root: Node, updatedAt: Date) {
    this.name = name
    this.root = root
    this.updatedAt = updatedAt
  }

  static capture(name: MapName, root: Node, updatedAt: Date): MindMapSnapshot {
    return new MindMapSnapshot(name, root.clone(), new Date(updatedAt.getTime()))
  }

  restore(): { name: MapName; root: Node; updatedAt: Date } {
    return {
      name: this.name,
      root: this.root.clone(),
      updatedAt: new Date(this.updatedAt.getTime()),
    }
  }
}
