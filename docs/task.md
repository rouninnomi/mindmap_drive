# 実装タスク一覧 — mindmap_drive

作成日: 2026-08-28
前提: `docs/requirements.md`, `docs/domain-model.md`, `docs/architecture.md`

`docs/architecture.md` 7節の方針どおり、ドメイン層 → アプリケーション層 → インフラ層 → プレゼンテーション層の順に進める。各層は実装後にビルド/型チェックが通ることを確認してから次へ進む。

## 0. スキャフォールディング(完了)

- [x] Vite + React + TypeScript プロジェクト作成
- [x] `npm install`、開発サーバー起動確認(`http://localhost:5173/`)
- [x] DDDレイヤーのフォルダスケルトン作成(`src/domain/mindmap`, `src/application`, `src/infrastructure/drive`, `src/presentation/{pages,components,hooks}`)

## 1. ドメイン層(`src/domain/mindmap/`)(完了)

- [x] 値オブジェクト実装(`valueObjects.ts`): MapId, MapName, NodeId, NodeText, Attachment, AttachmentId, MindMapSnapshot, MapSummary
- [x] `Node.ts`: エンティティ実装(text/children/collapsed/attachments)
- [x] `MindMap.ts`: 集約ルート実装
  - 非表示ルートノードの初期化
  - addSiblingNode / addChildNode / indent / outdent / moveUp / moveDown / deleteNode(カスケード) / toggleCollapse / updateText / attachImage / removeAttachment / rename
  - createSnapshot / restoreSnapshot
  - 不変条件(マップ名非空 等)のチェック。indent/outdent/moveUp/moveDownは既存の親子関係の中でのみノードを動かすため循環参照は構造上発生しない
- [x] `MindMapRepository.ts` / `AttachmentStorage.ts`: リポジトリインターフェース定義
- [x] ドメイン層の単体テスト(`MindMap.test.ts`、vitest導入。木構造操作・不変条件・スナップショット復元。`npm test`で実行)

## 2. アプリケーション層(`src/application/`)(完了)

- [x] `MindMapCatalogService.ts`: listMaps / createMap / renameMap / deleteMap
- [x] `MindMapEditingService.ts`
  - ドメイン集約メソッドのラップ
  - Undo/Redoスタック(上限50件、redoStackのclearルール)
  - 変更通知(Observer/subscribe)
  - 自動保存のデバウンス(1.5秒)スケジューリング
  - `flushPendingSave()`: visibilitychange/beforeunload用の即時保存(呼び出しはpresentation層で配線予定)
- [x] `MindMapRepository`に`create(name)`を追加(`domain-model.md`更新。MapId=DriveのfileIdのためID採番はリポジトリ実装側の責務)
- [x] アプリケーション層の単体テスト(`MindMapCatalogService.test.ts`, `MindMapEditingService.test.ts`。フェイクリポジトリ+vitestのフェイクタイマーでデバウンス・Undo/Redo上限を検証)

## 3. インフラ層(`src/infrastructure/drive/`)

- [ ] `googleAuth.ts`: GIS トークンクライアントの初期化、ログイン/ログアウト、`drive.file`スコープ、無言再認可
- [ ] `DriveMindMapRepository.ts`: アプリ専用フォルダの検索/作成、JSONのシリアライズ/デシリアライズ、findAllSummaries/findById/save/delete
- [ ] `DriveAttachmentStorage.ts`: 画像アップロード/取得URL/削除
- [ ] Google Cloud Console側の設定(OAuthクライアントID発行、承認済みJavaScript生成元の登録)— 手動作業、要ユーザー実施

## 4. プレゼンテーション層(`src/presentation/`)

- [ ] `hooks/useMindMapCatalog.ts` / `hooks/useMindMapEditor.ts`(useSyncExternalStore接続)
- [ ] `components/LoginButton.tsx`
- [ ] `pages/MapListPage.tsx`: 一覧・新規作成・名前変更・削除
- [ ] `pages/MapEditorPage.tsx` / `components/OutlineNode.tsx`: アウトライン編集UI、キーボードショートカット(要件定義4.3節の表に準拠)
- [ ] `components/AttachmentViewer.tsx`: 画像添付の表示・追加
- [ ] `components/Toolbar.tsx`: Undo/Redoボタン等
- [ ] レスポンシブ対応(PC/スマホ)・タッチ操作の調整

## 5. 仕上げ

- [ ] 手動での結合確認(マップ作成 → 編集 → 画像添付 → Undo → 自動保存 → 再読み込みで復元)
- [ ] 静的ホスティングへのデプロイ設定(GitHub Pages / Vercel 等を選定)
- [ ] READMEの整備(セットアップ手順、Google Cloud設定手順)

## 進め方の原則

- 各層の実装後、`npm run build` の型チェックが通ることを確認してから次の層へ進む
- UI層に到達したら、ブラウザ(claude-in-chromeスキル、または手動確認)で都度動作を見ながら進める
