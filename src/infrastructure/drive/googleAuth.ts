const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client'
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

interface GoogleTokenResponse {
  access_token?: string
  error?: string
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
 * (architecture.md 4.1節)。アクセストークンはメモリ上にのみ保持し、
 * 永続化はしない。
 */
export class GoogleAuth {
  private readonly clientId: string
  private tokenClient: GoogleTokenClient | null = null
  private accessToken: string | null = null
  private gisLoadPromise: Promise<void> | null = null
  private pending: PendingTokenRequest | null = null

  constructor(clientId: string) {
    this.clientId = clientId
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
