# Architecture decision records

[한국어](ARCHITECTURE_DECISIONS.md) | English | [日本語](ARCHITECTURE_DECISIONS.ja.md) | [简体中文](ARCHITECTURE_DECISIONS.zh-CN.md)

## ADR-001: Keep the current orchestrator and leave LangGraph as an executor option

Status: Superseded by ADR-003  
Decided: 2026-10-04

### Decision

Keep the current TypeScript orchestrator as the main executor. Workflows in the UI are stored in the app's common Workflow model, not in any particular framework's format. If LangGraph becomes necessary, add it as a separate adapter behind the Workflow executor interface.

### Benefits of adopting LangGraph now

- Checkpoints and pause/resume are already well defined.
- It is well suited to human-in-the-loop flows that pause for a long time, such as user approval.
- The more complex conditional branching, parallel execution and subgraphs become, the less we have to build ourselves.
- It has a rich ecosystem of execution tracing and examples.
- It makes long-running workflows easy for the team to understand in a common way.

### Drawbacks

- Sequential execution, review rejection, help requests and the approval flow already work in our own code, so it would duplicate them.
- Framework state and app DB state would be duplicated, making it unclear which is the source of truth.
- The fine-grained events used for pixel animation would have to be remapped onto LangGraph execution events.
- More debugging points and deployment components.
- Dependence on framework API changes and on a particular ecosystem.

### Conditions for reconsidering adoption

Consider a LangGraph adapter when two or more of the following arise as real requirements.

- Parallel execution and joining of independent steps is needed across many tasks.
- A single task lasts several days and repeatedly waits for external signals.
- Nested sub-workflows and dynamic branching become common.
- The upkeep of our own resume/compensation logic exceeds the upkeep of an executor adapter.
- LangGraph-based external workflows need to be imported or exported.

### Current implementation principles

- The UI and storage only know the app's common Workflow model.
- Model calls, tool runs and approval state are recorded as explicit step events.
- The executor must be able to resume idempotently from a checkpoint.
- Adding LangGraph does not change the office UI or the report data model.

## ADR-003: Adopt Temporal as the durable execution layer

Status: Adopted  
Decided: 2026-10-04

### Background

The product puts generality and long-term maintainability ahead of any particular agent framework. Tasks can last from seconds to days and need user approval, scheduling, external events, retries, parallel processing and shift-based execution. If we keep implementing these responsibilities in the app's own code, recovery, version-compatibility and idempotency code will likely outgrow the product logic.

### Decision

Adopt Temporal as the durable execution layer for tasks. The app's Workflow Spec stays independent of Temporal, and a compiler converts it into Temporal Workflow and Activity calls.

```text
Office UI / flowchart
        ↓
Neutral Workflow Spec
        ↓
WorkflowRuntime interface
        ├─ TemporalRuntime (production default)
        └─ LocalRuntime (development, migration)
                ↓
AgentRuntime interface
        ├─ Direct model API
        ├─ LangGraph
        └─ Other agent SDKs
                ↓
ToolRuntime / MCP
```

### Why Temporal

- Restores execution from the event history after a process or server failure.
- Can wait a long time for user approval and external signals without holding a process.
- Provides per-Activity timeouts, retries, cancellation and task queues.
- Scheduled tasks, shifts, parallel execution and sub-workflows can be handled as ordinary task features.
- Independent of model providers and agent frameworks.
- You can choose between self-hosting and the managed Cloud.

### Costs and drawbacks

- We must run the Temporal Service and Workers, or pay for Cloud.
- Workflow code must be deterministic, and LLM, DB and network calls must be split out into Activities.
- Compatibility between running Workflows and new code must be managed.
- For a local prototype, setup and learning cost more than the existing executor.

### Where LangGraph fits

LangGraph is not the operating engine of the whole product but an optional AgentRuntime used when a complex agent graph is needed inside one Activity. Simple research, writing and review use the direct model adapter; only tasks that need dynamic branching or sub-agent exploration choose LangGraph.

### Transition principles

- The API and UI do not call the Temporal SDK directly.
- PostgreSQL is the source of truth for product data, and Temporal is the source of truth for execution history.
- Reports and large outputs are kept in PostgreSQL or object storage; Workflow History holds only their IDs.
- Every Activity that writes externally uses a stable idempotency key.
- The existing LocalRuntime is kept only during the migration period and for single-PC development mode.

## ADR-002: Relational persistence and the storage boundary

Status: In progress  
Decided: 2026-10-04

### Decision

Move the single `kv.state` JSON store to relational collection tables. Keep SQLite at first because it is simple to deploy, but introduce schema migrations and transactions and create a storage boundary that allows moving to PostgreSQL.

### Steps

1. SQLite relational tables and automatic migrations
2. Automatic import of the existing `kv.state`
3. Add task execution checkpoints and a call ledger
4. Separate the storage interface
5. PostgreSQL implementation and switch of the production environment

