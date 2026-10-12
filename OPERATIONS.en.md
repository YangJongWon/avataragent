# Server operations guide (personal testing)

How to run the server on this PC and reach it from your phone or from outside with Tailscale.
Run every command in PowerShell in the project folder.

## Addresses

| Where | Address | Reachable from |
|---|---|---|
| This PC | http://localhost:8787 | This PC |
| Tailscale | `http://<Tailscale IP>:8787` | Your devices signed in to Tailscale |
| Public | `https://<device name>.<tailnet>.ts.net:8443` | Anywhere on the internet |

- Check the actual addresses with `npm run office -- status`.
- Access password: `ACCESS_PASSWORD` in `.env`
- Once you sign in, that browser won't ask again for 30 days.
- To sign out, open the address with `/logout` appended.

## Sharing with other people

Only the owner (whoever signed in with the password) can do this.

1. Open the menu on an office tab ("Dev team", "Support team" and so on): right-click on desktop, long-press on a phone.
2. Choose **🔗 Share this office** (that office is preselected) or **🏢 Share all offices**.
3. Set a name (e.g. "Kim's phone"), the scope (all offices or the ones you pick), the permission and the expiry, then create it.
4. Scan the QR in the list with a phone, or copy the link and send it. The recipient sees only that scope, without a password.

| Permission | What it allows |
|---|---|
| View | Only viewing the office screen, workflows and reports |
| Handle tasks | View + creating tasks and editing workflows, answering help requests, approving and requesting changes, cancelling tasks |
| Manage office | Handle tasks + staff settings, team material (interests etc.), simulation |

- No permission allows adding or deleting offices, budgets, or managing shares.
- **🗑 Close office** in the same tab menu closes an office you created. The default office and offices with tasks in progress can't be closed.
- When opened from "Share this office", the list shows only links that can see that office. Turn on "Show links for other offices too" to see all of them.
- Links are built from `PUBLIC_URL` in `.env` (the public address). You can switch to the Tailscale address and others in the share window.
- **Revoke** also cuts off any screen currently open through that link.
- To go back to being the owner in a browser that came in through a share link, press **Leave** (`/logout`) on the top badge, then sign in with the password.

## Common commands

| To do this | Command |
|---|---|
| Start the server | `npm run office -- start` |
| Stop the server | `npm run office -- stop` |
| Restart the server | `npm run office -- restart` |
| Refresh after code changes (install + build + restart) | `npm run office -- update` |
| Get a new version (git pull or GitHub ZIP + update) | `npm run office -- upgrade` |
| Start it if stopped and open the browser | `npm run office -- open` |
| Show status (server, Tailscale address, public access) | `npm run office -- status` |
| Turn on public access | `npm run office -- public-on` |
| Turn off public access | `npm run office -- public-off` |
| Make a QR for outside access | `npm run office -- qr` |

