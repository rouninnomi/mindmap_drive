const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client'
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const SESSION_STORAGE_KEY = 'mindmap_drive_google_token'
// トークンの実際の有効期限より早めに失効扱いにし、期限ぎりぎりでのAPI呼び出し失敗を防ぐ
const EXPIRY_SAFETY_MARGIN_MS = 60_000

interface GoogleTokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
}

interface StoredToken {
  accessToken: string
  expiresAt: number
}

interface GoogleTokenClient {
  requestAccessToken(overrideConfig?: { prompt?: string }): void
}

interface GoogleAccountsOauth2 {
  initTokenClient(config: {
    client_id: string
    scope: string
    callback: (response: GoogleTokenResponse) => void
    error_callback?: () => void
  }): GoogleTokenClient
  revoke(accessToken: string, done?: () => void): void
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: GoogleAccountsOauth2
      }
    }
  }
}

/** ログインが必要(未ログイン、または無言再認可に失敗した)ことを表すエラー。 */
export class GoogleAuthRequiredError extends Error {
  constructor() {
    super('Google sign-in is required')
    this.name = 'GoogleAuthRequiredError'
  }
}

interface PendingTokenRequest {
  resolve: (token: string) => void
  reject: (error: Error) => void
}

/**
 * Google Identity Services (GIS) のトークンクライアントを用いた認証アダプタ
 * (architecture.md 4.1節)。リフレッシュトークンは扱わない(トークンクライアント
 * 方式のため)方針は変わらないが、取得済みのアクセストークン(短命)は
 * `sessionStorage`にも保持し、同じタブでのページ再読み込みのたびにログインし
 * 直す必要がないようにする(タブを閉じれば消える。ユーザーフィードバックにより追加。
 * 無言の再認可(prompt: '')はGISの実装上ポップアップを使うため、ページ読み込み時のような
 * ユーザー操作を伴わないタイミングではブラウザのポップアップブロックにより
 * ほぼ確実に失敗する。そのため、まずこの永続化されたトークンを使う経路を優先する)。
 */
export class GoogleAuth {
  private readonly clientId: string
  private tokenClient: GoogleTokenClient | null = null
  private accessToken: string | null = null
  private gisLoadPromise: Promise<void> | null = null
  private pending: PendingTokenRequest | null = null

  constructor(clientId: string) {
    this.clientId = clientId
    this.accessToken = this.loadStoredToken()
  }

  isSignedIn(): boolean {
    return this.accessToken !== null
  }

  /** ユーザー操作による明示的なログイン(同意画面を表示する)。 */
  async login(): Promise<void> {
    await this.requestToken('consent')
  }

  logout(): void {
    if (this.accessToken && window.google) {
      window.google.accounts.oauth2.revoke(this.accessToken)
    }
    this.accessToken = null
    this.clearStoredToken()
  }

  /**
   * アクセストークンを返す。保持していない場合はまず無言の再認可(prompt: '')
   * を試み、それも失敗した場合は`GoogleAuthRequiredError`を投げる
   * (呼び出し側は「Googleでログイン」導線を表示する)。
   */
  async getAccessToken(): Promise<string> {
    if (this.accessToken) {
      return this.accessToken
    }
    try {
      return await this.requestToken('')
    } catch {
      throw new GoogleAuthRequiredError()
    }
  }

  private loadStoredToken(): string | null {
    try {
      const raw = sessionStorage.getItem(SESSION_STORAGE_KEY)
      if (!raw) {
        return null
      }
      const stored = JSON.parse(raw) as StoredToken
      if (stored.expiresAt <= Date.now()) {
        sessionStorage.removeItem(SESSION_STORAGE_KEY)
        return null
      }
      return stored.accessToken
    } catch {
      return null
    }
  }

  private saveStoredToken(accessToken: string, expiresInSeconds: number | undefined): void {
    const expiresAt = Date.now() + (expiresInSeconds ?? 3600) * 1000 - EXPIRY_SAFETY_MARGIN_MS
    const stored: StoredToken = { accessToken, expiresAt }
    try {
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(stored))
    } catch {
      // プライベートブラウジング等でsessionStorageが使えない場合は、メモリ保持のみで諦める
    }
  }

  private clearStoredToken(): void {
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY)
    } catch {
      // noop
    }
  }

  private async requestToken(prompt: string): Promise<string> {
    const tokenClient = await this.ensureTokenClient()
    return new Promise<string>((resolve, reject) => {
      this.pending = { resolve, reject }
      tokenClient.requestAccessToken({ prompt })
    })
  }

  private handleTokenResponse(response: GoogleTokenResponse): void {
    const pending = this.pending
    this.pending = null
    if (response.error || !response.access_token) {
      pending?.reject(new Error(response.error ?? 'Failed to obtain an access token'))
      return
    }
    this.accessToken = response.access_token
    this.saveStoredToken(this.accessToken, response.expires_in)
    pending?.resolve(this.accessToken)
  }

  private handleTokenError(): void {
    const pending = this.pending
    this.pending = null
    pending?.reject(new GoogleAuthRequiredError())
  }

  private async ensureTokenClient(): Promise<GoogleTokenClient> {
    if (this.tokenClient) {
      return this.tokenClient
    }
    await this.loadGisScript()
    const oauth2 = window.google?.accounts.oauth2
    if (!oauth2) {
      throw new Error('Google Identity Services failed to load')
    }
    this.tokenClient = oauth2.initTokenClient({
      client_id: this.clientId,
      scope: DRIVE_FILE_SCOPE,
      callback: (response) => this.handleTokenResponse(response),
      error_callback: () => this.handleTokenError(),
    })
    return this.tokenClient
  }

  private loadGisScript(): Promise<void> {
    if (window.google?.accounts.oauth2) {
      return Promise.resolve()
    }
    if (!this.gisLoadPromise) {
      this.gisLoadPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script')
        script.src = GIS_SCRIPT_URL
        script.async = true
        script.onload = () => resolve()
        script.onerror = () => reject(new Error('Failed to load Google Identity Services script'))
        document.head.appendChild(script)
      })
    }
    return this.gisLoadPromise
  }
}