### Final requirements for production

- A managed PostgreSQL instance
- Tenant IDs per organization, user and project, with row-level isolation
- Encrypted storage of secrets
- Regular backups and point-in-time recovery
- Migration rollback procedure
- Connection pooling, read/write timeouts and failure alerts
- Audit log retention policy
- Personal data deletion and retention period policy

## ADR-004: Sell plans through a project site and license keys

Status: In progress (through step 5 complete)  
Decided: 2026-10-05

### Background

Each company installs the app on its own PC or server. So even if payment happens centrally, the customer's app does not change plans on its own. At the same time we need a community for sharing themes, flows and playbooks, and a storefront for selling Team and Business plans.

### Decision

- Put the public site in `site/` in the same repository. The stack is the same as the app (TypeScript, React, Express, PostgreSQL), and shared code such as format validation lives in `shared/`. Production uses PostgreSQL (Neon or similar); development and tests use embedded PGlite with the same SQL.
- Sign-in is by email magic link, Google and GitHub, tied to one account by verified email address.
- Plans are sold as **signed license keys**. The site issues tokens signed with Ed25519, and the app verifies them with the public key. Only the app-asks-the-site direction (pull) is used, so it works for installations without a public address. On the app side, a `site` provider is added to the existing `BillingProvider` structure; renewal uses `billingTick`, and the overdue grace period uses the existing `GRACE_DAYS` as is.
- The payment provider sits behind an adapter, and the real integration (Toss Payments, Paddle, etc.) is chosen later. Until then the whole flow is completed with mock payments.
- The community opens in stages: galleries for themes, flows and playbooks; creator profiles and rankings; boards and Q&A; and paid theme sales.

### When the site cannot be reached

Starting 3 days before the billing period ends, the app asks the site for a new license every 6 hours. If it cannot reach the site by the end of the period, it treats it as a payment failure, and after the existing 7-day grace period it falls back to the Personal plan. If the site rejects the license (moved to another installation or deleted), the subscription ends immediately.

### Community items

- The app and the site use the same validation code (`server/theme-package.ts`, `shared/flow-pack.ts`, `shared/playbook.ts`). The site stores only files that passed the checks and were cleaned up, per version, and versions are never changed.
- Workflows carry roles instead of assigned staff. In the receiving office they are matched to staff with the same role (or the first staff member if there is none), and rule checks reuse the app's `validatePlan`.
- For one-click install, the app server downloads only from `SITE_URL` and only by well-formed item ids (SSRF prevention). Only the office owner can install themes and save flows.

### Operations

- Rankings are not stored; they are computed on the fly from daily download counts and like timestamps (1 like = 3 downloads). If it grows, move to a daily snapshot table.
- Reports from 3 people hide an item automatically. Items hidden by reports cannot be republished by the author; only an operator can restore them. Every operator action is recorded in `audit_log`.
- Suspension is a single account status and clears sessions. Items and posts of a suspended account are not deleted automatically but handled one by one from the queue.

### Paid themes

- Sales use the same payment adapter and payment event handling (duplicate events ignored) as plans. One purchase is one row in `purchases`, and only the buyer can download.
- Money flows are recorded only as signed amounts in an append-only ledger (`ledger`). Balances are computed as sums and not stored separately. Creator 70% / operator 30%.
- Until a payment provider's payout feature is chosen, operators send payouts manually and record them. Payout records lock the account row and check that they do not exceed the balance.
- One-click install in the app is for free items only. Paid themes are bought on the site, and the downloaded zip is added to the app (device sign-in integration comes later).

### Payment provider: Paddle

- For overseas sales (4 languages) we choose Paddle, a merchant of record. Paddle handles VAT and receipts per country, and Korean sellers can sign up (Stripe does not accept Korean sellers).
- Payment results are applied only through signed webhooks, and the browser waits for that before returning. Paddle bills and notifies renewals, so the site's clock does not drive renewals.
- Whether paid themes (sold by other creators) fit Paddle's policy will be checked when applying for the real account; if not, only paid themes go through a different payment path.

### Why licenses are not strictly enforced

The app is AGPL, so anyone can modify the verification code. The license key is a device to help honest users apply and renew payments right away; there is no copy protection (DRM). Commercial redistribution is handled by the commercial license.

### Steps

1. Site skeleton: DB and migrations, three sign-in methods, about, pricing, install and docs pages (done)
2. Licenses and plan sales: signing keys, mock payments, issuing, renewal and transfer, the app's `site` billing provider and plan screen (done)
3. Community gallery and app integration (Community tab, one-click install), flow sharing format `avataragent-flow` (done)
4. Creator profiles and rankings, boards and Q&A, moderation (done)
5. Paid theme sales and settlement ledger (done)
6. Real payment provider integration and cloud deployment — Paddle adapter done (sandbox testing, deployment and real-account review remaining)
