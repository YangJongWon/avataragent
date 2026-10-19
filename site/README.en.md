# Project site

[한국어](README.md) | English | [日本語](README.ja.md) | [简体中文](README.zh-CN.md)

The public site for AvatarCast. It handles the about, pricing, install and docs pages, the community (sharing themes, flows and playbooks) and plan sales (issuing licenses). It runs separately from AvatarCast Office (`server/`, `web/`), the app each company installs, and shares common code such as validation through the root `shared/`.

## Brand notes

- The default public domain is `avatarcast.app`.
- The GitHub repository description is maintained in Korean, Chinese, Japanese and English together. The main line is "A visual project office where AI character teams work, show their workflow, and report results like a game".
- If GitHub visits or search traffic do not grow enough, consider renaming the repository `avataragent` to `avatarcast` or `avatarcast-office`. Until then, keep the `YangJongWon/avataragent` path in the README and install scripts so existing install URLs and release links do not break.

## Running

```bash
npm install
npm run site:dev     # site server (:8800) + UI (:5180)
```

Open http://localhost:5180 in a browser. If you do not set up a DB, an embedded PostgreSQL (PGlite) is created in the `site-data/` folder, and `site/migrations` are applied on first start. Sign-in emails are printed as links in the server console.

Build and run for deployment:

```bash
npm run site:build   # builds the UI into dist/site
npm run site:start   # the server also serves dist/site
```

## Settings (`site/.env` or environment variables)

| Variable | Description |
| --- | --- |
| `SITE_PORT` | Server port. Default 8800 |
| `SITE_PUBLIC_URL` | The address people visit. Used for email links and OAuth return addresses. Default `http://localhost:5180` |
| `SITE_DATABASE_URL` | PostgreSQL address (e.g. Neon). PGlite if empty |
| `SITE_DATA_DIR` | PGlite folder. Default `site-data` |
| `SITE_SECRET` | Signing key for short-lived cookies used during sign-in. Be sure to set it in production (otherwise it changes on every start) |
| `SITE_ADMIN_EMAILS` | Email addresses to make admins (comma-separated) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in. Authorized redirect URI: `<SITE_PUBLIC_URL>/api/auth/google/callback` |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | GitHub sign-in. Callback URL: `<SITE_PUBLIC_URL>/api/auth/github/callback` |
| `SITE_MAIL` | `console` (default) or `resend` |
| `RESEND_API_KEY`, `SITE_MAIL_FROM` | When `SITE_MAIL=resend` |
| `SITE_LICENSE_KID`, `SITE_LICENSE_PRIVATE_KEY` | Signing key for plan licenses. Create with `node --experimental-strip-types scripts/license-keygen.ts`. If empty, a development key is created and used in `SITE_DATA_DIR/license-key.json` |
| `SITE_PAYMENTS` | `mock` (default, a test screen where no money moves) or `paddle` |
| `PADDLE_ENV` | `sandbox` (default) or `live` |
| `PADDLE_API_KEY` | Paddle API key (server only) |
| `PADDLE_CLIENT_TOKEN` | Client-side token for Paddle.js (fine to expose in the browser) |
| `PADDLE_WEBHOOK_SECRET` | Secret key of the notification destination. For webhook signature verification |
| `PADDLE_PRICE_TEAM`, `PADDLE_PRICE_BUSINESS` | Monthly subscription price IDs created in the Paddle dashboard (`pri_…`, Team $9, Business $29) |
| `PADDLE_PRICE_TEAM_YEARLY`, `PADDLE_PRICE_BUSINESS_YEARLY` | Yearly subscription price IDs (Team $90, Business $290, 2 months free). If empty, that plan cannot be billed yearly |
| `PADDLE_CURRENCY` | Currency for paid theme prices. Default `USD` |

This repository is public (AGPL), so never put secrets in code or commits; set them only as environment variables.

## Display language

