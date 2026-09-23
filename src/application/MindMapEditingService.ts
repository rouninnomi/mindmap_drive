import type { AttachmentStorage } from '../domain/mindmap/AttachmentStorage'
import { MindMap } from '../domain/mindmap/MindMap'
import type { Node } from '../domain/mindmap/Node'
import type { MindMapRepository } from '../domain/mindmap/MindMapRepository'
import type {
  AttachmentId,
  MapId,
  MapName,
  MindMapSnapshot,
  NodeId,
  NodeText,
} from '../domain/mindmap/valueObjects'
import { mindMapFromJson, mindMapToJson, type MindMapJson } from '../infrastructure/drive/mindMapJson'

const UNDO_STACK_LIMIT = 50
const AUTO_SAVE_DEBOUNCE_MS = 1500
const DRAFT_STORAGE_KEY_PREFIX = 'mindmap-drive:draft:'

type Listener = () => void

/** presentation層がuseSyncExternalStoreで購読するための、参照が安定した描画用スナップショット。 */
export interface MindMapEditorSnapshot {
  readonly version: number
  readonly map: MindMap | null
  /** 自動保存されなかった可能性のあるローカルドラフトが見つかっているか。 */
  readonly pendingDraftRecovery: boolean
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
  private saving = false
  private pendingDraftRecovery: MindMapJson | null = null
  private renderSnapshot: MindMapEditorSnapshot = { version: 0, map: null, pendingDraftRecovery: false }
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
    this.pendingDraftRecovery = this.readNewerDraft(id, this.current)
    this.notify()
  }

  addSiblingNode(afterNodeId: NodeId, text: NodeText): NodeId {
    return this.mutate((map) => map.addSiblingNode(afterNodeId, text))
  }

  addChildNode(parentNodeId: NodeId, text: NodeText): NodeId {
    return this.mutate((map) => map.addChildNode(parentNodeId, text))
  }

  splitNode(nodeId: NodeId, beforeText: NodeText, afterText: NodeText): NodeId {
    return this.mutate((map) => map.splitNode(nodeId, beforeText, afterText))
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

  deleteNodes(nodeIds: NodeId[]): void {
    this.mutate((map) => map.deleteNodes(nodeIds))
  }

  pasteAsChild(parentNodeId: NodeId, sourceNodes: Node[]): NodeId[] {
    return this.mutate((map) => map.pasteAsChild(parentNodeId, sourceNodes))
  }

  mergeNodes(nodeIds: NodeId[]): NodeId {
    return this.mutate((map) => map.mergeNodes(nodeIds))
  }

  moveNode(nodeId: NodeId, newParentId: NodeId): void {
    this.mutate((map) => map.moveNode(nodeId, newParentId))
  }

  toggleCollapse(nodeId: NodeId): void {
    this.mutate((map) => map.toggleCollapse(nodeId))
  }

  expandNextLevel(nodeId: NodeId): void {
    this.mutate((map) => map.expandNextLevel(nodeId))
  }

  expandAll(): void {
    this.mutate((map) => map.expandAll())
  }

  collapseAll(): void {
    this.mutate((map) => map.collapseAll())
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

  rename(name: MapName): void {
    this.mutate((map) => map.rename(name))
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
    this.persistDraft()
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
    this.persistDraft()
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
    this.saving = true
    this.notify()
    try {
      await this.repository.save(this.current)
      this.isDirty = false
      this.clearDraft()
    } finally {
      this.saving = false
      this.notify()
    }
  }

  /** UndoスタックからUndoできるか(presentation層のボタン活性制御用)。 */
  canUndo(): boolean {
    return this.undoStack.length > 0
  }

  /** RedoスタックからRedoできるか(presentation層のボタン活性制御用)。 */
  canRedo(): boolean {
    return this.redoStack.length > 0
  }

  /** 保存インジケータ表示用。 */
  isSaving(): boolean {
    return this.saving
  }

  /**
   * 自動保存が効かない等アプリの挙動がおかしい時の保険として、現在のマップ内容を
   * JSON文字列として取り出す(Driveへの保存と同じスキーマ)。保存済みかどうかに
   * 関わらず、現在メモリ上にある内容(未保存の変更も含む)をそのまま反映する
   * (ユーザーフィードバックにより追加)。
   */
  exportJson(): string {
    const map = this.requireCurrent()
    return JSON.stringify(mindMapToJson(map), null, 2)
  }

  /**
   * `load`時に見つかったローカルドラフト(自動保存されなかった可能性のある変更)を
   * 現在の内容として採用し、Driveへ保存し直す。Undo/Redo履歴は復元前の状態とは
   * 連続性が無いためクリアする。
   */
  restoreDraft(): void {
    if (!this.pendingDraftRecovery) {
      return
    }
    this.current = mindMapFromJson(this.pendingDraftRecovery)
    this.pendingDraftRecovery = null
    this.undoStack = []
    this.redoStack = []
    this.isDirty = true
    this.notify()
    this.scheduleAutoSave()
  }

  /** `load`時に見つかったローカルドラフトを破棄し、Driveから読み込んだ内容をそのまま使う。 */
  discardDraft(): void {
    if (!this.pendingDraftRecovery) {
      return
    }
    this.clearDraft()
    this.pendingDraftRecovery = null
    this.notify()
  }

  private mutate<T>(operation: (map: MindMap) => T): T {
    const map = this.requireCurrent()
    this.pushUndoSnapshot(map.createSnapshot())
    const result = operation(map)
    this.isDirty = true
    this.persistDraft()
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

  /**
   * 変更のたびに`localStorage`へ同期的にドラフトを書き込む(ネットワーク不要・即完了)。
   * Vite開発サーバーでのHMRによるページ全体リロードや、通信障害・Drive APIエラーなど
   * デバウンス中の自動保存(1.5秒後・非同期)が完了する前に何らかの理由でページが
   * 失われた場合の保険。実際にDriveへ保存できた時点(`flushPendingSave`成功時)に
   * 用済みとして消す(`clearDraft`)。プライベートブラウジング等で`localStorage`が
   * 使えない環境では諦める(保険機能なので握りつぶしてよい)。
   */
  private persistDraft(): void {
    if (!this.current || this.pendingDraftRecovery) {
      // 復元/破棄の判断がつくまでは、保存済みのドラフトを新しい編集で上書きしない
      // (ユーザーがバナーに気付く前に操作してしまうケースの保護)。
      return
    }
    try {
      localStorage.setItem(this.draftStorageKey(this.current.id), JSON.stringify(mindMapToJson(this.current)))
    } catch {
      // 握りつぶす(上記コメント参照)
    }
  }

  private clearDraft(): void {
    if (!this.current) {
      return
    }
    try {
      localStorage.removeItem(this.draftStorageKey(this.current.id))
    } catch {
      // 握りつぶす(persistDraftのコメント参照)
    }
  }

  /**
   * `load`時、Driveから読み込んだ内容より新しいローカルドラフトが残っていないか確認する。
   * ドラフトの`updatedAt`がDrive側より新しければ「自動保存できなかった変更」とみなし返す。
   * 同じかDrive側の方が新しければ(≒既に保存済み、またはこの端末のドラフトが古い)、
   * 用済みのドラフトとして掃除しておく。
   */
  private readNewerDraft(id: MapId, loaded: MindMap): MindMapJson | null {
    try {
      const raw = localStorage.getItem(this.draftStorageKey(id))
      if (!raw) {
        return null
      }
      const draft = JSON.parse(raw) as MindMapJson
      if (new Date(draft.updatedAt).getTime() > loaded.updatedAt.getTime()) {
        return draft
      }
      localStorage.removeItem(this.draftStorageKey(id))
      return null
    } catch {
      return null
    }
  }

  private draftStorageKey(id: MapId): string {
    return `${DRAFT_STORAGE_KEY_PREFIX}${id.value}`
  }

  private notify(): void {
    this.renderSnapshot = {
      version: this.renderSnapshot.version + 1,
      map: this.current,
      pendingDraftRecovery: this.pendingDraftRecovery !== null,
    }
    for (const listener of this.listeners) {
      listener()
    }
  }
}
