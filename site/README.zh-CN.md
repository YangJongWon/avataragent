# 项目网站

[한국어](README.md) | [English](README.en.md) | [日本語](README.ja.md) | 简体中文

AvatarCast 的公开网站。负责介绍、价格、安装和文档页面，社区（分享主题、流程和操作手册）以及套餐销售（签发许可证）。它与各公司自行安装使用的应用 AvatarCast Office（`server/`、`web/`）分开运行，校验代码等公共代码共用根目录的 `shared/`。

## 品牌运营备忘

- 默认公开域名是 `avatarcast.app`。
- GitHub 仓库简介以韩、中、日、英四种语言一起维护。代表文案是"A visual project office where AI character teams work, show their workflow, and report results like a game"。
- 如果 GitHub 访问量或搜索流量增长不够，考虑把仓库名 `avataragent` 改为 `avatarcast` 或 `avatarcast-office`。在此之前，README 和安装脚本中保留 `YangJongWon/avataragent` 路径，以免现有的安装 URL 和发布链接失效。

## 运行

```bash
npm install
npm run site:dev     # 网站服务器（:8800）+ 界面（:5180）
```

在浏览器中打开 http://localhost:5180。如果不单独准备数据库，会在 `site-data/` 文件夹中创建内置的 PostgreSQL（PGlite），首次启动时应用 `site/migrations`。登录邮件会以链接形式打印在服务器控制台中。

部署用的构建与运行：

```bash
npm run site:build   # 把界面构建到 dist/site
npm run site:start   # 服务器同时提供 dist/site
```

## 设置（`site/.env` 或环境变量）

| 变量 | 说明 |
| --- | --- |
| `SITE_PORT` | 服务器端口。默认 8800 |
| `SITE_PUBLIC_URL` | 用户访问的地址。用于邮件链接和 OAuth 回调地址。默认 `http://localhost:5180` |
| `SITE_DATABASE_URL` | PostgreSQL 地址（例如 Neon）。留空则使用 PGlite |
| `SITE_DATA_DIR` | PGlite 文件夹。默认 `site-data` |
| `SITE_SECRET` | 登录过程中使用的短期 Cookie 签名密钥。生产环境务必设置（否则每次启动都会变化） |
| `SITE_ADMIN_EMAILS` | 设为管理员的邮箱地址（用逗号分隔） |
| `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET` | Google 登录。已获授权的重定向 URI：`<SITE_PUBLIC_URL>/api/auth/google/callback` |
| `GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET` | GitHub 登录。Callback URL：`<SITE_PUBLIC_URL>/api/auth/github/callback` |
| `SITE_MAIL` | `console`（默认）或 `resend` |
| `RESEND_API_KEY`、`SITE_MAIL_FROM` | 当 `SITE_MAIL=resend` 时 |
| `SITE_LICENSE_KID`、`SITE_LICENSE_PRIVATE_KEY` | 套餐许可证的签名密钥。用 `node --experimental-strip-types scripts/license-keygen.ts` 生成。留空时会在 `SITE_DATA_DIR/license-key.json` 生成并使用开发用密钥 |
| `SITE_PAYMENTS` | `mock`（默认，不会扣款的测试界面）或 `paddle` |
| `PADDLE_ENV` | `sandbox`（默认）或 `live` |
| `PADDLE_API_KEY` | Paddle API 密钥（仅服务器使用） |
| `PADDLE_CLIENT_TOKEN` | Paddle.js 用的 client-side token（暴露在浏览器中也没关系） |
| `PADDLE_WEBHOOK_SECRET` | 通知（notification）目标的 secret key。用于 Webhook 签名校验 |
| `PADDLE_PRICE_TEAM`、`PADDLE_PRICE_BUSINESS` | 在 Paddle 控制台创建的月度订阅价格 ID（`pri_…`，团队版 $9、企业版 $29） |
| `PADDLE_PRICE_TEAM_YEARLY`、`PADDLE_PRICE_BUSINESS_YEARLY` | 年度订阅价格 ID（团队版 $90、企业版 $290，免 2 个月）。留空则该套餐不能按年付费 |
| `PADDLE_CURRENCY` | 付费主题价格的货币。默认 `USD` |

本仓库是公开的（AGPL），因此密钥不要写进代码或提交，只通过环境变量设置。

## 界面语言