The site is shown in Korean, Chinese, Japanese and English. On the first visit it is decided by **country of access** (Korea → Korean, Japan → Japanese, China/Taiwan/Hong Kong/Macau/Singapore → Chinese, others → English); if the country is unknown, the browser language is used. Once a visitor picks a language in the header's language selector, that language takes priority from then on.

The country is read from headers added by the site's front end (`CF-IPCountry`, `X-Vercel-IP-Country`, `CloudFront-Viewer-Country`, `X-AppEngine-Country`, `X-Country-Code`). With Cloudflare in front they are added by default; when opened directly without such a front end (including locally), the browser language decides.

## Plan sales (licenses)

1. Choosing a plan on the Plan & people screen of the app (`BILLING_PROVIDER=site`, `SITE_URL=<site address>`) brings you to the site's `/checkout`. Monthly or yearly (2 months free) is chosen on this checkout screen. The address carries the plan, the installation ID and the app address to return to.
2. Signing in and paying creates a subscription and a license (tied to one installation), and the browser returns to the app's `/billing/return?license=…`, where it is applied immediately. If it cannot reach the app again, copy the key from My account and paste it into the app.
3. Starting 3 days before the billing period ends, the app renews by fetching a new license with `POST /v1/licenses/refresh`. The site never calls the app, so the app does not need a public address.
4. Cancel, resume and move to another installation from My account on the site.

The payment provider sits behind `PaymentProvider` in `site/server/payments.ts`. The default is mock payments (a test screen where no money moves); with `SITE_PAYMENTS=paddle`, Paddle (`site/server/payments-paddle.ts`) is used.

### Connecting Paddle (start with the sandbox)

As merchant of record, Paddle sells to customers, handles taxes and receipts per country, and then settles with the site.

1. Sign up at https://sandbox-vendors.paddle.com (no review, no real money).
2. In **Catalog → Products**, create Team and Business products with monthly subscription prices (Team $9, Business $29), and put the price IDs (`pri_…`) in `PADDLE_PRICE_TEAM` and `PADDLE_PRICE_BUSINESS`. On the same products also create yearly prices (Team $90, Business $290) and put them in `PADDLE_PRICE_TEAM_YEARLY` and `PADDLE_PRICE_BUSINESS_YEARLY`. Set quantity to min 1, max 1. Paid themes send an amount at each checkout, so they need no separate setup.
3. In **Developer tools → Authentication**, create an API key and a client-side token.
4. In **Checkout → Checkout settings**, set the default payment link to `<SITE_PUBLIC_URL>/checkout/paddle`. The checkout window opens on this page with Paddle.js.
5. In **Developer tools → Notifications**, create a destination `<SITE_PUBLIC_URL>/api/payments/webhook/paddle` and select `transaction.completed`, `transaction.payment_failed`, `subscription.past_due` and `subscription.canceled`. Put the resulting secret key in `PADDLE_WEBHOOK_SECRET`. To test locally, expose the site at a public address through a tunnel (e.g. Tailscale Funnel, cloudflared) so notifications can arrive.
6. Turn on `SITE_PAYMENTS=paddle` and try paying with the test card (`4242 4242 4242 4242`).

How it works:
- Payment results are applied only through signed webhooks, never from the browser (the signature is HMAC-SHA256 in `Paddle-Signature`, accepted only within 5 minutes). The same notification arriving several times is processed once.
- After paying, the browser waits on `/checkout/paddle` until the webhook is applied, then returns to the app (`/billing/return?license=…`) or the item page.
- Paddle bills and notifies renewals itself. Cancellation is scheduled in Paddle for the end of the billing period, and resuming removes that schedule. Paid theme refunds request a full refund (adjustment) from Paddle.

A live account (`PADDLE_ENV=live`) requires Paddle's review of the selling site. It needs a public domain, a pricing page, terms of use, privacy policy, refund policy and seller information, so apply after deployment and the policy pages are ready. Whether selling other creators' themes on their behalf is allowed must be asked when applying.

