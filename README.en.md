# 🏢 AI Agent Office

[한국어](README.md) | English | [日本語](README.ja.md) | [简体中文](README.zh-CN.md)

A web app where you assign work to AI employees, watch them work in a pixel office, and approve their results. Managers, researchers, writers, and reviewers follow a visible workflow. Once you approve the final result, its value is reflected in the profit dashboard.

For durable execution and the PostgreSQL development environment, start Docker Desktop and run `npm.cmd run infra:up`. See `OPERATIONS.md` for SQLite migration and Temporal verification.

<p align="center"><img src="docs/office-mobile.png" alt="Development team office on mobile" width="360"></p>

## Highlights

- **Visual office:** five default teams, expandable offices, working and resting animations, provider hats, model-tier effects, and interchangeable character skins.
- **Workflows:** use a template, ask AI to design a workflow, or build up to ten steps yourself. Conditional loops can send rejected work back for revision.
- **Approval and profit:** results count only after user approval. AI cost, estimated labor value, profit, and the monthly budget are shown together.
- **Sharing and permissions:** share all or selected offices by link or QR code with view, operate, or manage permissions.
- **AI providers:** mock mode works without an API key. OpenAI, Anthropic, Gemini, xAI, and OpenAI-compatible APIs such as DeepSeek and Ollama are supported, with a different model per employee.

## Technology

| Area | Stack |
| --- | --- |
| UI | React 19, Vite 8, pixi.js 8, React Flow |
| Server | Node.js 24, Express 5, WebSocket |
| Storage | node:sqlite, with event history and state |
| Language | TypeScript with shared UI/server types |

## Easy installation — Windows 10/11

Open PowerShell and run:

```powershell
irm https://raw.githubusercontent.com/YangJongWon/avataragent/main/scripts/get.ps1 | iex
```

Alternatively, download the repository ZIP, extract it, and double-click **`설치.cmd`**. If Windows SmartScreen appears, choose **More info → Run anyway**.

The installer installs Node.js when needed, downloads dependencies, builds the app, asks for an optional access password, creates desktop shortcuts, and opens the office. The first installation may take 5–10 minutes.

| Desktop shortcut | Purpose |
| --- | --- |
| AI 에이전트 오피스 | Start the server and open the office |
| AI 에이전트 오피스 끄기 | Stop the server |
| AI 에이전트 오피스 업데이트 | Update and restart without removing `.env` or `data/` |

The initial setup uses simulation mode. Add API keys from the **Model Management** tab to use real AI models.

Troubleshooting:

- If the port is already in use, change `PORT=8787` in `.env`, for example to `PORT=8788`.
- If the server does not start, inspect `logs/server.err.log`.
- Allow Windows Firewall access if you want to open the office from a phone on the same Wi-Fi network.

## Easy installation — macOS / Linux

Open Terminal and run:

```bash
curl -fsSL https://raw.githubusercontent.com/YangJongWon/avataragent/main/scripts/get.sh | bash
```

The app is installed to `~/avataragent`. The installer prepares Node.js, dependencies, configuration, the production build, launch icons, and the first run.

- macOS receives start, stop, and update `.command` shortcuts on the desktop.
- Linux receives equivalent application-menu and desktop shortcuts.
- For a ZIP installation, right-click **`설치.command`** and choose **Open** on macOS, or run `bash scripts/install.sh` on Linux.
- Command-line operation: `scripts/office.sh start|stop|restart|status|update|upgrade`.

## Developer setup

Node.js 24 or later is required.

```bash
npm install
cp .env.example .env   # PowerShell: Copy-Item .env.example .env
npm run dev
```

The default `AI_PROVIDER=mock` needs no API key. For production:

```bash
npm run build
npm start              # http://localhost:8787
```

Set `ACCESS_PASSWORD` in `.env` before exposing the server outside your device.

Validation:

```bash
npm test
npm run typecheck
npm run build
```

## Repository layout

```text
shared/   Shared types, teams, workflow, and permission rules
server/   API, real-time events, orchestrator, AI calls, and storage
web/      React UI and the pixi.js office
site/     Public website and community gallery
scripts/  Installation and operation scripts
```

## Documentation

- [Product plan](AI_AGENT_OFFICE_PRODUCT_PLAN.md)
- [Development status](DEVELOPMENT_STATUS.md)
- [Operations guide](OPERATIONS.md)
- [Architecture decisions](docs/ARCHITECTURE_DECISIONS.md)
- [Contributing](CONTRIBUTING.md)

## License

Dual-licensed under [AGPL-3.0](LICENSE) and a commercial license. A commercial license is required to operate a modified version as a service without publishing the modified source. See [LICENSING.md](LICENSING.md).