- The server runs in the background, detached from the terminal. It keeps running after you close the terminal window; stop it with `stop`.
- Server logs go to `logs\server.log`, error logs to `logs\server.err.log`.
- The actual script is `scripts\office.ps1`. `npm run office -- start` is the same as:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\office.ps1 start
```

### Which one when

- **After changing the UI or server code:** `update`. The UI only changes after a build, so `restart` alone isn't enough.
- **After changing only `.env` (password, AI keys etc.):** `restart`.
- **After rebooting the PC:** `start`. Tailscale remembers the public access setting, so you don't need to turn it on again.

## Changing the password

1. Change the `ACCESS_PASSWORD=` value in `.env` to the password you want.
2. Run `npm run office -- restart`.

- Changing the password signs out every device that was signed in. Share links are not affected.
- If `ACCESS_PASSWORD` is empty, the office opens without a password. Don't leave it empty while public access is on.

## Care with public access

- Use a short password for testing only. Switch to a long one before you give the address to anyone or use real AI keys.
- With `AI_PROVIDER` set to `mock` in `.env`, no AI costs are incurred. Switch to a real model and tasks created from outside cost money too.
- Changing the run mode on the **Models** tab overrides `.env`. Choosing "real AI per staff member" makes the next AI call cost real money.
- API keys entered on the Models tab are stored in `data/office.db`. When you back up or move the `data/` folder, the keys go with it.
- Turn public access off with `public-off` when you finish testing.
- This app is published on Tailscale Funnel port 8443. Leave the default address without a port alone, since other services may use it.

## Development mode

For checking UI changes as you make them. It uses the same port (8787) as the production server, so stop that first with `stop`.

```powershell
npm run office -- stop
npm run dev
```

- UI: http://localhost:5173 (changes show as soon as you save)
- If a password is set, development mode shows the sign-in screen too.
- Stop it with `Ctrl+C` when done, and run `npm run office -- update` to bring the production server back.

## First install (another PC)

Point people who don't program to "Easy install" in the README. `설치.cmd` (or the one-line `scripts\get.ps1` command) handles installing Node.js (winget), `npm install`, creating `.env` (it asks for a password), the build, a desktop shortcut and the first run.

- In a folder cloned with git, `upgrade` runs `git pull --ff-only` and stops if you have modified files. In a folder from a ZIP, it downloads GitHub's main ZIP and overwrites, leaving `.env`, `data`, `logs` and `node_modules` alone.
- If you change `PORT` in `.env`, the `office` script uses that port too.
- `stop` stops not only the server holding the port but also the tsx and npm launchers above it.

On macOS/Linux, `scripts/get.sh` (one-line command) or `scripts/install.sh` does the same. Node.js is installed with Homebrew on macOS if it's there; otherwise, and on Linux, with nvm in your home folder. The launcher is a `.command` file on the desktop on macOS, and a `.desktop` file in `~/.local/share/applications` on Linux.

- `scripts/office.sh` supports the same commands as `office.ps1` (start, stop, restart, update, upgrade, open, status, public-on, public-off).
- The server PID is written to `logs/server.pid`. On Linux it starts with `setsid` and stops as a whole process group; on macOS its child processes are found and stopped with it.
- `upgrade` runs `git pull --ff-only` in a git folder, and otherwise downloads GitHub's main tar.gz and overwrites. `.env` and `data` are left alone.
- Install, start/restart/stop and upgrade were checked in an Ubuntu 24.04 container (without Node.js). macOS hasn't been checked on a real machine yet.

## Troubleshooting

| Symptom | What to check |
|---|---|
| "Didn't come up within 15 seconds" after `start` | Check `logs\server.err.log` |
| "Already running" but the page won't open | Check whether another program uses 8787. `stop`, then `start` |
| The Tailscale address won't open on the phone | Check that the Tailscale app on the phone is Connected. If it still fails, add the firewall rule below |
| The public address won't open | Check with `npm run office -- status` that both the server and public access are on |

Firewall rule that allows port 8787 only from Tailscale devices (run once in an administrator PowerShell):

```powershell
New-NetFirewallRule -DisplayName "avataragent 8787 (Tailscale)" -Direction Inbound -Protocol TCP -LocalPort 8787 -RemoteAddress 100.64.0.0/10 -Action Allow
```

## Data

- Tasks, staff and cost records are stored in `data\office.db`.
- To keep test data separate, set another folder in `.env`, such as `DATA_DIR=data/test`, and `restart`.
- The old single-JSON state is migrated to the new relational tables automatically. Keeping a copy of the DB file before the migration is safer.
- When the server restarts, tasks resume from their current step, and pending approvals and help requests are restored.
- Recovery is currently at-least-once, so if the server stops right after an AI response, the same step may be called again. Don't connect outbound messaging or payment tools until idempotency keys are added.

## AI call reliability

You can tune these values in `.env`.

| Variable | Default | Meaning |
|---|---:|---|
| `AI_TIMEOUT_MS` | 60000 | Timeout for AI HTTP calls |
| `AI_MAX_RETRIES` | 2 | Maximum retries for transient errors and invalid JSON responses |
| `AI_RETRY_BASE_MS` | 750 | Initial wait for exponential backoff |

408, 409, 429 and 5xx responses, network errors and timeouts are retried. Authentication failures and ordinary 4xx request errors are not.

## MCP connections (search, Notion, mail etc.)

Connect outside features as MCP servers on the **MCP** tab at the top. Only the owner can see it.

1. In **Add connection**, pick a ready-made entry (web search, Notion, GitHub, web page reader) or press **Enter manually**.
2. Enter the token or API key and press **Save and test connection**; the server's tool list appears.
3. Choose how each tool is used, and which offices use it.
   - **Off**: not used.
   - **Automatic during research**: staff in that office call it up to 3 times when needed in the **research step**. Calls and results are kept in the task log and research notes.
   - **Run after approval**: for tools that write outward, such as sending mail or posting. When the result reaches the approval step, the writer proposes "external actions to run on approval" (up to 3). On the approval screen you can expand what will be sent and switch off individual actions; nothing runs until you press **Approve and apply**.

- Only tools the server marks "read-only" start as "Automatic during research". Unmarked tools start off, and tools marked "destructive (delete etc.)" can only be set to "Run after approval".
- Server cards show call and failure counts and the last use; a task's header line shows its tool call count.
- The same external action runs only once. Its state is saved right before it runs, so if the server stops mid-run it isn't sent again and is left as "result needs checking". Check it directly in the other service in that case.
- Requesting changes deletes the proposed external actions; new ones are proposed when the result returns to the approval step.
- Tokens and keys are stored only in `data/office.db`, and only their last 4 characters are shown.
- **OAuth sign-in**: for remote MCP servers that connect by signing in instead of a token (e.g. the ready-made "Notion (sign-in)"), turn on **Use OAuth sign-in** and save. That service's sign-in and consent screen opens in a new window; once you allow it, you return to the office and the tool list loads. Use the **Sign in**/**Sign out** buttons on the card to redo or remove it.
  - The return address is `PUBLIC_URL/api/mcp-oauth/callback` if `PUBLIC_URL` is set, otherwise the address you're currently on. If you signed in through the public address, sign in again while on that same address.
  - Sign-in tokens are also stored only in `data/office.db` and refreshed automatically when they expire. If a refresh fails, the card shows "Sign-in needed".
  - Open the sign-in window in a browser signed in as the office owner.
- **Connect by address (HTTP)** works right away. **Run on this PC (npx/uvx)** runs commands on this PC, so it only turns on after you put `MCP_ALLOW_STDIO=1` in `.env` and `restart`. If public access is on, switch to a long password first.
- Among the ready-made entries, web search and Notion need Node.js (npx) on this PC, and the web page reader needs uv (uvx).
- Tools you've turned on are really called even in simulation mode (the first search-type tool is called once with the task title). Be careful with paid APIs. "Run after approval" tools also propose one action with the first tool in simulation, and approving it really runs it, so switch them off or untick the action when testing.

## Task runtime (local / Temporal)

### Local development infrastructure

With Docker Desktop running, `npm.cmd run infra:up` starts the app's PostgreSQL, Temporal and the Temporal UI together.

- App DB: `postgresql://avataragent:avataragent_dev@localhost:55432/avataragent`
- Temporal: `localhost:7233`
- Temporal UI: `http://localhost:8233`
- Stop: `npm.cmd run infra:down` (volumes are kept)