Before going live, create keys with `scripts/license-keygen.ts`: put the private key in the site's secrets and the public key in the app's `server/license-keys.ts`. For local testing, put the `LICENSE_PUBLIC_KEYS=…` line printed in the site's startup log into the app's `.env`.

## Community gallery

Upload and download themes (zip), workflows (`.flow.json`) and playbooks (`.json`).

- Uploaded files go through the same checks as in the app: themes through `readThemePackage` in `server/theme-package.ts` (zip, image headers, frames, CSS cleanup), flows through `parseFlowPack` in `shared/flow-pack.ts`, and playbooks through `parsePlaybook` and rule warnings (`rulesWarnings`). What is stored is the cleaned result that passed the checks, so the downloaded file is exactly the checked file.
- A theme's `id` in theme.json is tied to one owner, and uploading again with the same id makes a new version (`themeVersion` must be raised). Flows and playbooks add versions with "Upload new version" on the item page.
- Files are kept in `SITE_DATA_DIR/files` (local disk). In the cloud, R2 is attached through the same `FileStorage` interface.
- Once reports from 3 people accumulate, the item is hidden, and an operator (`SITE_ADMIN_EMAILS`) reviews it and republishes it or marks it "Reviewed".
- If `SITE_URL` is set, the app shows the list in the Community tab and installs with one click. The app server downloads only from `SITE_URL` by item id and installs with the same code as a manual import.

Adding official items (stop the site server first if using PGlite):

```bash
node --experimental-strip-types scripts/site-seed.ts --email doc.corax@gmail.com --handle avataragent --tags 일러스트,공식 art/build/illust-office.zip
```

## Creators, forum and moderation

- **Creator page** `/u/<handle>`: bio and links, uploaded items, total downloads and likes, this month's rank, badges (first upload, reviewed, 100 downloads, monthly TOP 10, 3 accepted answers). Edit your handle, name, bio and links (https, up to 3) in My account.
- **Ranking** `/ranking`: this week, this month, all time. The score is downloads within the period + likes × 3, counting only public items and active accounts.
- **Forum** `/forum`: announcements (operators only), questions, tips, feature requests, show off your office. Posts and comments are Markdown, sanitized with DOMPurify when shown. The person who asked accepts one answer from someone else. Up to 10 posts and 60 comments per day.
- **Reports and moderation** `/admin`: items, posts and comments reported by 3 different people are hidden and gathered in the moderation queue. Operators "Republish" or "Take down"; suspending an account ends all its sessions and blocks posting and uploading. Every operator action is recorded (`audit_log`).

## Paid themes and settlement

- Creators set a price on a theme in "Manage my items" on the item page ($0 = free, $1–$100, in $0.10 steps). Only themes can be sold for now.
- Purchases use the same payment adapter as plans (`checkouts.kind = 'item'`), and after payment you return to the item page and can download right away. Paid themes can be downloaded only by buyers, the creator and operators (others get 402). The app's Community tab does not install paid themes; it sends you to the site's purchase page.
- 70% of sales go to the creator and 30% is the operating fee. The `ledger` records one line each for sale (+), fee (−), refund (−), fee returned (+) and payout (−), and the creator's amount due is their sum.
- In "Sales & settlement" on the moderation screen, operators issue refunds (returning the money and blocking downloads), send money directly and then add a "payout record". Records cannot exceed the remaining amount. Refunds and payouts are all recorded in the moderation log.

## Structure

```
site/
  migrations/   SQL migrations (each applied once, in name order)
  server/       Express API: sign-in (magic link, Google, GitHub), plan sales and licenses, community gallery, creators and ranking, forum, moderation, docs
  web/          React UI (about, pricing, install, docs, sign-in, checkout, my account, gallery, items, upload, forum, ranking, profiles, moderation)
```

For the overall design and next steps (licenses, community, forum, paid themes), see [docs/ARCHITECTURE_DECISIONS.en.md](../docs/ARCHITECTURE_DECISIONS.en.md) and the [development status](../DEVELOPMENT_STATUS.en.md) document.
