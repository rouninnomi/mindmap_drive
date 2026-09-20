# MindMap Drive

自分専用のマインドマップアプリ。ブラウザ上で動作し、データは Google Drive に保存するため、特定の機器やブラウザプロファイルに縛られずどこからでも同じデータにアクセスできる。

ノード&エッジのキャンバス表示(ドラッグ&ドロップでの自由な再親子付けに対応)と、キーボード中心の高速なテキスト入力を両立させている。

## 技術スタック

- React 19 + TypeScript + Vite
- [`@xyflow/react`](https://reactflow.dev/)(React Flow)によるノード&エッジのキャンバス描画
- [`d3-hierarchy`](https://d3js.org/d3-hierarchy)によるツリーの自動レイアウト計算
- Google Identity Services(GIS)によるOAuth認証 + Google Drive API(`drive.file`スコープ)
- DDD(ドメイン駆動設計)のレイヤリング。詳細は [`CLAUDE.md`](./CLAUDE.md) と [`docs/`](./docs) を参照
- フロントエンドオンリー構成(専用バックエンドなし)。静的ホスティングで完結

## セットアップ

### 1. 依存関係のインストール

```sh
npm install
```

### 2. Google Cloud Console側の設定(初回のみ)

このアプリは自分のGoogle Driveにデータを保存するため、Google Cloud ConsoleでOAuthクライアントIDを発行する必要がある。

1. [Google Cloud Console](https://console.cloud.google.com/) で新しいプロジェクトを作成する(既存の他アプリ用プロジェクトとは分けることを推奨)
2. 「APIとサービス」→「ライブラリ」から **Google Drive API** を有効化する
3. 「Google Auth Platform」の設定を進める
   - アプリ情報: アプリ名・サポートメールを入力
   - 対象: 個人のGoogleアカウントであれば「外部」を選択し、テストユーザーに自分のメールアドレスを追加する(アプリを一般公開しない限り「テスト」モードのままでよい)
4. 「クライアント」から新しいOAuthクライアントIDを作成する
   - アプリケーションの種類: **ウェブアプリケーション**
   - 承認済みのJavaScript生成元に、開発用オリジン(`http://localhost:5173`)と、本番デプロイ先のオリジンを登録する
   - リダイレクトURIの設定は不要(GISのトークンクライアント方式を使用しており、認可コードフローは使わないため)
5. 発行された「クライアントID」をコピーする(クライアントシークレットは使用しない)

### 3. 環境変数の設定

`.env.example` を `.env` にコピーし、発行されたクライアントIDを設定する。

```sh
cp .env.example .env
```

```
VITE_GOOGLE_CLIENT_ID=<発行されたクライアントID>
```

`.env` は `.gitignore` 対象なのでコミットされない。

### 4. 開発サーバーの起動

```sh
npm run dev
```

`http://localhost:5173/` を開き、「Googleでログイン」からログインする(手順2で登録したテストユーザーのアカウントでログインすること)。

## コマンド一覧

| コマンド | 説明 |
|---|---|
| `npm run dev` | 開発サーバー起動(Vite) |
| `npm run build` | 型チェック(`tsc -b`)+ 本番ビルド |
| `npm run preview` | ビルド成果物のプレビュー |
| `npm test` | 単体テスト実行(vitest) |
| `npm run lint` | Lint実行(oxlint) |

## ディレクトリ構成

DDDのレイヤリングに沿って `src/` を分割している。詳細は [`docs/architecture.md`](./docs/architecture.md) を参照。

```
src/
  domain/          # ドメインロジック(Google Drive・Reactに非依存)
  application/      # アプリケーションサービス(ユースケース)
  infrastructure/   # Google Drive/OAuth連携の実装
  presentation/      # Reactコンポーネント・hooks
```

## ドキュメント

`docs/` 配下に、要件定義からアーキテクチャ設計までの各フェーズのドキュメントを置いている。

- [`docs/requirements.md`](./docs/requirements.md) — 要件定義
- [`docs/domain-model.md`](./docs/domain-model.md) — ドメインモデル
- [`docs/architecture.md`](./docs/architecture.md) — アーキテクチャ設計
- [`docs/task.md`](./docs/task.md) — 実装タスク一覧・進捗

プロジェクト全体の方針・現在のフェーズ状況は [`CLAUDE.md`](./CLAUDE.md) にまとめている。

## デプロイ(Cloudflare Pages)

GitHubリポジトリ(`rouninnomi/mindmap_drive`)と連携したCloudflare Pagesが、`master`ブランチへのpushをトリガーに自動でビルド・デプロイする。

- 公開URL: <https://mindmap-drive.pages.dev>
- ビルドコマンド: `npm run build` / ビルド出力ディレクトリ: `dist`(Cloudflare Pagesプロジェクトの設定画面で指定)
- ビルド時の環境変数 `VITE_GOOGLE_CLIENT_ID` はCloudflare Pagesプロジェクトの「Settings → Variables and secrets」で設定する
- `public/_headers` で `Cross-Origin-Opener-Policy: same-origin-allow-popups` を全パスに設定している(後述の理由により必須)
- Google Cloud ConsoleのOAuthクライアントIDの「承認済みのJavaScript生成元」に `https://mindmap-drive.pages.dev` を登録済み(`http://localhost:5173`と並べて設定)

### GitHub Pagesを使わない理由

当初はGitHub Pagesにデプロイしていたが、GoogleのログインポップアップがGitHub Pages上で完了しても`GoogleAuthRequiredError`(`Google sign-in is required`)になり、常にログインに失敗する不具合が発覚した。原因はGoogle Identity Servicesのポップアップ完了検知が`Cross-Origin-Opener-Policy: same-origin-allow-popups`ヘッダーの送信を要求するのに対し、GitHub Pagesが静的ホスティングでカスタムHTTPレスポンスヘッダーを一切設定できないこと(`_headers`ファイル相当の仕組みがない)。ローカル開発サーバー(`http://localhost:5173`)ではこの制限を受けず問題なくログインできていたため、発覚が遅れた。

この制限を回避するため、カスタムヘッダー(`public/_headers`)に対応したCloudflare Pagesへ移行した。`.github/workflows/deploy.yml`によるGitHub Pagesへの自動デプロイは廃止済み。同種の問題を踏むアプリでは、静的ホスティング選定時にカスタムレスポンスヘッダーの可否を確認すること。

初回セットアップ(実施済み): Cloudflare Pagesプロジェクトの作成・GitHub連携・ビルド設定(`npm run build` / `dist`)・環境変数`VITE_GOOGLE_CLIENT_ID`の登録、Google Cloud Consoleでの承認済みJavaScript生成元への新URL追加。同種のアプリを新たにデプロイする場合はこの手順を踏むこと。
