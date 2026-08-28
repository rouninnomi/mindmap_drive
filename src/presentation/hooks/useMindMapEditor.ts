import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { MapId } from '../../domain/mindmap/valueObjects'
import { MindMapEditingService } from '../../application/MindMapEditingService'
import { attachmentStorage, mindMapRepository } from '../services'

/**
 * `MindMapEditingService`をReactへ接続するフック(architecture.md 3節)。
 * ドメイン集約は内部で直接ミューテートされるため、`useSyncExternalStore`で
 * 参照が安定した描画用スナップショットを購読する。
 */
export function useMindMapEditor(mapId: MapId) {
  // MapIdの値が同じ限り同一のサービスインスタンスを使い続ける
  // (MapIdオブジェクトの参照は呼び出し側で毎回新しく生成されうるため、値で比較する)。
  const editor = useMemo(
    () => new MindMapEditingService(mindMapRepository, attachmentStorage),
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [mapId.value],
  )

  useEffect(() => {
    void editor.load(mapId)
    // editorはmapId.valueが変わったときだけ再生成されるため、依存はeditorのみでよい
    // (mapIdオブジェクトの参照が毎回変わっても不要な再読み込みを避ける)。
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  useEffect(() => {
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') {
        void editor.flushPendingSave()
      }
    }
    const handleBeforeUnload = (): void => {
      void editor.flushPendingSave()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      void editor.flushPendingSave()
    }
  }, [editor])

  const snapshot = useSyncExternalStore(editor.subscribe, editor.getSnapshotForRender)

  return { snapshot, editor }
}
