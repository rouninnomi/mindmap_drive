import { useEffect, useRef, useState } from 'react'

const CHECK_INTERVAL_MS = 5 * 60 * 1000

/**
 * デプロイ済みの`/version.json`を定期的に取得し、今動いているバンドル自身のビルドID
 * (`__APP_BUILD_ID__`。`vite.config.ts`参照)と異なれば新しいバージョンがあると判定する。
 * タブを開けっ放しのまま長時間作業していると、修正をプッシュ・デプロイしても
 * そのタブのJavaScriptは古いまま動き続けてしまう(自動保存やローカルドラフト復旧の
 * 修正が実際には効いていなかった、というユーザーフィードバックにより追加)。
 * 定期ポーリングに加え、バックグラウンドから復帰した瞬間(`visibilitychange`)にも
 * 確認する。ページの自動リロードは行わない(編集中の内容を失わせないため。
 * ローカルドラフト機能があるので手動リロードしても安全なはずだが、それでも
 * ユーザーの判断を挟む)。
 */
export function useNewVersionAvailable(): boolean {
  const [isNewVersionAvailable, setIsNewVersionAvailable] = useState(false)
  const foundRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    const check = async (): Promise<void> => {
      if (foundRef.current) {
        return
      }
      try {
        const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
        if (!response.ok) {
          return
        }
        const data = (await response.json()) as { buildId?: string }
        if (!cancelled && data.buildId && data.buildId !== __APP_BUILD_ID__) {
          foundRef.current = true
          setIsNewVersionAvailable(true)
        }
      } catch {
        // オフライン等での一時的な失敗は無視し、次回のポーリング/復帰時に再確認する
      }
    }

    void check()
    const intervalId = setInterval(() => void check(), CHECK_INTERVAL_MS)
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') {
        void check()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return isNewVersionAvailable
}
