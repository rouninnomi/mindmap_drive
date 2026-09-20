# mindmap_drive — CLAUDE.md

## プロジェクト概要

自分専用のマインドマップ(アウトライン型)アプリ。ブラウザ上で動作し、PC・スマホどちらからでも同じデータを操作できる。データの保存先は Google Drive とし、特定の機器やブラウザプロファイルに依存しない構成にする。

- 想定ユーザー: 本人のみ(現時点でマルチユーザー・コラボ機能は想定しない)
- 操作スタイル: ノード&エッジのキャンバス表示(ドラッグ&ドロップでの自由な再親子付けに対応)+ キーボード中心の高速なテキスト入力。当初はWorkflowyライクな箇条書き表示を想定していたが、実装完了後にユーザー要望で視覚的なキャンバス表示へ変更した(詳細は`docs/requirements.md` 3節・4.3節末尾の注記、`docs/architecture.md` 3.5節参照)
- データ配置: Google Drive 上に 1マップ = 1 JSONファイル として保存(OAuth 認証、`drive.file` スコープ想定)

## 技術方針

- フロントエンドオンリー。専用バックエンドは持たず、静的ホスティング(GitHub Pages)
- React + TypeScript
- DDD(ドメイン駆動設計)のレイヤリングを採用する

### ディレクトリ構成(スケルトン作成済み。中身は`docs/task.md`に沿って実装中)

```
src/
  domain/          # MindMap, Node などのエンティティ・値オブジェクト・リポジトリインターフェース
  application/      # ユースケース(ノード追加/移動/Drive保存 等)
  infrastructure/   # Google Drive API アダプタ、OAuth、リポジトリ実装
  presentation/      # React コンポーネント・hooks・状態管理
```

- `domain/` は Google Drive や React に一切依存しない、純粋なドメインロジックのみを置く
- `infrastructure/` が `domain/` のリポジトリインターフェースを実装する形で Drive 連携を行う

## ドキュメント運用

`docs/` 配下にフェーズごとのドキュメントを置く。DDDの進め方に合わせて、要件定義 → ドメインモデリング → アーキテクチャ設計 → 実装、の順で段階的に文書化する。

- `docs/requirements.md` — 要件定義書(作成済み)
- `docs/domain-model.md` — ドメインモデル(集約・エンティティ・値オブジェクト・リポジトリIF・ユビキタス言語)(作成済み)
- `docs/architecture.md` — アーキテクチャ設計(作成済み)
- `docs/task.md` — 実装タスク一覧(作成済み)

ドキュメントは日本語で書く。コード中の識別子・コメントは英語命名を基本とする。

## リポジトリ

- GitHub: https://github.com/rouninnomi/mindmap_drive (Private)
- ローカル `master` ブランチが `origin/master` と紐付き済み

## 現在のフェーズ状況

