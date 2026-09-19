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
    // ノードのテキスト編集は、文字入力のたびに自動保存が頻繁に挟まらないよう
    // Enter/Tab/Esc等でノードを離れる時か`blur`時のみドメインへコミットする
    // (`MapEditorPage.tsx`冒頭コメント参照)。そのため、まだコミットされていない
    // 入力中の文字がある状態でタブを離れる/閉じる場合に備え、保存前にフォーカス中の
    // 要素を明示的に`blur()`してコミットを強制してから保存する。
    const flushActiveEditAndSave = (): void => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur()
      }
      void editor.flushPendingSave()
    }
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') {
        flushActiveEditAndSave()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('beforeunload', flushActiveEditAndSave)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('beforeunload', flushActiveEditAndSave)
      flushActiveEditAndSave()
    }
  }, [editor])

  const snapshot = useSyncExternalStore(editor.subscribe, editor.getSnapshotForRender)

  return { snapshot, editor }
}
