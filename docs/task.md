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
- [x] 画像添付(Ctrl+I)の確認: claude-in-chromeのfile_uploadツール(ネイティブダイアログを介さずファイル入力へ直接ファイルをセットする方式)でテスト画像をアップロードし、Drive保存・サムネイル表示・Undo/Redo・再読み込みでの復元まで一通り確認できた

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
- [x] (解消済み)新規ノード作成直後の自動フォーカスがまれに効かない課題: React Flowが寸法計測を終えるまで新規ノードを`visibility: hidden`で描画することが原因と判明。見えるようになるまで`requestAnimationFrame`で再試行するよう`MindMapCanvasNode.tsx`を修正して解消した(ユーザーフィードバックによるキーボード操作モデルの見直し(下記)に伴う実装で判明・修正)
- [x] (ユーザーフィードバックにより追加)ノードに「選択(selected)」と「文字入力(editing)」の2モードを導入。詳細は`docs/requirements.md` 4.3節・`MapEditorPage.tsx`冒頭コメント参照。あわせて、ノード本体のドラッグ可能範囲をテキストラベルまで拡大した際に発生した「React Flowのドラッグ判定でネイティブclickイベントが発火しないことがある」不具合をpointerdown/up方式での自前クリック判定に変更して解消。折りたたみ/展開マーカーの拡大・右側配置への変更、および使われていないReact Flow接続ハンドル(丸印)の非表示化も実施

## 5. 仕上げ

- [x] 手動での結合確認(マップ作成 → 編集 → 画像添付 → Undo/Redo → 自動保存 → 再読み込みで復元)。claude-in-chromeスキルで実施、いずれも正常動作
- [x] 静的ホスティングへのデプロイ設定: 当初Vercelを選定したが、その後リポジトリをPublic化する方針に変更したためGitHub Pagesへ切り替えた(`gh` CLIで実施: リポジトリのPublic化、`VITE_GOOGLE_CLIENT_ID`のリポジトリシークレット登録、GitHub Pages有効化(ソース: GitHub Actions))
  - [x] `.github/workflows/deploy.yml`: pushをトリガーにビルド→GitHub Pagesへ自動デプロイ
  - [x] `vite.config.ts`: `GITHUB_PAGES`環境変数が立っている時のみ`base: '/mindmap_drive/'`を設定(プロジェクトページ配信のパス対応)
  - 公開URL: `https://rouninnomi.github.io/mindmap_drive/`
  - [x] Google Cloud ConsoleのOAuthクライアントIDの承認済みJavaScript生成元に上記オリジンを追加済み
- [x] READMEの整備(セットアップ手順、Google Cloud設定手順、コマンド一覧、デプロイ手順)

## 6. agyによるプロジェクト全体コードレビューへの対応(2026-09-24)

agy(Gemini系AI CLI、`gemini-3.1-pro-high`)に`src/`配下のドメイン層・アプリケーション層・インフラ層・プレゼンテーション層を読み取り専用でレビューさせた。DDDレイヤリングの依存方向(domainがReact/Google Driveに非依存であること等)は「非常に高い水準で遵守」との評価。以下、指摘事項を深刻度順に記載し、対応が完了次第チェックする。

- [x] **(agyの指摘は誤り、コード確認の結果「実際には再現しない」と判明)最後のノード削除時にUndoが実質不可能になる、との指摘**
  - agyは`MapEditorPage.tsx` 160〜166行目の`useEffect`(`children.length === 0`で空ノードを自動追加)が依存配列`[snapshot.map, ...]`のため編集のたびに毎回発火すると指摘したが、実際には`MindMapEditingService.notify()`(`MindMapEditingService.ts` 359〜368行目)が`renderSnapshot.map`に常に同一の`this.current`インスタンス(ミューテートされるのみで再代入されない)を詰めているため、`snapshot.map`の参照は`load()`時以外変化しない。React側の依存配列比較(`Object.is`)によりこの`useEffect`は初回ロード時以外は再実行されず、agyが説明した「空ノード自動追加のループでUndoスタックが壊れる」という現象は起きないことをコードを追って確認した
  - 教訓として記録: 自動生成のコードレビュー指摘は、依存配列やオブジェクト参照の安定性など実行時の詳細を裏取りしてから対応すること
