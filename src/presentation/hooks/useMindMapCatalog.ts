import { useCallback, useEffect, useState } from 'react'
import type { MapId, MapName, MapSummary } from '../../domain/mindmap/valueObjects'
import { catalogService } from '../services'

/** マップ一覧画面(architecture.md 3節)用のフック。状態がシンプルなためuseState+useEffectで構成する。 */
export function useMindMapCatalog() {
  const [summaries, setSummaries] = useState<MapSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // 初回マウント時はisLoadingが既にtrueなので、fetchSummaries自体はそれを
  // 同期的にセットし直さない(setState-in-effectの連鎖レンダーを避けるため)。
  const fetchSummaries = useCallback(async (): Promise<void> => {
    try {
      setSummaries(await catalogService.listMaps())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    // マウント時の一覧取得(architecture.md 3節: シンプルな状態のためuseState+useEffectで構成)。
    // oxlint-disable-next-line react/set-state-in-effect
    void fetchSummaries()
  }, [fetchSummaries])

  const reload = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    await fetchSummaries()
  }, [fetchSummaries])

  const createMap = useCallback(
    async (name: MapName): Promise<MapId> => {
      const id = await catalogService.createMap(name)
      await reload()
      return id
    },
    [reload],
  )

  const renameMap = useCallback(
    async (id: MapId, name: MapName): Promise<void> => {
      await catalogService.renameMap(id, name)
      await reload()
    },
    [reload],
  )

  const deleteMap = useCallback(
    async (id: MapId): Promise<void> => {
      await catalogService.deleteMap(id)
      await reload()
    },
    [reload],
  )

  return { summaries, isLoading, error, createMap, renameMap, deleteMap }
}
