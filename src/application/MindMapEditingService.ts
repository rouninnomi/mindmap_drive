import type { AttachmentStorage } from '../domain/mindmap/AttachmentStorage'
import { MindMap } from '../domain/mindmap/MindMap'
import type { MindMapRepository } from '../domain/mindmap/MindMapRepository'
import type {
  AttachmentId,
  MapId,
  MindMapSnapshot,
  NodeId,
  NodeText,
} from '../domain/mindmap/valueObjects'

const UNDO_STACK_LIMIT = 50
const AUTO_SAVE_DEBOUNCE_MS = 1500

type Listener = () => void

/** presentation層がuseSyncExternalStoreで購読するための、参照が安定した描画用スナップショット。 */
export interface MindMapEditorSnapshot {
  readonly version: number
  readonly map: MindMap | null
}

/**
 * 1つのマップを開いている間の編集操作を仲介するアプリケーションサービス
 * (architecture.md 2.2節)。ドメイン集約(MindMap)のメソッドをラップし、
 * Undo/Redo・変更通知・自動保存のデバウンスを担う。
 */
export class MindMapEditingService {
  private readonly repository: MindMapRepository
  private readonly attachmentStorage: AttachmentStorage
  private current: MindMap | null = null
  private undoStack: MindMapSnapshot[] = []
  private redoStack: MindMapSnapshot[] = []
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private isDirty = false
  private renderSnapshot: MindMapEditorSnapshot = { version: 0, map: null }
  private readonly listeners = new Set<Listener>()

  constructor(repository: MindMapRepository, attachmentStorage: AttachmentStorage) {
    this.repository = repository
    this.attachmentStorage = attachmentStorage
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshotForRender = (): MindMapEditorSnapshot => {
    return this.renderSnapshot
  }

  async load(id: MapId): Promise<void> {
    this.cancelScheduledAutoSave()
    this.undoStack = []
    this.redoStack = []
    this.isDirty = false
    this.current = await this.repository.findById(id)
    this.notify()
  }

  addSiblingNode(afterNodeId: NodeId, text: NodeText): NodeId {
    return this.mutate((map) => map.addSiblingNode(afterNodeId, text))
  }

  addChildNode(parentNodeId: NodeId, text: NodeText): NodeId {
    return this.mutate((map) => map.addChildNode(parentNodeId, text))
  }

  indent(nodeId: NodeId): void {
    this.mutate((map) => map.indent(nodeId))
  }

  outdent(nodeId: NodeId): void {
    this.mutate((map) => map.outdent(nodeId))
  }

  moveUp(nodeId: NodeId): void {
    this.mutate((map) => map.moveUp(nodeId))
  }

  moveDown(nodeId: NodeId): void {
    this.mutate((map) => map.moveDown(nodeId))
  }

  deleteNode(nodeId: NodeId): void {
    this.mutate((map) => map.deleteNode(nodeId))
  }

  toggleCollapse(nodeId: NodeId): void {
    this.mutate((map) => map.toggleCollapse(nodeId))
  }

  updateText(nodeId: NodeId, text: NodeText): void {
    this.mutate((map) => map.updateText(nodeId, text))
  }

  async attachImage(nodeId: NodeId, file: Blob): Promise<void> {
    const map = this.requireCurrent()
    const attachment = await this.attachmentStorage.upload(map.id, file)
    this.mutate((m) => m.attachImage(nodeId, attachment))
  }

  removeAttachment(nodeId: NodeId, attachmentId: AttachmentId): void {
    this.mutate((map) => map.removeAttachment(nodeId, attachmentId))
  }

  undo(): void {
    const map = this.requireCurrent()
    const snapshot = this.undoStack.pop()
    if (!snapshot) {
      return
    }
    this.redoStack.push(map.createSnapshot())
    map.restoreSnapshot(snapshot)
    this.isDirty = true
    this.notify()
    this.scheduleAutoSave()
  }

  redo(): void {
    const map = this.requireCurrent()
    const snapshot = this.redoStack.pop()
    if (!snapshot) {
      return
    }
    this.undoStack.push(map.createSnapshot())
    map.restoreSnapshot(snapshot)
    this.isDirty = true
    this.notify()
    this.scheduleAutoSave()
  }

  /**
   * タブが非表示になる直前(visibilitychange)・beforeunload等のタイミングで
   * 呼び出し、ダーティ状態ならデバウンスを待たずベストエフォートで即座に保存する
   * (architecture.md 4.5節)。
   */
  async flushPendingSave(): Promise<void> {
    this.cancelScheduledAutoSave()
    if (!this.isDirty || !this.current) {
      return
    }
    await this.repository.save(this.current)
    this.isDirty = false
  }

  private mutate<T>(operation: (map: MindMap) => T): T {
    const map = this.requireCurrent()
    this.pushUndoSnapshot(map.createSnapshot())
    const result = operation(map)
    this.isDirty = true
    this.notify()
    this.scheduleAutoSave()
    return result
  }

  private pushUndoSnapshot(snapshot: MindMapSnapshot): void {
    this.undoStack.push(snapshot)
    if (this.undoStack.length > UNDO_STACK_LIMIT) {
      this.undoStack.shift()
    }
    this.redoStack = []
  }

  private scheduleAutoSave(): void {
    this.cancelScheduledAutoSave()
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      void this.flushPendingSave()
    }, AUTO_SAVE_DEBOUNCE_MS)
  }

  private cancelScheduledAutoSave(): void {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
  }

  private requireCurrent(): MindMap {
    if (!this.current) {
      throw new Error('MindMap is not loaded yet')
    }
    return this.current
  }

  private notify(): void {
    this.renderSnapshot = { version: this.renderSnapshot.version + 1, map: this.current }
    for (const listener of this.listeners) {
      listener()
    }
  }
}
