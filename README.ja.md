# 🏢 AIエージェントオフィス

[한국어](README.md) | [English](README.en.md) | 日本語 | [简体中文](README.zh-CN.md)

AI社員に仕事を依頼し、ピクセルオフィスで働く様子を見ながら成果物を承認できるWebアプリです。マネージャー・調査担当・ライター・レビュー担当が、画面に表示されるワークフローに沿って作業します。最後にユーザーが承認すると、成果の価値が収益に反映されます。

永続的な実行環境とPostgreSQL開発環境は、Docker Desktopを起動して `npm.cmd run infra:up` を実行すると利用できます。SQLiteの移行とTemporalの確認方法は `OPERATIONS.md` を参照してください。

<p align="center"><img src="docs/office.webp" alt="イラストオフィステーマの開発チームのオフィス" width="720"></p>

## 主な機能

- **ビジュアルオフィス:** 5つの標準チーム、オフィス追加、勤務・休憩アニメーション、AI会社別の帽子、モデル等級エフェクト、変更可能なキャラクタースキン。
- **ワークフロー:** テンプレート、AIによる設計、最大10段階の手動設計に対応。条件付きループで不合格の成果物を修正段階へ戻せます。
- **承認と収益:** ユーザーが承認した成果だけを反映し、AI費用・換算人件費・収益・月間予算をまとめて表示します。
- **共有と権限:** オフィス全体または一部をリンクやQRコードで共有し、閲覧・運用・管理権限を設定できます。
- **AIプロバイダー:** APIキー不要のモックモードに加え、OpenAI、Anthropic、Gemini、xAI、DeepSeekやOllamaなどのOpenAI互換APIをサポートします。

## 技術スタック

| 領域 | 技術 |
| --- | --- |
| 画面 | React 19、Vite 8、pixi.js 8、React Flow |
| サーバー | Node.js 24、Express 5、WebSocket |
| ストレージ | node:sqlite（イベント履歴と状態） |
| 言語 | TypeScript（画面とサーバーで型を共有） |

## かんたんインストール — Windows 10/11

PowerShellを開いて次のコマンドを実行します。

```powershell
irm https://raw.githubusercontent.com/YangJongWon/avataragent/main/scripts/get.ps1 | iex
```

またはリポジトリのZIPをダウンロードして展開し、**`설치.cmd`** をダブルクリックします。SmartScreenが表示された場合は、**詳細情報 → 実行**を選択してください。

インストーラーは必要に応じてNode.jsを導入し、依存関係の取得、ビルド、アクセスパスワードの設定、デスクトップショートカットの作成、初回起動まで行います。初回は5～10分ほどかかる場合があります。

初期状態はAPIキー不要のシミュレーションモードです。実際のAIを使う場合は、画面上部の**モデル管理**タブでAPIキーを登録してください。

問題が発生した場合:

- ポートが使用中なら、`.env` の `PORT=8787` を `PORT=8788` などに変更します。
- サーバーが起動しない場合は `logs/server.err.log` を確認します。
- 同じWi-Fiのスマートフォンから利用する場合は、Windowsファイアウォールのアクセスを許可してください。

## かんたんインストール — macOS / Linux

ターミナルを開いて実行します。

```bash
curl -fsSL https://raw.githubusercontent.com/YangJongWon/avataragent/main/scripts/get.sh | bash
```

アプリは `~/avataragent` にインストールされます。Node.js、依存関係、設定、ビルド、起動アイコン、初回起動まで自動で準備します。

- macOSでは起動・停止・更新用の `.command` ショートカットを作成します。
- Linuxではアプリ一覧とデスクトップに同等のショートカットを作成します。
- ZIP版の場合、macOSでは **`설치.command`** を右クリックして「開く」、Linuxでは `bash scripts/install.sh` を実行します。
- コマンド操作: `scripts/office.sh start|stop|restart|status|update|upgrade`

## 開発者向けセットアップ

Node.js 24以上が必要です。

```bash
npm install
cp .env.example .env   # PowerShell: Copy-Item .env.example .env
npm run dev
```

本番実行:

```bash
npm run build
npm start              # http://localhost:8787
```

外部公開する前に `.env` の `ACCESS_PASSWORD` を必ず設定してください。

検証:

```bash
npm test
npm run typecheck
npm run build
```

## ディレクトリ構成

```text
shared/   共通型、チーム、ワークフロー、権限ルール
server/   API、リアルタイムイベント、オーケストレーター、AI呼び出し、保存処理
web/      React画面とpixi.jsオフィス
site/     公開サイトとコミュニティギャラリー
scripts/  インストール・運用スクリプト
```

## ドキュメント

- [製品企画書](AI_AGENT_OFFICE_PRODUCT_PLAN.md)
- [開発状況](DEVELOPMENT_STATUS.md)
- [運用ガイド](OPERATIONS.md)
- [アーキテクチャ決定記録](docs/ARCHITECTURE_DECISIONS.md)
- [コントリビューションガイド](CONTRIBUTING.md)

## ライセンス

[AGPL-3.0](LICENSE)と商用ライセンスのデュアルライセンスです。変更したソースを公開せずサービスとして運用する場合は商用ライセンスが必要です。詳細は [LICENSING.md](LICENSING.md) を参照してください。