- [x] **【深刻度：中、修正済み】Undo/Redo直後にフォーカスが消失しキーボード操作が不能になるケースが残っていた**
  - `MapEditorPage.tsx`の`handleSelectedKeyDown`/`handleEditingKeyDown`(Undo/Redoのキー処理)で、Undo/Redoによってツリーから消滅したノードのIDを`selectedNodeId`にセットし続けるケースがあり(対象DOMが存在せずフォーカスが`document.body`へ抜ける)、コード追跡で再現ロジックを確認した本物のバグだった
  - 修正: `restoreFocusAfterHistoryChange`ヘルパーを追加(`MapEditorPage.tsx`)。Undo/Redo後にnodeIdが木構造上に存在するか`root.findById`で確認し、存在すればそのまま選択・存在しなければUndo/Redo前の並び順に近いノードへフォールバックする(`flattenVisibleNodes`で再計算した最新の並びから、元の位置→ひとつ前→先頭の順で探す)
  - `npm run build` / `npm test`(61件)/ `npm run lint`はいずれも通過確認済み。ブラウザでの実機確認はOAuthログインのポップアップがclaude-in-chromeのタブ管理外で開いてしまい自動化できなかったため未実施(手動確認が必要)
- [ ] **【深刻度：低】自分の現在の親へドラッグ&ドロップすると兄弟内で最後尾にジャンプする**
  - `MindMap.ts` 141〜152行目(`moveNode`)。循環参照チェックはすり抜けてエラーにはならないが、削除→再追加により並び順が末尾に変わってしまう
- [ ] **【深刻度：低】画像アップロード時にMIMEタイプを検証せず拡張子を生成**
  - `DriveAttachmentStorage.ts` 36〜37行目。表示は`<img>`経由でXSSリスクはないが、偽装ファイルの拡張子がそのままDriveに反映されうる
- [ ] **【深刻度：低、任意】`MapEditorPage.tsx`の肥大化(約800行)**
  - キーボードショートカット処理(`handleSelectedKeyDown`/`handleEditingKeyDown`)を`useMindMapShortcuts`等のカスタムフックへ切り出す余地
- [ ] **【深刻度：低、任意】JSONインポート時のバリデーションが浅い**
  - `mindMapJson.ts` 49〜57行目の`parseMindMapJson`はトップレベルの存在確認のみで、`root.children`が配列かどうか等の深い構造チェックがなく、不正なJSONインポート時に実行時エラーでクラッシュしうる。Zod等のスキーマバリデーション導入を検討

## 7. 【最優先】長時間利用後、マップ一覧に戻ると再ログインを求められ、かつ自動保存が古い状態までしか反映されていない問題(2026-09-24、ユーザー報告)

ユーザーからの報告: マップを長時間開いたまま編集していると、マップ一覧画面に戻ろうとした際に再ログインを求められることがある。さらにその時点でDrive上に保存されているマップの内容がかなり前の自動保存分までしか反映されておらず、ローカルドラフト復旧バナー(いわゆる「ローカルドラフト」機構、`MindMapEditingService.persistDraft`/`readNewerDraft`、`CLAUDE.md`の「自動保存が失われる根本原因の特定とローカルドラフトによる自動復旧を追加」の節参照)からいちいち復元する必要があり、手間になっている。

原因推定の確度が高く(調査(1)〜(4)、ユーザーの実体験とも一致)、実際のデータ保存の信頼性に関わるため、他のagyレビュー対応(6節)より優先して着手すること。

- [x] 調査(1): ノード確定時に「すぐ保存が走る」ように見えるものの正体を特定
  - ユーザーからの質問(「いきなりGoogle Driveに書き込んでいるわけではないのでは」)を受けてコードを確認。`MindMapEditingService.mutate()`(`MindMapEditingService.ts` 259〜268行目)は、ノード確定のたびに①`persistDraft()`で`localStorage`へ同期的に即時書き込み(Driveではない)、②`scheduleAutoSave()`で1.5秒デバウンスのタイマーをセットするだけ、の2つを行う。実際にGoogle Drive APIへ書き込む`flushPendingSave()`(同188〜203行目)が呼ばれるのは編集の手が1.5秒止まった後であり、ツールバーの「保存中…」表示(`Toolbar.tsx:59`、`isSaving()`)もその実行中にしか出ない。ユーザーの見立て通り、確定直後に即座に反映されるのはローカルの下書きのみで、Driveへの実書き込みは非同期・遅延して行われる設計
