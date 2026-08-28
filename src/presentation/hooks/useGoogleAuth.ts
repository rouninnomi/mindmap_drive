import { useCallback, useEffect, useState } from 'react'
import { googleAuth } from '../services'

export type GoogleAuthStatus = 'checking' | 'signedOut' | 'signedIn'

/**
 * アプリ起動時に無言の再認可(GoogleAuth側でprompt: ''を試行)を行い、
 * ログイン状態を判定する。失敗時は「Googleでログイン」導線を表示できるよう
 * `signedOut`を返す(architecture.md 4.1節)。
 */
export function useGoogleAuth() {
  const [status, setStatus] = useState<GoogleAuthStatus>('checking')
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false
    googleAuth
      .getAccessToken()
      .then(() => {
        if (!cancelled) {
          setStatus('signedIn')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('signedOut')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async () => {
    setError(null)
    try {
      await googleAuth.login()
      setStatus('signedIn')
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    }
  }, [])

  const logout = useCallback(() => {
    googleAuth.logout()
    setStatus('signedOut')
  }, [])

  return { status, error, login, logout }
}
