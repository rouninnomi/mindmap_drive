import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GoogleAuth, GoogleAuthRequiredError } from './googleAuth'

/**
 * テスト実行環境(vitestのデフォルトのnode環境)には`sessionStorage`が存在しないため、
 * メモリ上だけの最小限の実装を用意する(MindMapEditingService.test.tsと同様)。
 */
class MemoryStorage implements Storage {
  private readonly store = new Map<string, string>()

  get length(): number {
    return this.store.size
  }

  clear(): void {
    this.store.clear()
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }
}

interface FakeTokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
}

/**
 * `window.google.accounts.oauth2`の最小限のフェイク実装。実際のGISと同様、
 * `initTokenClient`で登録されたcallback/error_callbackを、`respond`/`triggerError`で
 * 明示的に発火させることでトークン取得の非同期応答を再現する。
 */
function createFakeOauth2() {
  let callback: ((response: FakeTokenResponse) => void) | null = null
  let errorCallback: (() => void) | null = null
  const requestCalls: { prompt?: string }[] = []

  const oauth2 = {
    initTokenClient: (config: {
      callback: (response: FakeTokenResponse) => void
      error_callback?: () => void
    }) => {
      callback = config.callback
      errorCallback = config.error_callback ?? null
      return {
        requestAccessToken: (overrideConfig?: { prompt?: string }) => {
          requestCalls.push(overrideConfig ?? {})
        },
      }
    },
    revoke: vi.fn(),
  }

  return {
    oauth2,
    requestCalls,
    respond: (response: FakeTokenResponse) => callback?.(response),
    triggerError: () => errorCallback?.(),
  }
}

/** 純粋なPromiseチェーンのマイクロタスクを進める(fakeタイマー下では実タイマーが無いため必要)。 */
async function flushMicrotasks(times = 10): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve()
  }
}

describe('GoogleAuth', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('sessionStorage', new MemoryStorage())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('取得済みのアクセストークンは、有効期限内であれば再認可を行わずそのまま返す', async () => {
    const fake = createFakeOauth2()
    vi.stubGlobal('window', { google: { accounts: { oauth2: fake.oauth2 } } })
    const auth = new GoogleAuth('client-id')

    const first = auth.getAccessToken()
    await flushMicrotasks()
    fake.respond({ access_token: 'token-1', expires_in: 3600 })
    await expect(first).resolves.toBe('token-1')

    const second = await auth.getAccessToken()

    expect(second).toBe('token-1')
    expect(fake.requestCalls).toHaveLength(1)
  })

  it('メモリ上のトークンが期限切れになったら、次の呼び出しで無言の再認可(prompt: "")を行う(以前は起動時にしか期限チェックしておらず、タブを開いたまま失効しても気付けなかった)', async () => {
    const fake = createFakeOauth2()
    vi.stubGlobal('window', { google: { accounts: { oauth2: fake.oauth2 } } })
    const auth = new GoogleAuth('client-id')

    const first = auth.getAccessToken()
    await flushMicrotasks()
    fake.respond({ access_token: 'token-1', expires_in: 3600 })
    await first

    vi.advanceTimersByTime(3600 * 1000)

    const second = auth.getAccessToken()
    await flushMicrotasks()

    expect(fake.requestCalls).toHaveLength(2)
    expect(fake.requestCalls[1]).toEqual({ prompt: '' })

    fake.respond({ access_token: 'token-2', expires_in: 3600 })
    await expect(second).resolves.toBe('token-2')
  })

  it('無言の再認可の進行中に複数箇所から呼ばれても、進行中のリクエストを使い回して1回にまとめる(以前は呼び出しごとにpendingを上書きし、先に呼ばれた側が永遠に解決しない競合バグがあった)', async () => {
    const fake = createFakeOauth2()
    vi.stubGlobal('window', { google: { accounts: { oauth2: fake.oauth2 } } })
    const auth = new GoogleAuth('client-id')

    const first = auth.getAccessToken()
    const second = auth.getAccessToken()
    await flushMicrotasks()

    expect(fake.requestCalls).toHaveLength(1)
    fake.respond({ access_token: 'token-1', expires_in: 3600 })

    await expect(first).resolves.toBe('token-1')
    await expect(second).resolves.toBe('token-1')
  })

  it('無言の再認可が失敗した場合はGoogleAuthRequiredErrorを投げる', async () => {
    const fake = createFakeOauth2()
    vi.stubGlobal('window', { google: { accounts: { oauth2: fake.oauth2 } } })
    const auth = new GoogleAuth('client-id')

    const promise = auth.getAccessToken()
    await flushMicrotasks()
    fake.triggerError()

    await expect(promise).rejects.toBeInstanceOf(GoogleAuthRequiredError)
  })
})