网站以韩语、中文、日语和英语显示。首次访问时按 **访问国家** 决定（韩国 → 韩语，日本 → 日语，中国大陆·台湾·香港·澳门·新加坡 → 中文，其他 → 英语）；不知道国家时使用浏览器语言。访客在页头的语言选择中自行选择后，之后会优先使用该语言。

访问国家从网站前端添加的请求头（`CF-IPCountry`、`X-Vercel-IP-Country`、`CloudFront-Viewer-Country`、`X-AppEngine-Country`、`X-Country-Code`）中读取。前面放置 Cloudflare 时默认会添加；在没有这类前端的情况下直接访问（包括本地）时，按浏览器语言决定。

## 套餐销售（许可证）

1. 在应用（`BILLING_PROVIDER=site`、`SITE_URL=<网站地址>`）的套餐·成员界面中选择套餐后，会跳转到网站的 `/checkout`。按月或按年（免 2 个月）在这个付款界面中选择。地址中包含套餐、安装 ID 和要返回的应用地址。
2. 登录并付款后，会生成订阅和许可证（绑定到一个安装），浏览器返回应用的 `/billing/return?license=…` 并立即生效。如果无法返回应用，可以在我的账号中复制密钥粘贴到应用里。
3. 应用会在计费周期结束前 3 天开始，通过 `POST /v1/licenses/refresh` 获取新的许可证进行续期。网站不会主动调用应用，所以应用没有公网地址也没关系。
4. 取消、恢复和转移到其他安装，都在网站的我的账号中操作。

支付服务商位于 `site/server/payments.ts` 的 `PaymentProvider` 之后。默认是模拟支付（不会扣款的测试界面），`SITE_PAYMENTS=paddle` 时使用 Paddle（`site/server/payments-paddle.ts`）。

### 连接 Paddle（从沙箱开始）

Paddle 作为销售方（merchant of record）向客户销售，处理各国的税费和收据后再与网站结算。

1. 在 https://sandbox-vendors.paddle.com 注册（无需审核，不涉及真实资金）。
2. 在 **Catalog → Products** 中创建团队版和企业版商品以及月度订阅价格（团队版 $9、企业版 $29），把价格 ID（`pri_…`）填入 `PADDLE_PRICE_TEAM`、`PADDLE_PRICE_BUSINESS`。在同一商品上再创建年度价格（团队版 $90、企业版 $290），填入 `PADDLE_PRICE_TEAM_YEARLY`、`PADDLE_PRICE_BUSINESS_YEARLY`。数量请设为最少 1、最多 1。付费主题每次付款时会发送金额，无需单独创建。
3. 在 **Developer tools → Authentication** 中创建 API 密钥和 client-side token。
4. 在 **Checkout → Checkout settings** 中把默认付款链接（default payment link）设为 `<SITE_PUBLIC_URL>/checkout/paddle`。付款窗口会在这个页面通过 Paddle.js 打开。
5. 在 **Developer tools → Notifications** 中创建目标 `<SITE_PUBLIC_URL>/api/payments/webhook/paddle`，并选择 `transaction.completed`、`transaction.payment_failed`、`subscription.past_due`、`subscription.canceled`。把生成的 secret key 填入 `PADDLE_WEBHOOK_SECRET`。要在本地测试，需要通过隧道（例如 Tailscale Funnel、cloudflared）把网站开放到公网地址，通知才能送达。
6. 用 `SITE_PAYMENTS=paddle` 开启，并用测试卡（`4242 4242 4242 4242`）试付款。

工作方式：
- 支付结果只通过签名的 Webhook 生效，不以浏览器为准（签名为 `Paddle-Signature` 中的 HMAC-SHA256，只接受 5 分钟内的）。同一通知多次到达也只处理一次。
- 完成付款的浏览器会在 `/checkout/paddle` 等待 Webhook 生效，然后返回应用（`/billing/return?license=…`）或条目页面。
- 续期由 Paddle 直接扣费并通知。取消会在 Paddle 中预约到计费周期结束时生效，恢复则删除该预约。付费主题的退款会向 Paddle 申请全额退款（adjustment）。

正式账号（`PADDLE_ENV=live`）需要通过 Paddle 对销售网站的审核。需要公开域名、价格页面、使用条款·隐私政策·退款政策以及卖家信息，因此要在部署和条款页面准备好之后再申请。代售其他创作者主题的模式是否被允许，需要在申请时咨询。

