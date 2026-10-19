# Development status and backend roadmap

[한국어](DEVELOPMENT_STATUS.md) | English | [日本語](DEVELOPMENT_STATUS.ja.md) | [简体中文](DEVELOPMENT_STATUS.zh-CN.md)

Reference document: [AI_AGENT_OFFICE_PRODUCT_PLAN.en.md](AI_AGENT_OFFICE_PRODUCT_PLAN.en.md)
Written: 2026-10-03

Updated: 2026-10-04

### 2026-10-04 Project lounge, first pass

- Added the `projectLounge` feature to the Team and Business plans, and made task assignees available on the Team plan too.
- The `Project lounge` at the top shows overall task-step progress, a finished model per office, and work/waiting status on one screen.
- Engineering/People/Management/Support/Wellbeing offices are automatically linked to spaceship/house/building/ship/garden models.
- Shows each member's assigned tasks, current work, completed count and share of completed steps. The screen states explicitly that contribution is a view of collaboration, not a ranking.
- Replaced progress based on a simple ratio of all steps with fixed-weight milestones. A milestone is chosen when a new task is added, and existing unclassified tasks are linked directly in the lounge.
- Added calculation tests confirming that failed or waiting tasks do not raise progress, and that adding unclassified tasks does not change the existing percentage.
- The Personal plan shows a preview of upgrading to the Team plan.
- Next step: make `Project`, `Milestone` and `ProjectTheme` independent data and let users edit the model and the part-to-milestone links.

### 2026-10-04 Durable runtime / PostgreSQL real-world verification

- Added a development setup in `infra/compose.dev.yml` with the app PostgreSQL, Temporal PostgreSQL, Temporal Server and Temporal UI.
- Added external Temporal contract tests that do not depend on the temporary server built into Windows, and passed all 10 WorkflowRuntime contracts on a real server.
- If `DATABASE_URL` is set, PostgreSQL is chosen as the source-of-truth store; otherwise SQLite stays.
- Migrated real SQLite data (5 offices, 20 staff, 10 tasks, 233 events) to PostgreSQL with `npm run storage:migrate`.
- Task steps (`workflow_steps`), outputs (`artifacts`), AI calls (`ai_calls`) and costs (`cost_entries`) are stored as separate ledgers.
- `/api/health` reports the storage backend and asynchronous save errors, and the save queue is flushed on a clean shutdown.
- Storage schema version 2: `tenant_id` is part of the primary key of every table. The server reads and writes only rows of `TENANT_ID` (default `default`), and kv (API keys, OAuth) is split per tenant too.
  - Full snapshot replacement is gone. Only rows that changed since the last save are INSERTed/UPDATEd/DELETEd. The order of state arrays lives in a `pos` column, and rows whose order alone changed get their position fixed without a version bump.
  - Optimistic locking: each row has a `version`, and UPDATE/DELETE succeed only against the last version seen. If even one row mismatches, the whole save is rolled back, the stored state is re-read and the Store is replaced (the store wins). The count and the last conflict appear in `storage.conflicts` and `lastConflict` in `/api/health`.
  - Multiple servers: on PostgreSQL, a session advisory lock per tenant limits each tenant to one writing server. Starting another server for the same tenant waits 30 seconds and is then refused, while servers for other tenants share the same DB. Schema migration runs on one server only, inside a separate advisory lock.
  - Version 1 stores (SQLite, PostgreSQL) are migrated automatically on start. Existing rows go into the current `TENANT_ID`, and files without ledger tables fill `ai_calls` and `cost_entries` from cost events. Confirmed on a copy of the production SQLite and on development PostgreSQL that 5 offices, 20 staff, 10 tasks, 233 events, 50 steps and 45 AI calls move over in order.
  - Remaining limits: this is not active-active with several servers handling the same tenant at once (the Store holds in-memory state). Nor does one process serve several tenants. SQLite has no tenant lock, so it assumes only one server uses a file. Foreign keys were dropped in version 2, and the app's row comparison deletes child rows (steps, outputs) along with their parents.

### 2026-10-04 Backend foundation improvements

