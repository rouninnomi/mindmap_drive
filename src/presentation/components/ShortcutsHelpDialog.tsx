import type { KeyboardEvent } from 'react'

interface ShortcutItem {
  keys: string
  description: string
}

interface ShortcutGroup {
  title: string
  items: ShortcutItem[]
}

// MapEditorPage.tsxのショートカット実装(handleSelectedKeyDown/handleEditingKeyDown/
// グローバルのkeydownハンドラ)に合わせた一覧。実装を変更したらここも合わせて更新する。
const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: '選択中・文字入力中の両方',
    items: [
      { keys: 'Enter', description: '兄弟ノードを追加してその文字入力を開始' },
      { keys: 'Tab', description: '子ノードを追加してその文字入力を開始' },
      { keys: '↑ / ↓', description: '前後の兄弟ノードへ移動' },
      { keys: 'Ctrl + Z', description: '元に戻す' },
      { keys: 'Ctrl + Y / Ctrl + Shift + Z', description: 'やり直す' },
      { keys: 'Ctrl + I', description: '画像を添付(ファイル選択)' },
      { keys: 'Backspace / Delete', description: 'ノードを削除(文字入力中はテキストが空の時のみ)' },
    ],
  },
  {
    title: '選択中のみ',
    items: [
      { keys: 'ダブルクリック', description: '既存ノードのテキストを編集(文字入力モードへ)' },
      { keys: '← / →', description: '親ノード / 最初の子ノードへ移動' },
      { keys: 'Ctrl + ←', description: '折りたたむ' },
      { keys: 'Ctrl + →', description: '展開する(押すたびに1階層ずつ深く)' },
      { keys: 'Ctrl + C / Ctrl + X / Ctrl + V', description: 'ノードのコピー / 切り取り / 子として貼り付け' },
      { keys: 'Ctrl + クリック', description: '兄弟ノードを複数選択に追加/除外' },
      { keys: 'Shift + クリック / Shift + ↑ / Shift + ↓', description: '兄弟ノードの範囲選択(伸縮)' },
      { keys: 'Enter(複数選択中)', description: '選択したノードを1つに統合' },
      { keys: 'Esc(複数選択中)', description: '複数選択を解除' },
    ],
  },
  {
    title: '文字入力中のみ',
    items: [
      { keys: 'Shift + Enter', description: 'カーソル位置でテキストを分割し、新しい兄弟ノードへ' },
      { keys: 'Esc', description: '選択状態のまま文字入力のみ抜ける' },
    ],
  },
  {
    title: '全体(常時)',
    items: [
      { keys: 'Ctrl + Shift + →', description: 'マップ内の全ノードを展開' },
      { keys: 'Ctrl + Shift + ←', description: 'マップ内の全ノードを折りたたみ' },
    ],
  },
]

interface ShortcutsHelpDialogProps {
  onClose: () => void
}

export function ShortcutsHelpDialog({ onClose }: ShortcutsHelpDialogProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
    }
  }

  return (
    <div
      className="shortcuts-dialog-overlay"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      role="presentation"
    >
      <div
        className="shortcuts-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="ショートカット一覧"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shortcuts-dialog-header">
          <h2>ショートカット一覧</h2>
          <button type="button" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </div>
        <div className="shortcuts-dialog-body">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.title} className="shortcuts-group">
              <h3>{group.title}</h3>
              <dl>
                {group.items.map((item) => (
                  <div key={item.keys} className="shortcuts-row">
                    <dt>{item.keys}</dt>
                    <dd>{item.description}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