- **現在: `docs/task.md` の実装タスクはコード側で対応可能な範囲がすべて完了(5節「仕上げ」含む)。残るのはユーザー側の手動作業のみ**
  - 表示方式変更の詳細は`docs/requirements.md` 3節・4.3節末尾の注記、`docs/architecture.md` 3.5節、`docs/task.md` 4.5節を参照。`@xyflow/react`(React Flow)+`d3-hierarchy`で自動レイアウトのキャンバスを構築し、ドラッグ&ドロップでの再親子付け(`MindMap.moveNode`をドメイン層に新規追加)に対応した。ドメイン層の親子ツリー構造自体は変更していない
  - プレゼンテーション層(`src/presentation/`): `useMindMapCatalog`/`useMindMapEditor`フック、`LoginButton`、`MapListPage`、`MapEditorPage`(React Flowキャンバス)/`MindMapCanvasNode`、`AttachmentViewer`、`Toolbar`、`canvasLayout.ts`を実装
  - キーボードショートカットは要件定義4.3節の表を実装時・ユーザーフィードバックにより調整(詳細は`docs/requirements.md` 4.3節の注記と`MapEditorPage.tsx`冒頭コメント参照)。当初の「常に`<input>`で編集」方式から、ユーザーからの追加フィードバックにより「選択(selected)」と「文字入力(editing)」の2モードへ変更した:
    - クリックで選択(地の文表示)。選択中・文字入力中どちらも`Enter`で兄弟ノード追加、`Tab`で子ノード追加。既存ノードのテキスト編集はダブルクリック、`Esc`で選択状態のまま文字入力のみ抜ける
    - `Backspace`/`Delete`は選択中はテキスト有無によらず即削除。折りたたみ/展開は選択中のみ`Ctrl+←`/`Ctrl+→`。画像添付は`Ctrl+I`に加えてノードへのファイルの直接ドラッグ&ドロップにも対応
    - ノード間移動は`↑`/`↓`がDFS順、`←`/`→`(選択中のみ)が親/最初の子ノードへの移動
    - ノード本体のドラッグ範囲をテキストラベル部分まで拡大した際、React Flow自身のドラッグ判定でネイティブ`click`イベントが発火しないことがある不具合を発見し、pointerdown/upの移動量で自前判定する方式に変更して解消
    - 折りたたみ/展開マーカー(▾/▸)は視認性向上のため拡大し、ノード右側に表示する配置に変更。React Flowの接続ハンドル(丸印)は`nodesConnectable={false}`で無効化しているにもかかわらず十字カーソルが出て紛らわしかったため非表示化した
  - claude-in-chromeスキルでの結合テストで、アウトライン表示時代に以下2件、キャンバス化の際にさらに複数件の不具合を発見・修正済み(詳細はセッション履歴参照。代表例: インデント/アウトデント直後にテキストが失われる不具合、Undo/Redo直後にフォーカスが失われる不具合、React Flowの`.react-flow`要素の高さが0になり描画されない不具合、ノードラッパーがクリックのフォーカスを奪う不具合)
  - **既知の軽微な課題は解消済み**: 新規ノード作成直後の自動フォーカスがまれに効かない不具合は、React Flowが寸法計測を終えるまで新規ノードを`visibility: hidden`で描画することが原因と判明し、見えるようになるまで`requestAnimationFrame`で再試行する方式に修正して解消した(`docs/task.md` 4.5節の記載も解消済みとして更新要)
  - 単体テスト計45件、`npm run build`・`npm test`・`npm run lint`とも通過確認済み
  - **Google Cloud Console**: 専用プロジェクト`mindmap-drive`(プロジェクトID: `mindmap-drive-506913`)、OAuthクライアントID発行済み、`.env`設定済み。本番デプロイ先が決まったらそのオリジンを承認済みJavaScript生成元に追加要
  - 画像添付(`Ctrl+I`)はclaude-in-chromeのfile_uploadツールで確認済み(アップロード・保存・サムネイル表示・Undo/Redo・再読み込みでの復元すべて正常動作)
  - **未検証**: 真の狭幅(スマホ実機)ビューポートでの目視確認(自動化環境のブラウザウィンドウが約630px未満に縮小できなかったため)
  - 手動での結合確認(マップ作成→編集→画像添付→Undo/Redo→自動保存→再読み込みでの復元)も実施済み
  - `README.md`を新規作成(セットアップ手順・Google Cloud設定手順・コマンド一覧・デプロイ手順)
  - **デプロイ先はGitHub Pagesに決定**(当初Vercelを検討したが、リポジトリをPublic化する方針に変更したため切り替え)。`gh` CLIをインストールのうえ、リポジトリのPublic化・`VITE_GOOGLE_CLIENT_ID`のリポジトリシークレット登録・GitHub Pages有効化(ソース: GitHub Actions)を実施済み。`.github/workflows/deploy.yml`でpushをトリガーに自動デプロイする。公開URL: `https://rouninnomi.github.io/mindmap_drive/`
  - Google Cloud ConsoleのOAuthクライアントIDの承認済みJavaScript生成元に `https://rouninnomi.github.io` を追加済み
