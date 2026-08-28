# mindmap_drive — CLAUDE.md

## プロジェクト概要

自分専用のマインドマップ(アウトライン型)アプリ。ブラウザ上で動作し、PC・スマホどちらからでも同じデータを操作できる。データの保存先は Google Drive とし、特定の機器やブラウザプロファイルに依存しない構成にする。

- 想定ユーザー: 本人のみ(現時点でマルチユーザー・コラボ機能は想定しない)
- 操作スタイル: アウトライン型(Workflowyライク)。箇条書き階層、折りたたみ、キーボード操作中心
- データ配置: Google Drive 上に 1マップ = 1 JSONファイル として保存(OAuth 認証、`drive.file` スコープ想定)

## 技術方針

- フロントエンドオンリー。専用バックエンドは持たず、静的ホスティング(GitHub Pages / Vercel 等)を想定
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

- **現在: アプリケーション層(`src/application/`)実装完了**(`MindMapCatalogService`, `MindMapEditingService`。Undo/Redo・変更通知・自動保存デバウンスを含む。ドメイン層の`MindMapRepository`に`create`メソッドを追加。単体テスト計32件、`npm run build`・`npm test`・`npm run lint`とも通過確認済み)
- 次: `docs/task.md` 3節に沿ってインフラ層(`src/infrastructure/drive/`: `googleAuth.ts`, `DriveMindMapRepository.ts`, `DriveAttachmentStorage.ts`)の実装に着手。着手前にGoogle Cloud Console側のOAuthクライアントID発行(ユーザー手動作業)が必要
- 実装時はドメイン層→アプリケーション層→インフラ層→プレゼンテーション層の順に進め、都度ブラウザ(claude-in-chromeスキル併用)で動作確認する

このセクションはフェーズが進むたびに更新すること。