- For generality and long-term maintainability, adopted Temporal as the durable execution layer for production. LangGraph is used optionally, only inside Activities that need a complex agent graph.
- Added a `WorkflowRuntime` interface between the HTTP API and the existing orchestrator. LocalRuntime is used for now; once the Temporal Worker and Signal migration is done, TemporalRuntime becomes the default.
  - The API requests all task execution only through `workflowRuntime`. Auto-check (`tick`) and pausing staff (`pauseAgent`) were also moved inside the boundary, and mail/inquiry simulation only creates data.
  - The interface uses its own input/output types (`CreateTaskInput`, `PlanDraftInput`, `PlanDraft`), and every method returns a `Promise`. The shape of steps in request bodies is checked at the boundary by `toStepInputs`.
  - Contract tests (`tests/runtime-contract.ts`) verify create, queue, cancel, workflow change, help answer, change request, approval, AI workflow design, pause and auto-check. The same tests run against LocalRuntime (`workflow-runtime.test.ts`) and TemporalRuntime (`temporal-runtime.test.ts`, temporary Temporal dev server).
- Added TemporalRuntime, turned on with `WORKFLOW_RUNTIME=temporal` (`server/temporal/`). It passes all contract tests, but the production default is still local.
  - Each started task gets one Temporal Workflow, and help answers and approvals/change requests are delivered as Signals. The one-task-per-office rule keeps using the existing queue (`drainQueues`).
  - The orchestrator's execution loop was split into `prepareRun`, `runStepAt`, `requestApproval`, `applyChangeRequest`, `completeTask` and `failTask`. LocalRuntime and Temporal Activities use the same step functions, so each team behaves the same under both executors.
  - Help requests are split into posting the question and applying the answer. On Temporal, the Activity only posts the question and ends; the Workflow waits for a Signal or a timeout, then puts the answer in and reruns the same step.
  - Activities send heartbeats while running, so they are not cut off while waiting a long time for a paused staff member, and if a Worker dies they move to another attempt within a minute. Step errors become non-retryable failures (the AI layer already retries).
  - Tasks with AI-designed workflows are designed in the first Activity (`prepareRun`). Previews (`designPlan`) are called directly within the request.
  - On first starting with Temporal, it finds tasks LocalRuntime left in progress and starts Workflows that take over from the current step. Tasks that already have a Workflow are skipped.
  - The Worker runs inside the API process because Activities share in-memory state and the SQLite file; once storage becomes transaction-based (ADR-002) it can move to a separate process.
  - Remaining: try switching to a real production Temporal server, rules for versioning (patching) Workflow code changes accumulated in this period, and deciding whether to move office queues to the Temporal side.
- Added the **MCP** tab. Connects to HTTP (Streamable HTTP, SSE fallback) and stdio servers with the official MCP TypeScript SDK.
  - Each server has a name, icon, connection type, secrets (environment variables for stdio, headers for HTTP), the offices that use it and per-tool enablement. Secrets are stored in separate kv rows, and snapshots carry only the last 4 characters. Share-link screens get no MCP information.
  - Each tool has a mode (Off / Auto during research / Run after approval). Tools with `readOnlyHint` default to auto and cannot be set to Run after approval. Tools with no hint start off. Tools with `destructiveHint` can only be set to Run after approval. Old `enabled` values become auto/off when loaded.
  - Run-after-approval tools are proposed by the writer as `task.actions` (up to 3) on entering the approval step, and can be turned off one by one on the approval screen (`PUT /api/tasks/:id/actions/:actionId`). On approval, `completeTask` runs the actions one by one before recognizing value. `running` is saved right before each run, and actions left as `running` after a restart become `unknown` and are not sent again (run at most once). The same rule applies to Temporal Activity retries. On a change request, proposals are cleared and recreated at the next approval step.
  - In the research step, the staff member looks at the list of enabled tools and picks up to 3 calls as JSON. It does not rely on model providers' tool-calling features, so it works the same with every model and in simulation. Calls are logged as `mcp.called`, `mcp.result` and `mcp.failed` events.
  - stdio servers run commands on this PC, so they can only be registered and connected when `MCP_ALLOW_STDIO=1`.
  - Presets: Brave web search, Notion, GitHub (remote), web page reader (fetch), custom.
  - OAuth sign-in for remote MCP: implemented by storing the SDK's `OAuthClientProvider` in kv (`mcp_oauth`) (dynamic client registration, PKCE, token refresh). `POST /api/mcp-servers/:id/login` returns the sign-in address, and `GET /api/mcp-oauth/callback` checks a one-time state and receives the token. Background connections do not open a sign-in window and end with a "sign-in required" error. Servers that need a pre-registered OAuth app (entering client_id directly) are not supported yet.
  - Tool call counts: per-server calls, failures and last use time (`stats`) appear on the MCP card, and per-task call counts (`toolCalls`) in the task header. Research calls and run-after-approval calls are counted by the same function (`invokeTool`).
  - Remaining: support pre-registered OAuth apps (entering client_id directly), a way to pass the action id when the other service accepts an idempotency key, and deciding whether to add the per-call price of paid MCP APIs to costs.
