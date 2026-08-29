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

## 3. インフラ層(`src/infrastructure/drive/`)(コード実装完了、手動設定は未実施)

- [x] `googleAuth.ts`: GIS トークンクライアントの初期化、ログイン/ログアウト、`drive.file`スコープ、無言再認可(`GoogleAuthRequiredError`で呼び出し側に再ログインが必要なことを伝える)
- [x] `DriveMindMapRepository.ts`: アプリ専用フォルダの検索/作成、JSONのシリアライズ/デシリアライズ、findAllSummaries/findById/save/delete
  - `findAllSummaries`が本文(全ノード)をダウンロードせずに済むよう、マップ名・更新日時をDriveファイルの`properties`にも複製して保存する方式を採用(save/create時に同期)
- [x] `DriveAttachmentStorage.ts`: 画像アップロード/取得URL(`drive.file`スコープでは公開リンクを発行できないため、認可付きリクエストで取得したBlobをObject URL化)/削除
- [x] 補助モジュール `driveApi.ts`(認可付きfetch、アプリ専用フォルダ解決、multipart作成/更新の共通処理)、`mindMapJson.ts`(MindMap⇔JSON変換、純粋関数でユニットテスト済み)を追加(architecture.md 6節のファイル一覧からの実装時拡張)
- [x] `MindMapRepository`実装のみで完結するテストとして`mindMapJson.test.ts`(往復変換)を追加。Drive API・GISへの実通信は自動テスト対象外(ライブのGoogleアカウント・OAuth同意が必要なため)
- [x] Vite環境変数の型定義(`src/vite-env.d.ts`)と`.env.example`(`VITE_GOOGLE_CLIENT_ID`)を追加
- [x] **Google Cloud Console側の設定(手動作業、完了)**: 専用プロジェクト`mindmap-drive`(プロジェクトID: `mindmap-drive-506913`)を新規作成、Google Drive API有効化、OAuth同意画面(外部・テストモード、テストユーザーに`rouninnomi@gmail.com`を登録)、OAuthクライアントID発行(ウェブアプリケーション、承認済みJavaScript生成元に`http://localhost:5173`を登録)。`.env`に`VITE_GOOGLE_CLIENT_ID`を設定済み(`.env`はgit管理外)。本番デプロイ先が決まったら、そのオリジンをクライアントIDの承認済みJavaScript生成元に追加すること
- [x] 実際のGoogleアカウントでブラウザ動作確認(ログイン→マップ作成→保存→一覧表示→再読み込みでの復元)。プレゼンテーション層(4節)実装後にまとめて実施し、以下の2点の不具合を発見・修正した
  - インデント/アウトデント直後にテキストが失われる不具合(未コミットのローカル入力バッファが、ノード移動に伴うReactのアンマウントで消えていた)
  - キーボードでのUndo/Redo直後にフォーカスが失われ、以降のショートカットが効かなくなる不具合(構造変更を伴うのに、フォーカス復元処理が呼ばれていなかった)

## 4. プレゼンテーション層(`src/presentation/`)(完了)

- [x] `hooks/useMindMapCatalog.ts` / `hooks/useMindMapEditor.ts`(useSyncExternalStore接続)
- [x] `components/LoginButton.tsx`
- [x] `pages/MapListPage.tsx`: 一覧・新規作成・名前変更・削除
- [x] `pages/MapEditorPage.tsx`: キーボードショートカット(要件定義4.3節の表がテキスト入力中の文字と衝突する箇所は実装時に調整。詳細は`MapEditorPage.tsx`冒頭のコメントと`requirements.md` 4.3節の注記を参照)
- [x] `components/AttachmentViewer.tsx`: 画像添付の表示・追加(サムネイル+クリックで新規タブ表示)
- [x] `components/Toolbar.tsx`: Undo/Redoボタン・保存インジケータ・戻る/名前変更
- [x] レスポンシブ対応の基本CSS(@media、iOSズーム防止のための16px入力フォント、タッチターゲットサイズ調整)を実装。実機/真の狭幅ビューポートでの目視確認は未実施(自動化環境のブラウザウィンドウが約630px未満に縮小できなかったため)
- [ ] 画像添付(Ctrl+I)の実機確認: ネイティブファイル選択ダイアログはブラウザ自動化から操作できないため未検証。ユーザー側での確認が必要

## 4.5 マップ編集画面をノード&エッジのキャンバス表示へ変更(ユーザー要望、完了)

アウトライン(箇条書き)表示だけでは「ノードとエッジを視覚的に表示し、ドラッグ&ドロップで自由に移動・再親子付けしたい」という要望に応えられないため、`docs/requirements.md` 3節・4.3節を更新のうえ実施。詳細は`docs/architecture.md` 3.5節を参照。

- [x] ドメイン層に`MindMap.moveNode(nodeId, newParentId)`を追加(循環参照防止つき。単体テストあり)
- [x] `MindMapEditingService.moveNode`ラッパーを追加(Undo/Redo・自動保存対応。単体テストあり)
- [x] `@xyflow/react`(React Flow)・`d3-hierarchy`を依存関係に追加
- [x] `src/presentation/canvasLayout.ts`: 木構造→React Flowのnodes/edges変換(自動レイアウト、折りたたみ考慮)
- [x] `components/OutlineNode.tsx`を`components/MindMapCanvasNode.tsx`(React Flowカスタムノード)に置き換え
- [x] `MapEditorPage.tsx`をReact Flowキャンバスとして書き直し。ドラッグ&ドロップでの再親子付け(`onNodeDragStop`での当たり判定→`moveNode`呼び出し)、既存のキーボードショートカットの移植
- [x] React Flow用CSS(`.mindmap-canvas`等)を追加。実装中に「`.react-flow`要素の高さが0になり何も描画されない」問題が発生し、flexboxの入れ子ではなく`position: absolute; inset: 0`に変更して解決
- [x] ノードのラッパー要素ではなく内部の`<input>`がクリックでフォーカスされるよう`nodesFocusable={false}`を設定
- [x] 全40テスト・`npm run build`・`npm run lint`通過確認、claude-in-chromeスキルでの実機確認(ドラッグでの再親子付け・Undo・キーボードショートカットが動作することを確認)
- **既知の軽微な課題**: Enterキーで新規ノードを作成した直後の自動フォーカスが、React Flow自身の内部再描画とのタイミング競合により、まれに(特に極めて短い間隔で連続操作した場合)効かないことがある。フォーカス済みのノードでの通常の編集・ショートカット操作は問題なく動作する

## 5. 仕上げ

- [ ] 手動での結合確認(マップ作成 → 編集 → 画像添付 → Undo → 自動保存 → 再読み込みで復元)
- [ ] 静的ホスティングへのデプロイ設定(GitHub Pages / Vercel 等を選定)
- [ ] READMEの整備(セットアップ手順、Google Cloud設定手順)

## 進め方の原則

- 各層の実装後、`npm run build` の型チェックが通ることを確認してから次の層へ進む
- UI層に到達したら、ブラウザ(claude-in-chromeスキル、または手動確認)で都度動作を見ながら進める