`infra/compose.dev.yml` is for development only. Don't use Temporal's `auto-setup` image in production. In production, use managed Temporal Cloud or a `temporalio/server` setup whose schema you manage separately.

### Switching to PostgreSQL

1. Shut the app down cleanly.
2. Create an empty database in PostgreSQL.
3. Migrate the existing SQLite once with the commands below.

```powershell
$env:DATABASE_URL='postgresql://avataragent:avataragent_dev@localhost:55432/avataragent'
npm.cmd run storage:migrate
```

Point to another SQLite file with `$env:SQLITE_PATH='D:\backup\office.db'`. After a successful migration, save `DATABASE_URL` in `.env`. Without it, the existing `data/office.db` stays in use.

`GET /api/health` shows the storage type, tenant, save queue errors, the tenant lock, the write conflict count and the runtime type. On a clean shutdown, all pending PostgreSQL writes are flushed.

### Tenants and multiple servers

- All data is stored under `TENANT_ID` in `.env` (default `default`; letters, digits, `-` and `_`). Run each company's server with a different `TENANT_ID` and they can share one PostgreSQL without seeing each other's data (settings and API keys included).
- Only one server can run per `TENANT_ID`. A second server waits 30 seconds and then exits with "Another server is already using the data of tenant …". If a server you just force-killed still has a connection open, it's released during that wait.
- Saves write only the changed rows, checking their versions. If they collide with another write, such as editing the DB directly, the server discards its own save and reloads from the DB (`conflicts` in `/api/health`).
- An old-format `data/office.db` or PostgreSQL is migrated automatically the first time a new version starts. Backing up first is safer (for SQLite, stop the server and copy the `data/office.db*` files).
- `storage:migrate` moves only the data of `TENANT_ID`, and stops if the target PostgreSQL already has data for that tenant.

By default, a local runtime runs tasks inside the server process. With the Temporal runtime, each task gets a Temporal Workflow, and if the server stops and starts again, it continues from Temporal's execution history.

1. Start a Temporal server. For personal testing, the Temporal CLI's dev server is enough: `temporal server start-dev` (default address `localhost:7233`, web UI `http://localhost:8233`).
2. Put `WORKFLOW_RUNTIME=temporal` in `.env` and `restart`. If the address differs, also set `TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE` and `TEMPORAL_TASK_QUEUE`.

- For now the Temporal Worker runs inside the server process. Stopping the server pauses tasks in progress, and they continue when it starts again.
- Tasks in progress on the local runtime are taken over by Temporal the first time the server starts after the switch. To switch back, do it when no tasks are in progress on Temporal.
- If the Temporal server is down, new tasks fail with "Couldn't start the Temporal execution".

## Check commands

| Check | Command |
|---|---|
| Regular tests | `npm.cmd run test:unit` |
| Temporal integration tests | `npm.cmd run infra:up`, then `npm.cmd run test:temporal` |
| All tests | `npm test` (where the embedded Temporal dev server is available) |
| Type check | `npm run typecheck` |
| Production build | `npm run build` |
