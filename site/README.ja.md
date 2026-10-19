# プロジェクトサイト

[한국어](README.md) | [English](README.en.md) | 日本語 | [简体中文](README.zh-CN.md)

AvatarCast の公開サイトです。紹介・料金・インストール・ドキュメントとコミュニティ（テーマ・フロー・プレイブックの共有）、プランの販売（ライセンスの発行）を担当します。各社がインストールして使うアプリ AvatarCast Office（`server/`、`web/`）とは別に動き、検証コードなどの共通コードはルートの `shared/` を共用します。

## ブランド運用メモ

- 既定の公開ドメインは `avatarcast.app` です。
- GitHub リポジトリの説明は、韓国語・中国語・日本語・英語でまとめて管理します。代表の文言は「A visual project office where AI character teams work, show their workflow, and report results like a game」です。
- GitHub の訪問者数や検索流入が十分に増えなければ、リポジトリ名 `avataragent` を `avatarcast` または `avatarcast-office` に変えることを検討します。それまでは、既存のインストール URL とリリースのリンクが壊れないよう、README とインストールスクリプトの `YangJongWon/avataragent` のパスを維持します。

## 実行

```bash
npm install
npm run site:dev     # サイトサーバー（:8800）+ 画面（:5180）
```

ブラウザーで http://localhost:5180 を開きます。DB を別途用意しなければ、`site-data/` フォルダーに組み込みの PostgreSQL（PGlite）が作られ、初回起動時に `site/migrations` が適用されます。ログインメールはサーバーのコンソールにリンクとして出力されます。

デプロイ用のビルドと実行：

```bash
npm run site:build   # dist/site に画面をビルドする
npm run site:start   # サーバーが dist/site も一緒に配信する
```

## 設定（`site/.env` または環境変数）

| 変数 | 説明 |
| --- | --- |
| `SITE_PORT` | サーバーのポート。既定 8800 |
| `SITE_PUBLIC_URL` | 人がアクセスするアドレス。メールのリンクと OAuth の戻り先に使われます。既定 `http://localhost:5180` |
| `SITE_DATABASE_URL` | PostgreSQL のアドレス（例：Neon）。空なら PGlite |
| `SITE_DATA_DIR` | PGlite のフォルダー。既定 `site-data` |
| `SITE_SECRET` | ログイン中に使う短期クッキーの署名キー。本番では必ず設定してください（ないと起動のたびに変わる） |
| `SITE_ADMIN_EMAILS` | 管理者にするメールアドレス（カンマ区切り） |
| `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET` | Google ログイン。承認済みのリダイレクト URI：`<SITE_PUBLIC_URL>/api/auth/google/callback` |
| `GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET` | GitHub ログイン。Callback URL：`<SITE_PUBLIC_URL>/api/auth/github/callback` |
| `SITE_MAIL` | `console`（既定）または `resend` |
| `RESEND_API_KEY`、`SITE_MAIL_FROM` | `SITE_MAIL=resend` のとき |
| `SITE_LICENSE_KID`、`SITE_LICENSE_PRIVATE_KEY` | プランのライセンスの署名キー。`node --experimental-strip-types scripts/license-keygen.ts` で作ります。空なら開発用のキーを `SITE_DATA_DIR/license-key.json` に作って使います |
| `SITE_PAYMENTS` | `mock`（既定、お金が動かないテスト画面）または `paddle` |
| `PADDLE_ENV` | `sandbox`（既定）または `live` |
| `PADDLE_API_KEY` | Paddle の API キー（サーバーだけが使う） |
| `PADDLE_CLIENT_TOKEN` | Paddle.js 用の client-side token（ブラウザーに見えてもよい） |
| `PADDLE_WEBHOOK_SECRET` | 通知（notification）先の secret key。Webhook の署名検証用 |
| `PADDLE_PRICE_TEAM`、`PADDLE_PRICE_BUSINESS` | Paddle のダッシュボードで作った月額サブスクリプションの価格 ID（`pri_…`、チーム $9・ビジネス $29） |
| `PADDLE_PRICE_TEAM_YEARLY`、`PADDLE_PRICE_BUSINESS_YEARLY` | 年額サブスクリプションの価格 ID（チーム $90・ビジネス $290、2 か月無料）。空ならそのプランは年払いができません |
| `PADDLE_CURRENCY` | 有料テーマの価格の通貨。既定 `USD` |

このリポジトリは公開（AGPL）なので、シークレットはコードやコミットに入れず、環境変数としてだけ設定します。

## 画面の言語

サイトは韓国語・中国語・日本語・英語で表示されます。初めての訪問では **アクセス元の国** で決め（韓国 → 韓国語、日本 → 日本語、中国・台湾・香港・マカオ・シンガポール → 中国語、その他 → 英語）、国がわからなければブラウザーの言語を使います。訪問者がヘッダーの言語選択で自分で選ぶと、それ以降はその言語が優先されます。