- Split the single `kv.state` store into relational tables for offices, staff, tasks, mail, calendar, inquiries, outbox, recommendations, share links and metadata.
- Existing `kv.state` data is migrated to the new tables automatically on first run. SQLite uses WAL mode and foreign keys and saves state in a single transaction.
- On server restart, running tasks are no longer failed immediately. They resume from the current step, and waits for approval and help requests are restored.
- Added timeouts, retries, exponential backoff and retryable-status-code detection to AI HTTP calls.
- Calls that need a JSON response are checked to be real JSON objects and retried if malformed.
- Added `npm test`; relational storage, workflow validation and WorkflowRuntime contract tests run.

LocalRuntime currently guarantees at-least-once recovery. If the server stops right after receiving an AI response but before saving the checkpoint, the same step may be called again. External write tools (MCP run after approval), by contrast, save their state first so they run at most once.

Summary: the MVP screens and trial flow are nearly complete. The backend, however, is still at prototype level, so most of the remaining work is making the backend fit for real operation.

---

## 1. What has been done

### Offices and staff

- Five team offices (Engineering, People, Management, Support, Wellbeing) come by default.
- Offices can be added or deleted. Default offices and offices with a task in progress are protected from deletion.
- There are 4 staff roles (manager, researcher, writer, reviewer), and the hiring screen lets you pick the role and model.
- Staff wear a hat per model provider and glow according to model tier.
- Each office has a lounge, and staff who have finished go there to rest.
- There are three skins, switchable on the spot.
  - Pixel
  - Anime Girl (hand-drawn)
  - Pink Girl (CC0 free images, credited in `web/public/skins/CREDITS.txt`)

### Task progress

- Tasks added on the board proceed along their own workflow (`Task.plan`).
  - The workflow is intake → research/analysis (0 or more) → writing (1) → review (0 or more) → user approval, up to 10 steps.
  - Task types are shortcuts to workflows. If the type has a default workflow (`flow`) it is used; otherwise the team default.
  - Choosing "AI designs it" has the lead AI decide the steps and assignees when the task starts and leave its reasons. You can also get the design in advance before adding the task.
  - Choosing "Design it yourself" lets you set adding/removing steps, order, assignees and instructions yourself.
  - Queued tasks can have their workflow edited again. Tasks in progress cannot be changed.
- Conditional loops: research, writing and review steps can have "if the condition is met, go back to an earlier step (or itself)".
  - You set the condition sentence, the step to go back to and the maximum repeats (1–3). Research and writing go back only to themselves or earlier; review only to the result-writing step or earlier.
  - For research and writing, the assigned staff member looks at the result and judges whether the condition applies (1 extra AI call). For review, rejection is the condition.
  - Review has a loop "if it falls short of the review criteria, back to result writing, up to 2 times" by default. Turning it off just leaves comments and moves on.
  - A change request at user approval goes back to result writing and resets the repeat counts.
  - A task stops if its steps run more than 40 times (infinite-loop prevention).
  - AI designs can add loops too. E.g. for a comparison task: "if there are fewer than 2 candidates to compare, back to candidate research".