- **公開後、実際の利用の中でのユーザーフィードバックにより追加した機能・修正(2026-09-19〜20)**
  - 選択中・文字入力中どちらもEnterで兄弟追加/Tabで子追加に統一(以前は選択中のEnterのみ挙動が違った)。文字入力中の`Shift+Enter`でカーソル位置のテキスト分割(`MindMap.splitNode`)、`Ctrl+クリック`/`Shift+クリック`での兄弟ノード複数選択+`Enter`でのマージ統合(`MindMap.mergeNodes`)、`Ctrl+Shift+9`/`Ctrl+Shift+0`での全展開/全折りたたみ(`MindMap.expandAll`/`collapseAll`。ブラウザの検索(Ctrl+F)用途)を追加(後日`Ctrl+Shift+←→`に変更。理由は本ファイル下部「市販化に向けた検討」の直前の項目を参照)
  - `↑`/`↓`の移動先をDFS順から同じ親を持つ兄弟間のみに変更(子孫へ入り込んでしまい直感に反していたため)。ノードの選択・文字入力開始時に画面中央へ自動パンする機能も追加
  - 日本語IME変換中に`commitIfChanged`が発火し変換が強制確定・中断される不具合を修正(`event.isComposing`中はコミット・ショートカット処理を両方スキップ)。あわせて、文字入力中の自動保存/Undo記録を一文字ごとではなくEnter/Tab/Esc/↑↓/Undo/Redoなどノードを離れる時のみに変更(自動保存が入力中に頻繁に挟まる問題への対応。副次効果でUndo粒度も改善)
  - 画像添付に`Ctrl+V`でのクリップボード貼り付けを追加。添付画像を持つノードによるキャンバス上の重なりをレイアウトの`separation`調整で解消。画像保存先を`MindMapDrive`直下から`images/<mapId>/`のマップごとのサブフォルダへ整理(フォルダ作成の競合バグも修正)
  - Googleアクセストークンを`sessionStorage`に保持し、同一タブでの再読み込みでは再ログイン不要に(無言の再認可はポップアップ方式でユーザー操作を伴わない場面ではほぼ確実に失敗するため)
  - 一度折りたたんだノードを再展開すると直下の子までの表示に留める(孫以降は畳んだまま)よう`toggleCollapse`を変更(巨大化したマップで孫以降が一気に再展開されるのを防ぐ)
- **ホスティングをGitHub PagesからCloudflare Pagesへ移行(2026-09-20)**
  - 症状: GitHub Pages公開後、Googleログインのポップアップで同意画面まで正常に進み閉じるにもかかわらず、常に`GoogleAuthRequiredError`(「Google sign-in is required」)でログイン失敗。ローカル開発サーバー(`http://localhost:5173`)では同じ操作で問題なくログインできていた
  - 原因: Google Identity Servicesのポップアップ完了検知(コンソールに`Cross-Origin-Opener-Policy policy would block the window.closed call`と出る)が、呼び出し元ページ自身が`Cross-Origin-Opener-Policy: same-origin-allow-popups`ヘッダーを送信することを事実上要求する。GitHub Pagesは静的ホスティングでカスタムHTTPレスポンスヘッダーを設定する手段がなく(`_headers`相当の仕組みがない)、このヘッダーを付与できなかったことが直接原因。ポップアップブロック・拡張機能・サードパーティCookie設定・ブラウザ種別(Chrome/Edge)・Google Cloud Console側の設定(テストユーザー・承認済みオリジン)はすべて切り分けの結果シロだった
  - 対応: `public/_headers`に`Cross-Origin-Opener-Policy: same-origin-allow-popups`を追加し、これに対応するCloudflare Pages(公開URL: `https://mindmap-drive.pages.dev`)へ移行。GitHubリポジトリ連携で`master`push時に自動ビルド(`npm run build` / 出力`dist`)・デプロイ。環境変数`VITE_GOOGLE_CLIENT_ID`はCloudflare Pages側の「Variables and secrets」に設定。Google Cloud ConsoleのOAuthクライアントIDの承認済みJavaScript生成元に新URLを追加
  - `.github/workflows/deploy.yml`(GitHub Pagesへの自動デプロイ)は削除済み。`vite.config.ts`の`GITHUB_PAGES`環境変数によるbaseパス分岐(`/mindmap_drive/`プレフィックス)も不要になったため削除(Cloudflare Pagesはドメインルート配信のため`base: '/'`のデフォルトのままでよい)
  - 詳細は`README.md`の「デプロイ(Cloudflare Pages)」節を参照