アクセス元の国は、サイトの前段が付けるヘッダー（`CF-IPCountry`、`X-Vercel-IP-Country`、`CloudFront-Viewer-Country`、`X-AppEngine-Country`、`X-Country-Code`）から読みます。Cloudflare を前に置けば既定で付き、こうした前段なしで直接開くと（ローカルを含む）ブラウザーの言語で決まります。

## プランの販売（ライセンス）

1. アプリ（`BILLING_PROVIDER=site`、`SITE_URL=<サイトのアドレス>`）のプラン・メンバー画面でプランを選ぶと、サイトの `/checkout` に来ます。月払い・年払い（2 か月無料）はこの決済画面で選びます。アドレスにはプラン、インストール ID、戻り先のアプリのアドレスが入っています。
2. ログインして決済すると、サブスクリプションとライセンス（1 つのインストールに紐づく）ができ、ブラウザーがアプリの `/billing/return?license=…` に戻ってすぐに適用されます。アプリに戻れなければ、マイアカウントでキーをコピーしてアプリに貼り付けます。
3. アプリは決済期間が終わる 3 日前から、`POST /v1/licenses/refresh` で新しいライセンスを受け取って更新します。サイトがアプリを呼ぶことはないので、アプリに公開アドレスがなくてもかまいません。
4. 解約・再開・別のインストールへの移転は、サイトのマイアカウントで行います。

決済会社は `site/server/payments.ts` の `PaymentProvider` の背後にあります。既定は模擬決済（お金が動かないテスト画面）で、`SITE_PAYMENTS=paddle` なら Paddle（`site/server/payments-paddle.ts`）を使います。

### Paddle の接続（サンドボックスから）

Paddle は販売者（merchant of record）としてお客様に販売し、国ごとの税金・領収書を処理したうえでサイトに精算します。

1. https://sandbox-vendors.paddle.com に登録します（審査なし、実際のお金なし）。
2. **Catalog → Products** でチーム・ビジネスの商品と月額サブスクリプションの価格（チーム $9、ビジネス $29）を作り、価格 ID（`pri_…`）を `PADDLE_PRICE_TEAM`、`PADDLE_PRICE_BUSINESS` に入れます。同じ商品に年額の価格（チーム $90、ビジネス $290）も作り、`PADDLE_PRICE_TEAM_YEARLY`、`PADDLE_PRICE_BUSINESS_YEARLY` に入れます。数量は最小 1、最大 1 にしてください。有料テーマは決済のたびに金額を決めて送るため、別途作る必要はありません。
3. **Developer tools → Authentication** で API キーと client-side token を作ります。
4. **Checkout → Checkout settings** の既定の決済リンク（default payment link）を `<SITE_PUBLIC_URL>/checkout/paddle` にします。決済画面はこのページで Paddle.js によって開きます。
5. **Developer tools → Notifications** に通知先 `<SITE_PUBLIC_URL>/api/payments/webhook/paddle` を作り、`transaction.completed`、`transaction.payment_failed`、`subscription.past_due`、`subscription.canceled` を選びます。表示された secret key を `PADDLE_WEBHOOK_SECRET` に入れます。ローカルでテストするには、トンネル（例：Tailscale Funnel、cloudflared）でサイトを公開アドレスに開かないと通知が届きません。
6. `SITE_PAYMENTS=paddle` でオンにし、テストカード（`4242 4242 4242 4242`）で決済してみます。

動作のしくみ：
- 決済結果はブラウザーではなく、署名された Webhook でのみ反映します（署名は `Paddle-Signature` の HMAC-SHA256、5 分以内のものだけ）。同じ通知が何度来ても 1 回だけ処理します。
- 決済を終えたブラウザーは `/checkout/paddle` で Webhook が反映されるまで待ってから、アプリ（`/billing/return?license=…`）または項目のページに戻ります。
- 更新は Paddle が直接請求して通知します。解約は決済期間の終わりに行われるよう Paddle に予約し、再開はその予約を取り消します。有料テーマの返金は Paddle に全額返金（adjustment）を依頼します。

本番アカウント（`PADDLE_ENV=live`）には Paddle による販売サイトの審査が必要です。公開ドメイン、料金ページ、利用規約・プライバシーポリシー・返金ポリシー、販売者情報が必要なので、デプロイと規約ページの用意のあとに申請します。他のクリエイターのテーマを代わりに販売する構造が認められるかは、申請時に問い合わせる必要があります。

正式運用の前に `scripts/license-keygen.ts` でキーを作り、秘密鍵はサイトのシークレットに、公開鍵はアプリの `server/license-keys.ts` に入れます。ローカルでテストするときは、サイトの起動ログに出る `LICENSE_PUBLIC_KEYS=…` の行をアプリの `.env` に入れれば大丈夫です。