正式运营前，用 `scripts/license-keygen.ts` 生成密钥，把私钥放入网站的密钥配置，把公钥放入应用的 `server/license-keys.ts`。在本地测试时，把网站启动日志中打印的 `LICENSE_PUBLIC_KEYS=…` 这一行放入应用的 `.env` 即可。

## 社区画廊

上传和下载主题（zip）、工作流（`.flow.json`）和操作手册（`.json`）。

- 上传的文件会经过与应用相同的检查：主题使用 `server/theme-package.ts` 的 `readThemePackage`（zip、图片头、帧、CSS 清理），流程使用 `shared/flow-pack.ts` 的 `parseFlowPack`，操作手册使用 `parsePlaybook` 和规则警告（`rulesWarnings`）。保存的是通过检查并整理后的结果，所以下载的文件就是经过检查的文件。
- 主题的 theme.json 中的 `id` 绑定到一位所有者，用同一 id 再次上传会成为新版本（需要提高 `themeVersion`）。流程和操作手册通过条目页面的"上传新版本"增加版本。
- 文件保存在 `SITE_DATA_DIR/files`（本地磁盘）。在云端通过相同的 `FileStorage` 接口接入 R2。
- 累计被 3 人举报后会被隐藏，由运营者（`SITE_ADMIN_EMAILS`）确认后重新公开或标记为"审核通过"。
- 设置了 `SITE_URL` 时，应用会在社区标签中显示列表并支持一键安装。应用服务器只从 `SITE_URL` 按条目 id 下载，并用与手动导入相同的代码安装。

添加官方条目（如果使用 PGlite，请先停止网站服务器）：

```bash
node --experimental-strip-types scripts/site-seed.ts --email doc.corax@gmail.com --handle avataragent --tags 일러스트,공식 art/build/illust-office.zip
```

## 创作者·论坛·运营

- **创作者页面** `/u/<ID>`：简介·链接、上传的条目、累计下载·点赞、本月排名、徽章（首次上传、审核通过、下载 100 次、本月 TOP 10、3 个被采纳的回答）。在我的账号中修改 ID、名称、简介和链接（https，最多 3 个）。
- **排行榜** `/ranking`：本周、本月、全部。分数为期间内的下载数 + 点赞数×3，只统计公开条目和有效账号。
- **论坛** `/forum`：公告（仅运营者）、提问、技巧、功能建议、晒晒我的办公室。正文和评论使用 Markdown，显示时用 DOMPurify 清理。提问者可以采纳他人的一个回答。每天最多发 10 篇帖子、60 条评论。
- **举报与运营** `/admin`：条目、帖子和评论被 3 个不同的人举报后会被隐藏，并汇集到运营界面的队列中。运营者可以"重新公开"或"下架"；封禁账号会断开其所有会话，并禁止发帖和上传。运营者的所有操作都会记录（`audit_log`）。

## 付费主题与结算

- 创作者在条目页面的"管理我的条目"中为主题定价（$0 = 免费，$1–$100，以 $0.10 为单位）。目前只能销售主题。
- 购买使用与套餐相同的支付适配器（`checkouts.kind = 'item'`），付款完成后返回条目页面即可立即下载。付费主题只有购买者、创作者和运营者可以下载（其他人返回 402）。应用的社区标签不会安装付费主题，而是引导到网站的购买页面。
- 销售额的 70% 归创作者，30% 为运营手续费。`ledger` 中逐行记录销售（+）、手续费（−）、退款（−）、退还手续费（+）和付款（−），创作者的应收金额就是它们的合计。
- 运营者在运营界面的"销售·结算"中办理退款（退还款项并禁止下载），直接转账后再添加"付款记录"。记录金额不能超过剩余金额。退款和付款都会记录在运营记录中。

## 结构

```
site/
  migrations/   SQL 迁移（按名称顺序各应用一次）
  server/       Express API：登录（魔法链接、Google、GitHub）、套餐销售·许可证、社区画廊、创作者·排行榜、论坛、运营、文档
  web/          React 界面（介绍、价格、安装、文档、登录、付款、我的账号、画廊、条目、上传、论坛、排行榜、个人主页、运营）
```

整体设计和下一步（许可证、社区、论坛、付费主题）请参阅 [docs/ARCHITECTURE_DECISIONS.zh-CN.md](../docs/ARCHITECTURE_DECISIONS.zh-CN.md) 和[开发现状](../DEVELOPMENT_STATUS.zh-CN.md)文档。