- [x] 調査(2): 上記調査の過程で、自動保存失敗が握りつぶされている実装上の欠陥を発見
  - `flushPendingSave()`(`MindMapEditingService.ts` 188〜203行目)は`await this.repository.save(this.current)`を`try`していても`catch`していない(`finally`のみ)。OAuthトークン期限切れ(`GoogleAuthRequiredError`)やネットワークエラーで`save()`が例外を投げると、`isDirty`は`true`のまま・`clearDraft()`も呼ばれずに例外が上位へ伝播する。呼び出し元は`scheduleAutoSave()`内の`void this.flushPendingSave()`のため、この例外はキャッチされずに闇に消える(UI上は「保存中…」がふっと消えるだけで、失敗を示す手段が一切ない)
  - これは長時間利用後の再ログイン要求・自動保存反映漏れ問題の直接の原因候補と考えられる: トークンが切れた時点から以降の全編集でDriveへの保存が静かに失敗し続け、localStorageのドラフトだけが最新状態を保持する(データ消失は免れるが、ユーザーは保存失敗に気付けず、再ログイン後に毎回手動でドラフト復元が必要になる)
- [x] 調査(3): なぜ「いつの間にか」ログイン切れに気づけないのか、トークン期限管理の実装を確認
  - `GoogleAuth`(`googleAuth.ts`)は、アクセストークン取得時に`expiresAt`(安全マージン60秒引き)を`sessionStorage`へ記録するが、この期限チェックが行われるのは**インスタンス生成時(`loadStoredToken()`、コンストラクタで1回のみ)だけ**。一度メモリ上の`this.accessToken`に載ったら、`getAccessToken()`(99〜108行目)はその後一切期限を再チェックせず`if (this.accessToken) return this.accessToken`でそのまま返し続ける
  - そのため、タブを開いたまま1時間程度(実トークンの有効期限)を超えて編集を続けても、アプリ側は気づかず同じ(実際には失効した)トークンをDrive APIに渡し続ける
  - 実際にDrive APIが401を返しても、`authorizedFetch`(`driveApi.ts:12-25`)は`GoogleAuthRequiredError`ではなく汎用`Error`を投げるだけなので、上記`flushPendingSave()`の`catch`漏れと合わさって、期限切れは画面上どこにも表面化しない。ユーザーが気づけるのは、ページ再読み込みやマップ一覧遷移などで`GoogleAuth`が作り直される(`loadStoredToken()`が再度呼ばれ、ようやく期限切れが検出される)タイミングまで先延ばしになる
- [x] 調査(4): 上記の推定メカニズムについて、ユーザーから「説明された通りの動きが実際に起こっている気がする」との実体験ベースの裏付けを得た(ブラウザでの機械的な再現テストは未実施だが、原因推定の確度は上がったと判断)
- [ ] 修正: `flushPendingSave()`に`catch`を追加し、保存失敗(特に`GoogleAuthRequiredError`)を`isDirty`等の内部状態はそのまま保ちつつ、presentation層へ伝える手段を用意する(例: `renderSnapshot`に`saveError`のようなフィールドを追加)
- [ ] 修正: 保存失敗時、ツールバー等に「自動保存に失敗しました。再ログインが必要な可能性があります」といった分かりやすい通知を出し、ローカルドラフト復旧に頼らずその場で再ログイン→再試行できるようにする
- [ ] 検討: フォーカス/可視性が戻ったタイミング(`visibilitychange`、既存の`useNewVersionAvailable`と同様のパターン)でトークンの有効性を事前にチェックし、切れていれば早期に再ログインを促す

OAuthトークンの`sessionStorage`保存については「SPA構成として妥当」との評価で対応不要。

## 進め方の原則

- 各層の実装後、`npm run build` の型チェックが通ることを確認してから次の層へ進む
- UI層に到達したら、ブラウザ(claude-in-chromeスキル、または手動確認)で都度動作を見ながら進める
