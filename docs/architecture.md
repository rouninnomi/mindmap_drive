# アーキテクチャ設計 — mindmap_drive

作成日: 2026-08-28
ステータス: v1 ドラフト
前提: `docs/requirements.md`, `docs/domain-model.md` に基づく

## 1. レイヤー構成

`CLAUDE.md` で示した4層構成を採用する。依存の向きは常に外側→内側(presentation/infrastructure → application → domain)。domain/application は React・Google API・ブラウザAPIに一切依存しない。

```
src/
  domain/           # MindMap集約, Node, 値オブジェクト, リポジトリIF(前フェーズで定義済み)
  application/       # アプリケーションサービス(本フェーズで定義)
  infrastructure/    # Google Drive/OAuth実装、リポジトリ実装
  presentation/       # React コンポーネント・hooks
```

## 2. アプリケーション層

個人用ツールであることを踏まえ、「1操作=1ユースケースクラス」という重厚な構成は避け、目的別に**2つのアプリケーションサービス**へ集約する。

### 2.1 MindMapCatalogService(マップ管理)

一覧・作成・名前変更・削除など、マップそのものに対する操作。`MindMapRepository` に直接依存する。

- `listMaps(): Promise<MapSummary[]>`
- `createMap(name: MapName): Promise<MapId>`
- `renameMap(id: MapId, name: MapName): Promise<void>`
- `deleteMap(id: MapId): Promise<void>`

### 2.2 MindMapEditingService(マップ編集)

1つのマップを開いている間、メモリ上に保持した `MindMap` 集約に対する編集操作をすべて仲介する。**Undo/Redoと自動保存はこのサービスの責務**とする(ドメイン層はスナップショットの作成/復元のみ提供し、履歴管理は行わない — `domain-model.md` 8節の方針どおり)。

```
class MindMapEditingService {
  private current: MindMap
  private undoStack: MindMapSnapshot[] = []   // 上限50件
  private redoStack: MindMapSnapshot[] = []
  private saveTimer: Timer | null

  load(id: MapId): Promise<void>
  // ドメイン集約のメソッドをラップし、実行前にスナップショットをundoStackへpush→redoStackをclear
  addSiblingNode(afterId, text) / addChildNode(parentId, text)
  indent(nodeId) / outdent(nodeId)
  moveUp(nodeId) / moveDown(nodeId)
  deleteNode(nodeId)
  toggleCollapse(nodeId)
  updateText(nodeId, text)
  attachImage(nodeId, file: Blob) / removeAttachment(nodeId, attachmentId)
  undo() / redo()
  // 変更のたびに呼ばれ、デバウンスして自動保存をスケジュールする
  private scheduleAutoSave(): void
}
```

- 変更通知の仕組み: Reactに依存しないシンプルな Observer(`subscribe(listener): unsubscribe`)を持たせ、状態変化のたびに購読者へ通知する(3節でReact側の接続方法を記述)
- **Undo履歴はメモリ上のみ**で保持し、ページ再読み込みでは復元しない(要件定義8節の未決事項に対する結論。個人用途でシンプルさを優先。将来必要になれば `sessionStorage` 等への永続化を検討)
- `toggleCollapse` は見た目の変更だが要件上データとして保存されるため、自動保存の対象に含める

## 3. React状態管理方針

Redux/Zustand等の状態管理ライブラリは導入しない。`MindMapEditingService` を素の TypeScript クラス(Observerパターン)として実装し、Reactからは `useSyncExternalStore` で購読する。

```
function useMindMapEditor(mapId: MapId) {
  const service = useMemo(() => new MindMapEditingService(repository, attachmentStorage), [mapId])
  useEffect(() => { service.load(mapId) }, [mapId])
  const snapshot = useSyncExternalStore(service.subscribe, service.getSnapshotForRender)
  return { snapshot, actions: service }  // actions はキーボードハンドラ等から直接呼ぶ
}
```

- これにより `domain/` `application/` は完全にReact非依存を保ったまま、presentation層だけがReactの再レンダリングと接続する
- マップ一覧画面(`MindMapCatalogService`)は状態がシンプルなため、通常の `useState` + `useEffect` で十分

## 4. Google Drive連携の詳細設計

### 4.1 認証

- **Google Identity Services (GIS) のトークンクライアント**(`google.accounts.oauth2.initTokenClient`)を採用する。バックエンドを持たないSPA構成のため、クライアントシークレット不要のこの方式が最も単純
- スコープ: `https://www.googleapis.com/auth/drive.file`(アプリが作成・開いたファイルのみアクセス可能な最小権限)
- アクセストークンはメモリ上にのみ保持し、`localStorage`等へは永続化しない(セキュリティ優先)。ページ再読み込み後は `prompt: ''` による無言の再認可を試み、失敗したら「Googleでログイン」ボタンを表示する
- リフレッシュトークンは扱わない(トークンクライアント方式のため)。アクセストークン有効期限切れ時は同様に無言再認可→失敗時は再ログイン導線