- If instructions are vague, staff look troubled and ask for help.
  - You can choose an answer option, type your own, or "Carry on with a guess".
  - If there is no answer in time, they carry on on their own (`HELP_TIMEOUT_SEC`).
- Approval, change requests and pausing staff work.
- Each office can queue up to 10 tasks.
  - When the previous task finishes, the next starts automatically.
  - Offices that use both a mailbox and an inquiry box (People, Support) handle tasks one at a time in order.
  - Queued tasks can be canceled.
- There is an auto-check feature for when the People and Support teams have no mail or inquiries to check.

### Team data and simulation

- There are a mailbox, calendar, inquiry box, outbox, and interests and recommendations.
- It shows what will be applied on approval.
- No real mail is sent; it only piles up in the outbox.

### Cost and profit

- Costs are recorded from token usage, and the remaining monthly budget is shown.
- Value converted into labor cost is recognized on approval.
- Profit per task and per staff member is shown.

### Screens

- The report panel on the right has team data, the report, intermediate outputs, review comments, profit and the run log.
- There is a task flowchart view (React Flow).
  - Step boxes wrap like text to fit the screen width and scroll vertically when they overflow (3 per row at phone width).
  - Turning on "✋ Adjust layout" lets you drag boxes to move them and resize them by the corners. The layout is saved per task on that device (browser), and "↺ Auto layout" resets it.
- Made it usable on mobile.
  - On small screens (width 900px or less, or height 520px or less), the office view takes center stage.
  - The workflow goes into a bottom drawer, and help requests and approvals into a right-hand drawer.
  - Long-pressing a staff member opens their menu.
  - Windows such as adding a task become sheets that slide up from the bottom.

### Access and sharing

- `ACCESS_PASSWORD` sets up owner sign-in.
- From the office tab menu (right-click, long-press on mobile), the owner creates share links and QR codes for that office or all offices, and closes offices.
  - Permissions: View (read only), Operate (add tasks, answer help, approve), Manage (also staff, team data and simulation).
  - An expiry (1, 7 or 30 days, or none) can be set, and links can be revoked at any time. Revoking also cuts off screens currently connected.
  - Only the owner can add or delete offices and manage the company budget, office budget caps and sharing.
  - The server filters real-time events and state to the sharing scope before sending.

### AI connections

- The default is fake-response (mock) mode.
- Switching to `AI_PROVIDER=agents` uses the included connection code that calls OpenAI, Anthropic, Gemini and xAI models per staff member.
- The **Models tab** (owner only) switches the run mode (.env setting / Simulation / Real AI per person) without restarting the server.
  - Provider = hat shape (7 kinds) and color + API connection (Anthropic, OpenAI, xAI, Gemini, OpenAI-compatible address) and key.
  - Model = provider + tier (decoration) + API model ID + price. "Load the list" fetches the model IDs the key can use to pick from (no token cost).
  - The 4 default providers and 12 models cannot be deleted, but their model IDs and prices can be edited. Models and providers used by staff cannot be deleted.
  - Keys are stored in kv rows separate from state, and only the last 4 characters are sent to the screen. If left empty, the key in `.env` is used. (Not encrypted yet.)
  - Verified end to end with a fake OpenAI-compatible server: key registration → model registration → staff assignment → task waiting for approval.

### Help

- Added the user help document `docs/HELP.md` (usage per screen, connecting Slack, FAQ).
- Questions asked in "❓ Help" at the top search `docs/HELP.md`, `OPERATIONS.md` and `README.md` split into sections, using two-character-gram BM25 (with a few aliases).
  - In real AI mode with Operate permission, the manager of the office being viewed answers using the found sections and the current settings (run mode, command MCP allowed, LibreOffice present, etc.). The cost is counted to that office and staff member.
  - In simulation mode or with View permission, it shows the found sections as is. Each answer lets you expand the sections it is based on.
