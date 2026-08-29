# ドメインモデル — mindmap_drive

作成日: 2026-08-28
ステータス: v1 ドラフト
前提: `docs/requirements.md` の内容に基づく

## 1. 目的・スコープ

`docs/requirements.md` で定義した機能要件・非機能要件を、DDDの戦術的パターン(集約・エンティティ・値オブジェクト・リポジトリ・ドメインサービス)に落とし込む。ここではドメイン層の設計のみを扱い、Google Drive連携やReactの状態管理などの技術的詳細は `docs/architecture.md`(次フェーズ)で扱う。

ドメイン層は Google Drive・React・ブラウザAPI に一切依存しない、純粋なロジックとして設計する(`CLAUDE.md` の方針どおり)。

## 2. 集約(Aggregate)

### MindMap(集約ルート)

1つのマインドマップ全体を表す。ノードの追加・削除・移動・折りたたみなど、木構造に対するすべての変更操作は **MindMap を経由してのみ** 行う。Node を集約の外から直接生成・操作することはない。

- MindMapは不変条件(循環参照の禁止、ルートノードの単一性、カスケード削除の一貫性 等)を保証する責務を持つ
- MindMapは自身の状態のスナップショット(`MindMapSnapshot`)を生成・復元できる(Undo/Redoの土台。詳細は8節)

集約の境界をMindMap単位にした理由: 要件上、同時編集・部分的な楽観ロックは考慮不要(単一端末利用前提)なため、マップ全体を1つの集約として扱ってもパフォーマンス・整合性の両面で問題にならない。

## 3. エンティティ(Entities)

### Node

MindMap集約に属するエンティティ。`NodeId` で識別される。

| 属性 | 型 | 説明 |
|---|---|---|
| id | NodeId | 一意識別子(生成時にUUID等を割り当て) |
| text | NodeText | ノードのテキスト内容 |
| children | Node[] | 子ノードの順序付きリスト(配列の並び順がそのまま兄弟の並び順) |
| collapsed | boolean | 折りたたみ状態(データとして永続化される) |
| attachments | Attachment[] | 添付画像のリスト |

- ルートノードもNodeとして表現する(マップ全体を表す仮想的な最上位ノード、または最初のトップレベルノード群の親)。ルートノードの扱い(表示上の「見えないルート」を置くか、最上位を複数ノードの配列として扱うか)はアーキテクチャ設計フェーズで確定する
- Nodeの「深さ(階層)」は保存せず、木構造上の位置から導出する(親子関係のみを正とする)

## 4. 値オブジェクト(Value Objects)

| 値オブジェクト | 説明 |
|---|---|
| MapId | マップの一意識別子。不透明な識別子として扱う(Google DriveのfileIdをそのまま用いるかは `architecture.md` で確定) |
| MapName | マップの表示名(空文字不可などのバリデーションを持つ) |
| NodeId | ノードの一意識別子(UUID等。Drive側の識別子とは独立) |
| NodeText | ノードのテキスト内容(プレーンテキスト。長さ上限などのバリデーションを持ちうる) |
| Attachment | 画像添付情報。`{ id: AttachmentId, driveFileId: string, addedAt: DateTime }`。実体の画像バイナリは持たず、Drive上のファイルへの参照のみを保持する |
| AttachmentId | 添付画像の一意識別子(ドメイン内部のID) |
| MindMapSnapshot | ある時点でのMindMap全体の状態を表す不変のスナップショット。Undo/Redoの実現に使う |
| MapSummary | マップ一覧表示用の軽量な値オブジェクト。`{ id: MapId, name: MapName, updatedAt: DateTime }`。一覧画面では全ノードを読み込まずこれだけを使う |

## 5. ドメインサービス(Domain Services)

現時点では、木構造操作(追加・削除・移動・インデント/アウトデント)はすべてMindMap集約自身のメソッドとして自然に表現できるため、独立したドメインサービスは最小限とする。

- **NodeMoveValidator(検討中)**: 「ノードを自分自身の子孫の中に移動できない」といったツリー操作の不変条件チェックが複雑になった場合に切り出す候補。v1時点ではMindMap集約のメソッド内部ロジックとして実装し、複雑化した場合にリファクタリングで切り出す方針とする

## 6. リポジトリインターフェース(ドメイン層に定義、実装はinfrastructure層)

```
interface MindMapRepository {
  create(name: MapName): Promise<MindMap>     // 新規作成・ID割り当て(下記注記)
  findById(id: MapId): Promise<MindMap>
  findAllSummaries(): Promise<MapSummary[]>   // マップ一覧(軽量)
  save(map: MindMap): Promise<void>
  delete(id: MapId): Promise<void>
}

interface AttachmentStorage {
  upload(mapId: MapId, image: Blob): Promise<Attachment>
  getUrl(attachment: Attachment): Promise<string>   // 表示用URL取得
  delete(attachment: Attachment): Promise<void>
}
```

