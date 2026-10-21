# AvatarCast Office

**AvatarCast** — AI キャラクターチームの働く様子を見せるプロジェクトオフィス

[한국어](README.md) | [English](README.en.md) | 日本語 | [简体中文](README.zh-CN.md)


AI エージェントを役割ごとのキャラクターキャストとして配置し、オフィスやプロジェクトルームで働く様子と業務の流れを視覚的に見せる Web アプリです。
業務を登録すると、マネージャー・リサーチャー・ライター・レビュアーが **業務の旅**（ワークフロー）に沿って順番に作業し、最後にユーザーが承認すると、成果とその価値がレポートと損益に反映されます。

## GitHub の説明

| 言語 | 説明 |
| --- | --- |
| 한국어 | AI 캐릭터 팀이 일하는 모습, 업무 흐름, 결과 보고서를 게임처럼 보여 주는 프로젝트 오피스 |
| English | A visual project office where AI character teams work, show their workflow, and report results like a game |
| 日本語 | AIキャラクターチームの作業、ワークフロー、成果レポートをゲームのように見せるプロジェクトオフィス |
| 简体中文 | 像游戏一样展示 AI 角色团队的工作过程、工作流和成果报告的项目办公室 |

永続実行と PostgreSQL の開発環境は、Docker Desktop を起動してから `npm.cmd run infra:up` で開始できます。既存 SQLite データの移行と Temporal の検証手順は [OPERATIONS.ja.md](OPERATIONS.ja.md) を参照してください。

<p align="center">
  <img src="docs/office.webp" alt="イラストオフィステーマで飾った開発チームのオフィス" width="720">
</p>

## 主な機能

- **ピクセルオフィス**
  - チームごとのオフィス 5 つ（開発・人事・経営・サポート・福利厚生）が最初からあり、オフィスを追加することもできます。
  - 作業中のスタッフは自分の机で、作業を終えたスタッフは休憩室で休みます。
  - モデル提供会社ごとの帽子とランクごとのきらめきがあり、スキン 3 種類（ピクセル・美少女・ピンクガール）を切り替えられます。
- **業務の旅（ワークフロー）**
  - 業務タイプごとに決まった旅を使うことも、AI に設計を任せることも、自分でステップを組むこともできます。
  - ステップはブリーフ → 調査 → 作成 → レビュー → 承認の順で、最大 10 ステップです。
  - **条件ループ**：「レビュー基準に届かなければ作成に戻る」のような条件をステップごとに設定できます。回数を空にすると条件が合うまで戻ります。
  - ワークフロー画面は幅に合わせて自動で折り返し、ノードの位置とサイズを自分で調整することもできます。
- **承認と損益**
  - 成果物はユーザーが承認して初めて反映されます。修正を依頼すると作成ステップに戻ります。
  - AI の呼び出し費用と人件費に換算した価値を比較し、損益と月の予算を表示します。
- **共有と権限**
  - オフィスのタブを右クリック（モバイルでは長押し）すると、共有・閉じるメニューが出ます。
  - オフィス全体または一部を QR コード・リンクで共有でき、権限は閲覧・運用・管理から選べます。
- **AI プロバイダー**
  - API キーなしで動く mock モードがあります。
  - OpenAI・Anthropic・Gemini・xAI と OpenAI 互換 API（DeepSeek・Ollama など）に対応し、スタッフごとに別のモデルを使えます。
  - **モデル管理** タブで、提供会社（帽子の形と色）、API キー、モデル（ランクの装飾と単価）を登録し、実行方式をその場で切り替えられます。

## 技術スタック

| 分野 | 使用技術 |
| --- | --- |
| 画面 | React 19, Vite 8, pixi.js 8, React Flow (@xyflow/react) |
| サーバー | Node.js 24, Express 5, WebSocket (ws) |
| ストレージ | node:sqlite（イベント履歴 + 状態） |
| 言語 | TypeScript（画面とサーバーが `shared/` の型を共有） |

## かんたんインストール（Windows 10/11）

プログラミングの知識は不要です。下の方法のどれか 1 つを行うだけです。

**方法 0. インストーラー（いちばん簡単）**