- MCP: for services that block automatic registration (Slack), entering the secrets `OAUTH_CLIENT_ID` and `OAUTH_CLIENT_SECRET` makes it sign in with that client. These two values are not sent as HTTP headers. Added a Slack preset (`https://mcp.slack.com/mcp`). Not yet verified with a real Slack app.
- MCP: Gmail preset (`https://gmailmcp.googleapis.com/mcp/v1`, read and draft scopes). If the secret `OAUTH_SCOPES` is set, it signs in with those scopes (taking priority over PRM), and adds `access_type=offline` and `prompt=consent` to the Google sign-in address to receive a refresh token. Not yet verified with a real Google account (especially whether Google accepts the `resource` parameter the SDK sends).
- Shortcuts: links to key/app pages for each MCP preset, links to get API keys, billing and pricing on Models provider cards, and quick fill for OpenAI-compatible services (DeepSeek, Mistral, OpenRouter, Groq, Upstage, Ollama).
- Performance records and self-improvement (`shared/performance.ts`): research steps record time taken, tool calls and accuracy (`research_accuracy` in the review response); review steps record pass/fail, score, reason, attempt number and the user's verdict in `performance` (latest 400, `state_meta`). Records feed past lessons into writing and research prompts, prioritize better-performing staff of the same role (`rankAgents`), and drive rule-based improvement suggestions (`suggestImprovements`). If an office's `autoImprove` is on, only cost-neutral suggestions (personality changes) are applied automatically on task completion and logged in `improvements`. The screen is the "Results" tab.
- Plans, members and chat (`shared/plans.ts`, `server/members.ts`, `server/chat.ts`, `shared/chat.ts`): plans (personal/team/business) are feature switches, with no payment integration. Member accounts use scrypt hashes and sign in with an `office_member` cookie (`id.sessionVersion.HMAC`, key derived from ACCESS_PASSWORD); permissions reuse share-link roles and office scopes (`Viewer.kind = 'member'`). Changing passwords or disabling accounts bumps sessionVersion to end sessions, and changing roles or scopes closes the WebSocket to force reconnection. Chat is for owners and members only; channels (company / office:id (Business) / task:id) and task cards are filtered by office scope. Help, approval, completion and stop events are posted as system messages. Chat is not put into prompts by default; only messages people pick are handed over via `POST /api/chat/:id/forward` (mode: note / answer / changes, Operate permission, once per message). Notes accumulate in `Task.chatNotes` (up to 20) and go into research, draft and review prompts; answer and changes reuse `workflowRuntime.answerHelp` / `requestChanges`. Which modes are available is decided from task state by `forwardModes` in `shared/chat.ts`. During tests (`NODE_TEST_CONTEXT`), `.env` is not read.
- Task assignees and activity log (`server/chat.ts` `setAssignee`, `server/activity.ts`): Business plan only. The assignee is `Task.assigneeId` ('owner' or the id of a member who can see that office) and is changed with `PUT /api/tasks/:id/assignee` (Operate permission). The snapshot's `people` is sent with everyone to the owner, only people with overlapping offices to members, and empty to share links. The activity log is read from `eventsBetween` via `GET /api/activity/export?from&to&format=csv|json` (owner, UTC dates, up to 50,000 rows, CSV with BOM).
- Billing (`shared/billing.ts`, `server/billing.ts`): if `BILLING_PROVIDER` is not set (none), plans change immediately; if set, `PUT /api/plan` is blocked and plans change only through payment events (`applyBillingEvent`, duplicates ignored by event id). A payment provider adapter implements `BillingProvider` (createCheckout / cancelSubscription / resumeSubscription / parseWebhook (signature verification), optionally renewal) and is added to `PROVIDERS`. The webhook is `POST /api/billing/webhook/:provider` (before sign-in, signature verified against the raw body), with the secret in `BILLING_WEBHOOK_SECRET`. Only `mock` exists for now (`/billing/mock-checkout/:id` checkout page, `x-mock-signature` HMAC, `billingTick` simulates renewal every hour). Cancellation takes effect at the end of the period, and failed payments drop to the Personal plan after a 7-day grace period. Integration with a real payment provider (Toss Payments, etc.), tax invoices and refunds are not done yet.
- Playbook sharing, stage 1 (`shared/playbook.ts`): exports office settings (personality, rules and model tier per role) and the scorecard as JSON (generated on the client); on import, `parsePlaybook` validates → change preview and risky-phrase warnings → applied with `POST /api/offices/:id/playbook` (same team only; `acceptWarnings` required if there are warnings). Next-step candidates: a comparison screen across several tenants on one server, a public gallery and A/B trial application.
- Model auto-fill: `POST /api/models/advise` (`server/model-advice.ts`). With a key, it asks the model being registered (or, failing that, the cheapest model of the same provider) for its name, tier and price as JSON (a `direct` request, so it calls for real even in simulation mode); without a key it estimates from a built-in reference price list, then from name rules. The reference price list is from memory, so the screen recommends checking it.
- Staff personality (`shared/personality.ts`): one of 6 styles per staff member, inserted into the system prompt as "[Working style]". Existing staff are filled with role defaults.
- Usage demo: long-pressing or right-clicking the provider badge plays one round of a fake task on screen only, together with a note tour (`web/src/demoPlayback.ts`).