## コミュニティギャラリー

テーマ（zip）、ワークフロー（`.flow.json`）、プレイブック（`.json`）をアップロード・ダウンロードします。

- アップロードしたファイルはアプリと同じ検査を通ります：テーマは `server/theme-package.ts` の `readThemePackage`（zip・画像ヘッダー・フレーム・CSS の整理）、フローは `shared/flow-pack.ts` の `parseFlowPack`、プレイブックは `parsePlaybook` とルールの警告（`rulesWarnings`）。保存するのは検査を通過して整理された結果なので、ダウンロードするファイルはそのまま検査済みのファイルです。
- テーマは theme.json の `id` が 1 人のオーナーに結び付き、同じ id で再アップロードすると新しいバージョンになります（`themeVersion` を上げる必要がある）。フロー・プレイブックは項目ページの「新しいバージョンをアップロード」でバージョンを追加します。
- ファイルは `SITE_DATA_DIR/files`（ローカルディスク）に置きます。クラウドでは同じ `FileStorage` インターフェースで R2 をつなぎます。
- 3 人から通報がたまると非表示になり、運営者（`SITE_ADMIN_EMAILS`）が確認して再公開するか「審査通過」の表示を付けます。
- アプリは `SITE_URL` があればコミュニティタブで一覧を表示し、ワンクリックでインストールします。アプリサーバーが `SITE_URL` からのみ項目 id でダウンロードし、手動で読み込むときと同じコードでインストールします。

公式の項目を入れる（PGlite ならサイトサーバーを止めてから）：

```bash
node --experimental-strip-types scripts/site-seed.ts --email doc.corax@gmail.com --handle avataragent --tags 일러스트,공식 art/build/illust-office.zip
```

## クリエイター・掲示板・運営

- **クリエイターページ** `/u/<ID>`：紹介・リンク、アップロードした項目、累計ダウンロード・いいね、今月の順位、バッジ（初アップロード・審査通過・ダウンロード 100 回・今月の TOP 10・採用された回答 3 つ）。マイアカウントで ID・名前・紹介・リンク（https、3 つまで）を編集します。
- **ランキング** `/ranking`：今週・今月・全期間。点数は期間内のダウンロード + いいね×3 で、公開項目と有効なアカウントだけを数えます。
- **掲示板** `/forum`：お知らせ（運営者のみ）・質問・ヒント・機能の提案・自分のオフィス自慢。本文とコメントは Markdown で、表示するときに DOMPurify で整理します。質問した人は、他の人の回答を 1 つ採用します。投稿は 1 日 10 件、コメントは 60 件までです。
- **通報と運営** `/admin`：項目・投稿・コメントは、別々の 3 人が通報すると非表示になり、運営画面の待ち行列に集まります。運営者は「再公開」か「取り下げ」を行い、アカウントを停止するとすべてのセッションが切れ、投稿・アップロードができなくなります。運営者の操作はすべて記録（`audit_log`）に残ります。

## 有料テーマと精算

- クリエイターは項目ページの「自分の項目の管理」でテーマに価格を付けます（$0 = 無料、$1〜$100、$0.10 単位）。今はテーマだけを販売できます。
- 購入はプランと同じ決済アダプター（`checkouts.kind = 'item'`）で行い、決済が終わると項目ページに戻ってすぐにダウンロードできます。有料テーマのダウンロードは、購入者・クリエイター・運営者だけができます（それ以外は 402）。アプリのコミュニティタブは有料テーマをインストールせず、サイトの購入ページへ案内します。
- 売上の 70% がクリエイターの取り分、30% が運営手数料です。`ledger` に販売（+）・手数料（−）・返金（−）・手数料の返還（+）・支払い（−）を 1 行ずつ残し、クリエイターの受取額はその合計です。
- 運営者は運営画面の「販売・精算」で返金（お金を返してダウンロードを止める）し、お金を直接送ったあとに「支払い記録」を残します。残額より多くは記録できません。返金・支払いはすべて運営記録に残ります。

## 構成

```
site/
  migrations/   SQL マイグレーション（名前順に 1 回ずつ適用）
  server/       Express API：ログイン（マジックリンク・Google・GitHub）、プランの販売・ライセンス、コミュニティギャラリー、クリエイター・ランキング、掲示板、運営、ドキュメント
  web/          React の画面（紹介・料金・インストール・ドキュメント・ログイン・決済・マイアカウント・ギャラリー・項目・アップロード・掲示板・ランキング・プロフィール・運営）
```

全体の設計と次のステップ（ライセンス・コミュニティ・掲示板・有料テーマ）は、[docs/ARCHITECTURE_DECISIONS.ja.md](../docs/ARCHITECTURE_DECISIONS.ja.md) と[開発状況](../DEVELOPMENT_STATUS.ja.md)のドキュメントを参照してください。