- `create` はアプリケーション層実装時(`application/MindMapCatalogService.ts`)に追加した。`architecture.md` 4.2節の決定どおり MapId = Google DriveのfileId とするため、IDの採番はDriveへ実際にファイルを作成するリポジトリ実装側でしか行えない。アプリケーション層が事前にMapIdを採番してから `save` することはできないため、生成と初回保存を1つの操作としてリポジトリ側に持たせている

- `MindMapRepository` の実装(`infrastructure/`)がGoogle Drive APIを呼び出し、1マップ=1JSONファイルとしてシリアライズ/デシリアライズする
- `AttachmentStorage` の実装がマップと同じDriveフォルダへの画像ファイル保存を担う(要件定義4.6節)
- OAuth認証自体はリポジトリの責務ではなく、別途 `infrastructure/` の認証アダプタが担当する(ドメイン層はGoogleアカウントの存在を意識しない)

## 7. 不変条件(Invariants)

MindMap集約が常に保証すべきルール:

1. 循環参照を作らない(あるノードを自分自身の子孫の位置に移動できない)。`indent`/`outdent`/`moveUp`/`moveDown`は既存の親子関係の中でのみノードを動かすため構造上循環しないが、任意のノード間で再親子付けする`moveNode`(ドラッグ&ドロップ対応、実装時に追加)ではこのチェックが実際に機能する
2. ノードを削除すると、その子孫ノードもすべて削除される(カスケード削除。要件定義4.2節)
3. マップ名(MapName)は空にできない
4. ノードのテキストは空でもよい(空ノードの一時的な存在を許容し、入力速度を優先する。要件定義4.3節の「思考のスピードを止めない」方針に対応)

## 8. MindMap集約の主な振る舞い(メソッド一覧)

要件定義4.2〜4.4節の機能要件に対応する、MindMap集約が公開する操作:

- `addSiblingNode(afterNodeId, text)` — 兄弟ノードを追加(Enter)
- `addChildNode(parentNodeId, text)` — 子ノードを追加(Tab)
- `indent(nodeId)` / `outdent(nodeId)` — 階層変更(Tab / Shift+Tab)
- `moveUp(nodeId)` / `moveDown(nodeId)` — 同階層内の並び替え(Ctrl+↑/↓)
- `moveNode(nodeId, newParentId)` — 任意の別ノードの子として再親子付け(ドラッグ&ドロップ対応。実装時に追加。循環参照は例外で禁止)
- `deleteNode(nodeId)` — カスケード削除
- `toggleCollapse(nodeId)` — 折りたたみ/展開
- `updateText(nodeId, text)` — テキスト編集
- `attachImage(nodeId, attachment)` / `removeAttachment(nodeId, attachmentId)` — 画像添付の追加・削除
- `rename(newName)` — マップ名変更
- `createSnapshot()` / `restoreSnapshot(snapshot)` — Undo/Redo用のスナップショット取得・復元

Undo/Redoの操作履歴スタック自体(何回分保持するか、スナップショット差分か全量コピーか)は**アプリケーション層の責務**とする。ドメイン層は「スナップショットを作れる/戻せる」機能だけを提供する(要件定義8節の未決事項に対応、詳細は `architecture.md` で確定)。

## 9. ユビキタス言語(確定版)

| 用語 | 定義 |
|---|---|
| マップ(MindMap) | 集約ルート。1つのアウトライン全体。Google Drive上の1ファイルに対応する |
| ノード(Node) | マップを構成するエンティティ。テキスト・子ノード・折りたたみ状態・添付画像を持つ |
| 兄弟(Sibling) | 同じ親を持つノード同士 |
| インデント/アウトデント | ノードの階層を1段深く/浅くする操作 |
| 折りたたみ(Collapse) | 子ノードを一時的に非表示にする表示状態。データとしては保持される |
| 添付(Attachment) | ノードに紐づく画像。Drive上の別ファイルへの参照として保持される |
| スナップショット(Snapshot) | ある時点のMindMap全体の状態を表す不変のコピー。Undo/Redoの基盤 |
| マップサマリー(MapSummary) | マップ一覧表示用の軽量情報(ID・名前・更新日時のみ) |

## 10. 次のステップ

1. 本ドメインモデルのレビュー・合意
2. アーキテクチャ設計(`docs/architecture.md`):
   - アプリケーション層のユースケース定義(上記メソッド呼び出しの組み立て、Undo履歴スタックの実装方式)
   - Google Drive連携の詳細設計(OAuth・PKCEフロー、JSONスキーマ、ファイル命名・フォルダ構成、自動保存のデバウンス方式)
   - Reactでの状態管理方針(MindMap集約をどうReactの状態に反映するか)
   - ルートノードの表現方法の確定(3節の保留事項)
3. プロジェクトスキャフォールディング・実装