### Exporting results

- "Export" on the report tab downloads Markdown, CSV, Excel, Word, PDF or PowerPoint. View permission is enough.
  - CSV and Excel use the report's tables as is. CSV gets a BOM for Excel, and Excel makes a sheet per table and puts numbers, amounts and ratios in as numeric cells.
  - PDF is made by opening a print page and using the browser's "Save as PDF". No browser or fonts are installed on the server.
- **AI design** (Operate permission): the report writer decides layouts for documents and slides as JSON, and the server draws them in the team's color theme.
  - Block types are fixed: key number cards, callout boxes, tables, charts (bar, line, pie), timelines, two-option comparisons and quotes. No code or HTML written by AI is executed.
  - Blocks containing numbers not in the report are removed automatically. A design applies only to the draft version it was made for; if a change request changes the draft, it goes back to the default design.
  - Call costs are added to that task's cost. In simulation mode, a rule-based design is returned.
  - The AI picks colors and fonts from 10 fixed palettes and 2 font pairings (sans-serif, serif headings). It does not write colors directly. Decorations such as top color bands or edge lines are not used; a single circle shape is repeated.
  - Slide bodies have a light tint of the palette color with two faint large circles in the background, and content sits on white cards with shadows. Cover, section cover and quote slides have dark backgrounds. If there are 3 or more major headings, section covers are added, and slides within a section get a small "01 Section name" above the title.
- **Charts**: both PowerPoint and Word get real charts (bar, line, doughnut). The docx library cannot insert charts into Word, so after creating the file, the chart parts (DrawingML) and an Excel sheet for the data are inserted directly. "Edit Data" works in Word, verified by opening in Word 2010.
- **Excel design**: the AI writes no formulas and only chooses what to do per table: sorting, calculated columns (difference, ratio, share), total and average rows, conditional formatting and data bars; the server writes real Excel formulas (`SUM`, `IF(B2=0,"",A2/B2)`, etc.) together with computed values. Steps pointing to non-existent columns are dropped. Banded rows, thin borders, frozen headers and filters are always included.
- **Slide fit check (free, always)**: estimates text width and tries shrinking body text 20→18→16→14pt; if it still overflows at 14pt, lists and tables are split over several slides. Short lists of 5 or fewer items are drawn as rows with numbered circles.
- **High quality mode (visual review)**: after creating documents or slides, LibreOffice makes a PDF that is shown to a reviewer agent, and the writer fixes any issues raised. It repeats up to `DESIGN_REVIEW_ROUNDS` times (default 2, max 3), and remaining issues and fixes are shown in the export box.
  - Without LibreOffice, the button is disabled and installation instructions are shown. The path can be changed with `SOFFICE_PATH`.
  - Sending PDFs as attachments is implemented for OpenAI, Anthropic and Gemini. Each review round calls AI twice more (review, fix).
  - Verified PPTX/DOCX → PDF conversion with LibreOffice installed on Windows. It takes 8–13 seconds per file, and 2 review rounds in simulation mode take about 22 seconds. Looking at the converted results directly, fixed small table text, thousands separators on chart axes, subheadings landing in list items, and the heights of callout boxes and comparison cards.
- Not working yet: visual review has not been run with real AI (the step where the reviewer looks at the PDF). There is no feature to specify the "output format" as a workflow step.