- 残っているのは真の狭幅(スマホ実機)ビューポートでの目視確認のみ(あれば尚可、必須ではない)
- 実装時はドメイン層→アプリケーション層→インフラ層→プレゼンテーション層の順に進め、都度ブラウザ(claude-in-chromeスキル併用)で動作確認する
- **全展開/全折りたたみのショートカットを`Ctrl+Shift+9`/`0`から`Ctrl+Shift+→`/`←`に変更(2026-09-20)**: ユーザーの環境で`Ctrl+Shift+9`がブラウザのタブ切り替えショートカットとして扱われてしまい、アプリのショートカットとして機能しない不具合を確認。単一ノードの折りたたみ/展開(`Ctrl+←`/`Ctrl+→`)と対応する`Ctrl+Shift+←`(一括折りたたみ)/`Ctrl+Shift+→`(一括展開)に変更した。変更に伴い、単一ノード用のCtrl+矢印ハンドラがShift併用時に誤発火しないよう明示的にガードを追加(`MapEditorPage.tsx`)

## 市販化に向けた検討(2026-09-20時点、未着手)

ユーザーから「将来的に市販化するなら何をクリアする必要があるか」を問われた際の検討メモ。現時点では方針決定・着手はしておらず、あくまで論点の記録。

### 現行アーキテクチャ(Web版・Google Drive連携)のまま市販化する場合の課題

- **最大のボトルネック**: `drive.file`スコープはGoogleの「センシティブスコープ」に該当し、テストユーザー100人枠を超えて一般公開するにはOAuthアプリ確認(審査)が必要。プライバシーポリシー・利用規約・ドメイン確認・スコープ利用目的の説明などを提出し、Googleの審査(数週間規模)を通す必要がある
- 現行の`response_type=token`(インプリシットフロー)は、Googleが新規クライアントで段階的に制限している方式。将来的に認可コードフロー+PKCEへの移行を求められる可能性がある
- OAuthクライアントのAPIクォータはプロジェクト単位のため、ユーザー増加に応じて上限緩和申請が必要になりうる
- セキュリティレビュー(XSS対策、画像アップロードのバリデーション等)が未実施
- プライバシーポリシー・利用規約・(有料化するなら)特定商取引法表記・データ削除導線などの法務対応がゼロ
- エラー監視・利用状況分析・カスタムドメイン・課金導線(Stripe等)・API濫用対策(レート制限)が未整備
- スマホ実機での動作確認が未完了。複数人での共同編集は現状スコープ外

### 代替案: PCスタンドアロンアプリ化(Electron/Tauri等)

ユーザーからの提案。検討の結果、以下の整理に至った:

- **解決すること**: Google Drive APIを使わずファイルシステムに直接読み書きする設計にすれば、Google OAuth審査そのものが原則不要になる。COOP/ポップアップ問題、APIクォータ、ブラウザ互換性の問題も同時に消える
- **新たに発生すること**: 配布・コード署名(Windows証明書、macOSはApple Developer登録$99/年+公証)、自動アップデート機構、クロスプラットフォーム開発コストが必要になる
- **クロスデバイス要件(要件定義書にある「PC・スマホどちらからでも同じデータにアクセス」)への対処案**: Google Drive APIを使う代わりに、**Google Drive/Dropbox/OneDriveなどのデスクトップ同期クライアントが作るローカルフォルダに保存先を向けるだけ**にする案。アプリ側は同期の仕組みを一切意識せず、OAuth不要のままマルチデバイス同期を維持できる。ただしスマホ単体からの直接編集はできなくなる(同期フォルダのモバイルアプリ経由の閲覧に留まる、等の制約は別途検討要)

### データパッケージ形式についての合意事項

JSON本体と画像添付ファイルが別々に散らばる現行のGoogle Drive保存方式(`images/<mapId>/`サブフォルダ)は、スタンドアロン化する場合はクラウド同期フォルダに置いた際の整合性リスク(同期の中間状態で壊れる等)がある。`.docx`や`.sketch`同様に、**ZIPコンテナへ`map.json` + `images/`をまとめた独自拡張子(例: `.mmap`)** にする方針で合意。書き込みは一時ファイル→リネームのアトミック処理を想定。

このセクションはフェーズが進むたびに更新すること。