1. [Releases](https://github.com/YangJongWon/avataragent/releases/latest) から `AvatarCast-Setup-<バージョン>.exe` をダウンロードします。
2. ダブルクリックしてインストールします。「Windows によって PC が保護されました」という画面が出たら **詳細情報 → 実行** を押します（まだコード署名がないため表示されます）。
3. 終わるとブラウザーでオフィスが開きます。管理者権限も Node.js のインストールも不要です。Node.js はプログラムに同梱されています。

- プログラムは `%LOCALAPPDATA%\Programs\AvatarCast Office`、設定（`.env`）・データ・ログは `%APPDATA%\AvatarCast Office` に置かれます。新しいバージョンのインストーラーをそのまま実行すればアップデートされ、設定とデータはそのまま残ります。
- スタートメニュー（とデスクトップ）に **AvatarCast Office** ができます。起動するとタスクバー右下にトレイアイコンが表示され、右クリックで「オフィスを開く」「再起動」「サーバーを停止」が出ます（アップデートは新しいインストーラーを実行）。削除するときは Windows の設定のアプリからアンインストールし、データも削除するかどうか確認されます。
- 最後の画面で **Tailscale をインストールしてログイン** にチェックを入れると、スマホや外部から使えるように Tailscale をインストールします。Tailscale への登録とログインはご自身で行います。
- インストーラーの作成：`powershell -File installer/build.ps1`（Inno Setup 6 が必要）。バージョンタグ（`v0.2.0`）をプッシュすると、GitHub Actions が作成して Release に添付します。

**方法 1. コマンド 1 行**

1. スタートメニューで `PowerShell` を検索して開きます。
2. 下の行をコピーして貼り付け、Enter を押します。

   ```powershell
   irm https://raw.githubusercontent.com/YangJongWon/avataragent/main/scripts/get.ps1 | iex
   ```

**方法 2. ファイルをダウンロード**

1. このページ上部の緑色の **Code** ボタン → **Download ZIP** を押します。
2. ダウンロードした ZIP ファイルを右クリック → **すべて展開** で好きな場所に展開します。
3. 展開したフォルダーの **`설치.cmd`**（インストール）をダブルクリックします。「Windows によって PC が保護されました」という画面が出たら **詳細情報 → 実行** を押します。

インストーラーが自動で行うこと：

- Node.js がなければインストールします。権限確認の画面が出たら **はい** を押してください。
- 必要な部品をダウンロードし、画面をビルドします。初回は 5〜10 分ほどかかります。
- アクセス用パスワードを尋ねます。この PC だけで使うなら、そのまま Enter を押してもかまいません。
- デスクトップに **AvatarCast Office** のショートカットを 1 つ作り、ブラウザーでオフィスを開きます。

起動している間、タスクバー右下（時計の横）にトレイアイコンが表示されます。ダブルクリックするとオフィスが開き、右クリックするとメニューが出ます。

| トレイメニュー | 動作 |
| --- | --- |
| オフィスを開く | ブラウザーで開きます（停止していれば起動します） |
| 再起動 | サーバーを停止して起動し直します |
| アップデート | 新しいバージョンを取得して再起動します。設定（`.env`）とデータ（`data` フォルダー）はそのまま残ります |
| サーバーを停止 | サーバーを停止し、トレイアイコンも消えます |

インストールフォルダーにも同じ動作をする `시작.cmd`（起動）、`끄기.cmd`（停止）、`업데이트.cmd`（アップデート）があります。

最初は API キーなしの **シミュレーション** で動きます。実際の AI を使うには、画面上部の **モデル管理** タブの OpenRouter カードに無料の API キーを入力してください。キーを保存すると、標準のスタッフが OpenRouter の無料モデルを使う **メンバーごとの実AI** に自動で切り替わります。無料モデルには使用量の制限があり、提供されるモデルが変わることもあるため、機密情報や個人情報は送らないことをおすすめします。

問題が起きたら：

- 「ポートを別のプログラムが使用しています」と出たら、インストールフォルダーの `.env` ファイルをメモ帳で開き、`PORT=8787` を `PORT=8788` のように変えて起動し直します。
- サーバーが起動しない場合は、インストールフォルダーの `logs\server.err.log` の内容を教えてください。
- Windows ファイアウォールの画面が出たら **許可** を押してください。同じ Wi-Fi のスマホから開くときに必要です。

## かんたんインストール（macOS / Linux）

1. **ターミナル** を開きます。macOS では `Command+Space` で Spotlight を開き、`ターミナル` を検索します。
2. 下の行をコピーして貼り付け、Enter を押します。

   ```bash
   curl -fsSL https://raw.githubusercontent.com/YangJongWon/avataragent/main/scripts/get.sh | bash
   ```

プログラムはホームフォルダーの `avataragent` にインストールされます。Windows と同じ順序で、Node.js、部品、設定ファイル、画面のビルド、起動アイコン、初回起動まで自動で行います。

- Node.js がない場合、macOS では Homebrew があれば Homebrew で、それ以外は自分のユーザーフォルダー（nvm）にインストールします。管理者パスワードは不要です。
- macOS ではデスクトップに `AvatarCast Office.command`（起動）だけを作ります。ダブルクリックするとターミナルのウィンドウが一瞬開いて実行されます。停止とアップデートはインストールフォルダーの `끄기.command`、`업데이트.command` で行います。
- Linux ではアプリ一覧（とデスクトップ）に起動アイコンを 1 つ作り、停止とアップデートはアイコンの右クリックメニューに入れます。
- ZIP でダウンロードした場合、macOS ではフォルダーの `설치.command` を右クリック → **開く** で実行し、Linux ではフォルダーで `bash scripts/install.sh` を実行します。
- ターミナルで直接操作するときは `scripts/office.sh start|stop|restart|status|update|upgrade` を使います。サーバーが起動しない場合は `logs/server.err.log` を確認してください。

## はじめに（開発者向け）

Node.js 24 以上が必要です。

```bash
npm install
cp .env.example .env   # Windows PowerShell: Copy-Item .env.example .env
```

`.env` を初期値（`AI_PROVIDER=mock`）のままにすると、API キーなしでシミュレーションとして動きます。
実際のモデルを使うには、画面の **モデル管理** タブで API キーを登録して「メンバーごとの実AI」を選ぶか、`.env` の `AI_PROVIDER` と API キーを入力してください。

### 開発モード

```bash
npm run dev
```

サーバー（`tsx watch`）と Vite 開発サーバーが一緒に起動します。

### 本番モード

```bash
npm run build
npm start              # http://localhost:8787
```

Windows では、バックグラウンド実行、アップデート、Tailscale での外部公開をスクリプト 1 つで行えます。

```powershell
npm run office -- start    # バックグラウンドで実行
npm run office -- status   # 状態とアクセスアドレスを確認
npm run office -- update   # ビルドして再起動
npm run office -- upgrade  # 新しいコードを取得（git pull または ZIP）+ ビルド + 再起動
npm run office -- open     # 停止していれば起動してブラウザーで開く
npm run office -- stop
```

> 外部に公開するときは、必ず `.env` の `ACCESS_PASSWORD` を設定してください。

### 検証

```powershell
npm test
npm run typecheck
npm run build
```

## フォルダー構成

```text
shared/   画面・サーバー共通の型、チーム・業務の旅・権限のルール
server/   API、リアルタイムイベント、業務オーケストレーター、AI 呼び出し、ストレージ
web/      React の画面とピクセルオフィス（pixi.js）
site/     公開 Web サイトとコミュニティギャラリー
scripts/  運用スクリプト（office.ps1, office.sh）、インストール（install.ps1, get.ps1, install.sh, get.sh）
```

## ドキュメント

- [製品企画書](AI_AGENT_OFFICE_PRODUCT_PLAN.ja.md)
- [開発状況](DEVELOPMENT_STATUS.ja.md)
- [運用ガイド](OPERATIONS.ja.md)
- [ヘルプ](docs/HELP.ja.md)
- [テーマガイド](docs/THEME_GUIDE.ja.md)
- [プライバシー](docs/PRIVACY.ja.md)
- [アーキテクチャ決定記録](docs/ARCHITECTURE_DECISIONS.ja.md)
- [コントリビュートのご案内](CONTRIBUTING.ja.md)

## ライセンス

[AGPL-3.0](LICENSE) と商用ライセンスのデュアルライセンスです。変更したコードを公開せずにサービスで使うには商用ライセンスが必要です。詳しくは [LICENSING.ja.md](LICENSING.ja.md) をご覧ください。