---

## 2. Not yet done

### Gaps within the MVP

- **Restart recovery is at-least-once.** Steps, waits for approval and help requests are recovered, but if a failure happens right after an AI call, the same step may be called once more.
- **There is no AI call ledger or idempotency key yet.** These must be added before connecting tools with external side effects.
- **It has never been run end to end with real AI keys.** Everything so far has been verified with fake responses.
- **Company and office budgets block before calls, but there is no per-task cost cap yet.** The estimated cost of a call is not reserved in advance, so the last call can go slightly over the cap.
- **The workflow format is internal to the app.** Per-task workflow design and editing and conditional loops (going back) work, but importing/exporting the plan's common task definition format (Workflow JSON), conditional branches that skip forward and parallel steps are not there yet.

### Beta items

- Sign-in, per-user storage, per-project data separation
- Real external connections such as mail and calendar, MCP tool connections, per-tool permissions
  - The mailbox and inquiry box are simulation data for now.
- Scheduled tasks and tasks that run automatically at set times
- Work schedules, idle staff detection, task reassignment suggestions, bottleneck analysis
- Linking flat-rate subscription budgets, a month-end settlement screen
- Operations monitoring and execution tracing, backups, secret encryption

### Stage 4 and later

- Real payment provider adapters (Toss Payments, Stripe), refunds and tax invoices
- Member invitation emails (for now the owner creates accounts directly)
- Producing an official Anime Girl skin pack

---

## 3. Backend roadmap

The order was set by two criteria.

- Make sure data is not lost before attaching real AI.
- Build approval and budget safeguards before external connections.

### Stage 1: Clean up the storage structure — foundation done

- Implemented SQLite relational collection tables, schema versions and automatic migration.
- Next: break steps, outputs, costs and the call ledger further into separate rows and add a PostgreSQL implementation behind the storage interface.

### Stage 2: Turn task execution into a per-step state machine — first pass done

- Implemented recovery of the current step, waits for approval and help requests.
- Implemented AI call timeouts and retries.
- Remaining: the call ledger, idempotency keys and compensation for external tools.

### Stage 3: Budget safeguards

- Check the remaining budget before starting a task and before each AI call.
- Send events when 80% and 100% of the budget are reached.
- Add a per-task cost cap and a real price table per model.

### Stage 4: Verify real model connections

- Run end to end with each provider's key.
- Validate the format wherever the AI answers in JSON, and ask again if the format is wrong.
- Check that cost records are accurate against real token usage.

### Stage 5: Task definition format and converter

- Turn the fixed steps into a task definition JSON.
- Separate the current execution method out as a "simple sequential executor".
- Then build the flowchart editing API.

### Stage 6: Tool layer and approval

- Build a structure for registering tools, and restrict which tools each staff member can use.
- Make outward actions (sending, posting, deleting, paying) always go through an approval request.
- Wrap external content such as mail and inquiries only as "data", so hidden instructions inside it are not followed.
- On top of this structure, attach real connections such as Gmail and calendar one at a time.
  - Start read-only.
  - Keep sending only into the outbox.

### Stage 7: Sign-in and data separation

- Separate data per user and per project.
- Store API keys encrypted.
- Add authentication to the real-time connection (WebSocket) too.

### Stage 8: Scheduled execution and work simulation

- Build scheduled tasks and work schedules.
- Introduce a job queue (Redis and BullMQ) when work takes long or many items must run at once.
- Add idle staff detection and task reassignment suggestions.

### Stage 9: Operations

- Set up execution tracing (Langfuse, etc.), error alerts and backups.
- Build month-end settlement and subscription budget allocation.

---

## 4. Recommended approach

- Finishing stages 1–4 gives an MVP that can be run safely with real AI.
- From stage 5 on is beta preparation.
- If starting right away, we recommend doing stage 1 (storage cleanup) and stage 2 (execution that survives restarts) together as one batch first.

---

## 5. Principles to keep

- Risky or outward actions go through user approval.
- No real mail is sent. Sending stops at the outbox.
- Failed work is not retried automatically without end.
- Personal information, secrets and internal confidential information are not included in results.
