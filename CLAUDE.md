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
  - キーボードショートカットは要件定義4.3節の表を一部実装時に調整(`Tab`はインデント動作、折りたたみは`Ctrl+/`、画像添付は`Ctrl+I`など。詳細は`docs/requirements.md` 4.3節の注記と`MapEditorPage.tsx`冒頭コメント参照)
  - claude-in-chromeスキルでの結合テストで、アウトライン表示時代に以下2件、キャンバス化の際にさらに複数件の不具合を発見・修正済み(詳細はセッション履歴参照。代表例: インデント/アウトデント直後にテキストが失われる不具合、Undo/Redo直後にフォーカスが失われる不具合、React Flowの`.react-flow`要素の高さが0になり描画されない不具合、ノードラッパーがクリックのフォーカスを奪う不具合)
  - **既知の軽微な課題**: Enterキーでの新規ノード作成直後の自動フォーカスが、React Flow自身の内部再描画とのタイミング競合によりまれに効かないことがある(`docs/task.md` 4.5節参照)
  - 単体テスト計40件、`npm run build`・`npm test`・`npm run lint`とも通過確認済み
  - **Google Cloud Console**: 専用プロジェクト`mindmap-drive`(プロジェクトID: `mindmap-drive-506913`)、OAuthクライアントID発行済み、`.env`設定済み。本番デプロイ先が決まったらそのオリジンを承認済みJavaScript生成元に追加要
  - 画像添付(`Ctrl+I`)はclaude-in-chromeのfile_uploadツールで確認済み(アップロード・保存・サムネイル表示・Undo/Redo・再読み込みでの復元すべて正常動作)
  - **未検証**: 真の狭幅(スマホ実機)ビューポートでの目視確認(自動化環境のブラウザウィンドウが約630px未満に縮小できなかったため)
  - 手動での結合確認(マップ作成→編集→画像添付→Undo/Redo→自動保存→再読み込みでの復元)も実施済み
  - `README.md`を新規作成(セットアップ手順・Google Cloud設定手順・コマンド一覧・デプロイ手順)
  - **デプロイ先はGitHub Pagesに決定**(当初Vercelを検討したが、リポジトリをPublic化する方針に変更したため切り替え)。`gh` CLIをインストールのうえ、リポジトリのPublic化・`VITE_GOOGLE_CLIENT_ID`のリポジトリシークレット登録・GitHub Pages有効化(ソース: GitHub Actions)を実施済み。`.github/workflows/deploy.yml`でpushをトリガーに自動デプロイする。公開URL: `https://rouninnomi.github.io/mindmap_drive/`
  - Google Cloud ConsoleのOAuthクライアントIDの承認済みJavaScript生成元に `https://rouninnomi.github.io` を追加済み
- 残っているのは真の狭幅(スマホ実機)ビューポートでの目視確認のみ(あれば尚可、必須ではない)
- 実装時はドメイン層→アプリケーション層→インフラ層→プレゼンテーション層の順に進め、都度ブラウザ(claude-in-chromeスキル併用)で動作確認する

このセクションはフェーズが進むたびに更新すること。
