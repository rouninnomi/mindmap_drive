interface LoginButtonProps {
  onLogin: () => void
  error?: Error | null
}

/** Google未ログイン時に表示するログイン画面(architecture.md 4.1節)。 */
export function LoginButton({ onLogin, error }: LoginButtonProps) {
  return (
    <div className="login-screen">
      <h1>MindMap Drive</h1>
      <p>Google Driveにマインドマップを保存します。続けるにはログインしてください。</p>
      <button type="button" className="login-button" onClick={onLogin}>
        Googleでログイン
      </button>
      {error && <p className="error-text">ログインに失敗しました: {error.message}</p>}
    </div>
  )
}