### 4.2 ファイル・フォルダ構成

- アプリ専用フォルダ(例: `MindMapDrive`)をDrive上に自動作成(初回起動時、`files.list` で検索→無ければ `files.create` でフォルダ作成)
- **MapId = Google DriveのfileId** をそのまま採用する(`domain-model.md` 4節の保留事項への回答)。個人用ツールでは独自ID体系を持つ利点が薄く、Drive APIとの往復を単純化できるため
- 1マップ = 1 JSONファイル。ファイル名はマップ名+`.json`(Driveは同名ファイルを許容するため、表示上の名前はJSON内の`name`フィールドを正とする)
- 画像添付ファイルは同じアプリフォルダ内に個別ファイルとして保存し、`Attachment.driveFileId` で参照する。ファイル名はUUIDベースで衝突を避ける

### 4.3 JSONスキーマ

```json
{
  "schemaVersion": 1,
  "id": "<driveFileId>",
  "name": "マップ名",
  "updatedAt": "2026-08-28T12:00:00Z",
  "root": {
    "id": "uuid",
    "text": "",
    "collapsed": false,
    "attachments": [],
    "children": [
      {
        "id": "uuid",
        "text": "トップレベルノード",
        "collapsed": false,
        "attachments": [{ "id": "uuid", "driveFileId": "...", "addedAt": "..." }],
        "children": []
      }
    ]
  }
}
```

- `schemaVersion` を持たせ、将来のスキーマ変更に備える(v1ではマイグレーション処理は作らないが、フィールドとしては予約する)

### 4.4 ルートノードの表現(domain-model.md 3節の保留事項への回答)

**MindMapは常に非表示のルートノードを1つ持ち、ユーザーに見えるトップレベルノード群はその子として表現する**(Workflowyと同じモデル)。ルートノード自体のテキストは使用せず、UIでは描画しない。これにより「トップレベルの複数ノード」を特別扱いせず、すべてのノード操作(追加・削除・移動)を再帰的に統一したロジックで扱える。

### 4.5 自動保存

- ノード編集操作のたびに `MindMapEditingService` 内でデバウンス(**最後の変更から約1.5秒後**)して `MindMapRepository.save()` を呼ぶ
- 加えて、`visibilitychange`(タブが非表示になる)・`beforeunload` のタイミングでダーティ状態なら即座に保存を試みる(ベストエフォート。ネットワーク遅延等で失敗する可能性は残るが、個人用途では許容する)
- 保存中はUI上に軽い保存インジケータを表示する程度に留め、入力をブロックしない(非機能要件「入力の速さ最優先」に対応)

## 5. エラーハンドリング方針(最小限)

- Drive APIエラー(トークン切れ・ネットワークエラー等)は自動保存を一時失敗として扱い、次回のデバウンスタイミングでリトライする。連続失敗時のみユーザーに通知する
- 個人用ツールのため、過度な例外処理・リトライ戦略は作り込まない(既存方針: 内部コードは信頼する)

## 6. 想定ディレクトリ構成(確定版)

```
src/
  domain/
    mindmap/
      MindMap.ts            # 集約ルート
      Node.ts                # エンティティ
      valueObjects.ts        # MapId, NodeId, NodeText, Attachment, MindMapSnapshot, MapSummary 等
      MindMapRepository.ts   # リポジトリIF
      AttachmentStorage.ts   # リポジトリIF
  application/
    MindMapCatalogService.ts
    MindMapEditingService.ts
  infrastructure/
    drive/
      DriveMindMapRepository.ts
      DriveAttachmentStorage.ts
      googleAuth.ts
      driveApi.ts        # 実装時に追加: 認可付きfetch・アプリ専用フォルダ解決・multipart共通処理
      mindMapJson.ts      # 実装時に追加: MindMap⇔JSON(4.3節スキーマ)の変換
  presentation/
    pages/
      MapListPage.tsx
      MapEditorPage.tsx
    components/
      OutlineNode.tsx
      Toolbar.tsx
      AttachmentViewer.tsx
      LoginButton.tsx
    hooks/
      useMindMapEditor.ts
      useMindMapCatalog.ts
```

## 7. 次のステップ

1. 本アーキテクチャ設計のレビュー・合意
2. プロジェクトスキャフォールディング(Vite + React + TypeScript、上記ディレクトリ構成の雛形作成)
3. ドメイン層 → アプリケーション層 → インフラ層 → プレゼンテーション層の順に実装し、都度ブラウザで動作確認する
