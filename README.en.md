# AvatarCast Office

**AvatarCast** — a project office where you watch your AI character team at work

[한국어](README.md) | English | [日本語](README.ja.md) | [简体中文](README.zh-CN.md)

[avatarcast.app](https://avatarcast.app)

A web app that casts AI agents as a team of characters by role and shows them working, along with the flow of the work, inside offices and project rooms.
When you add a task, the manager, researcher, writer and reviewer take turns along a **workflow**, and once you approve the result at the end, the result and its value are reflected in reports and the profit and loss.

## GitHub description

| Language | Description |
| --- | --- |
| 한국어 | AI 캐릭터 팀이 일하는 모습, 업무 흐름, 결과 보고서를 게임처럼 보여 주는 프로젝트 오피스 |
| English | A visual project office where AI character teams work, show their workflow, and report results like a game |
| 日本語 | AIキャラクターチームの作業、ワークフロー、成果レポートをゲームのように見せるプロジェクトオフィス |
| 简体中文 | 像游戏一样展示 AI 角色团队的工作过程、工作流和成果报告的项目办公室 |

For durable execution and the PostgreSQL development environment, start Docker Desktop and run `npm.cmd run infra:up`. See [OPERATIONS.en.md](OPERATIONS.en.md) for migrating existing SQLite data and verifying Temporal.

<p align="center">
  <img src="docs/office.webp" alt="Development team office decorated with the illustrated office theme" width="720">
</p>

## Features

- **Pixel office**
  - Five team offices (Engineering, People, Management, Support, Wellbeing) come by default, and you can add more.
  - Staff who are working sit at their desks; staff who have finished rest in the lounge.
  - Each model provider has its own hat and each model tier its own sparkle, and you can switch between three skins (Pixel, Anime Girl, Pink Girl).
- **Workflows**
  - Use the set workflow for each task type, let AI design one, or lay out the steps yourself.
  - Steps run Brief → Research → Write → Review → Approve, up to 10 steps.
  - **Conditional loops**: attach conditions to any step, such as "if it falls short of the review criteria, go back to writing (up to 2 times)".
  - The workflow view wraps lines to fit the width automatically, and you can also move and resize nodes yourself.
- **Approval and profit**
  - Results only count once you approve them. Asking for changes sends the work back to the writing step.
  - Profit and the monthly budget are shown by comparing AI call costs with the value of the work converted into labor cost.
- **Sharing and permissions**
  - Right-click an office tab (long-press on mobile) for the Share and Close menu.
  - Share a whole office or part of it by QR code or link, and choose View, Operate or Manage permission.
- **AI providers**
  - A mock mode runs without any API key.
  - OpenAI, Anthropic, Gemini, xAI and OpenAI-compatible APIs (DeepSeek, Ollama and others) are supported, and each staff member can use a different model.
  - In the **Models** tab, register providers (hat shape and color), API keys and models (tier decoration and price), and switch the run mode on the spot.

## Technology stack

| Area | Technology |
| --- | --- |
| UI | React 19, Vite 8, pixi.js 8, React Flow (@xyflow/react) |
| Server | Node.js 24, Express 5, WebSocket (ws) |
| Storage | node:sqlite (event history + state) |
| Language | TypeScript (the UI and server share types in `shared/`) |

## Easy installation (Windows 10/11)

No programming knowledge needed. Pick just one of the methods below.

**Method 0. Installer (easiest)**

1. Download `AvatarCast-Setup-<version>.exe` from [Releases](https://github.com/YangJongWon/avataragent/releases/latest).
2. Double-click it to install. If a "Windows protected your PC" window appears, click **More info → Run anyway** (it appears because the app is not code-signed yet).
3. When it finishes, the office opens in your browser. No administrator rights and no separate Node.js installation are needed — Node.js is bundled inside the app.

- The program goes in `%LOCALAPPDATA%\Programs\AvatarCast Office`, and settings (`.env`), data and logs go in `%APPDATA%\AvatarCast Office`. Running a newer installer updates the app and keeps your settings and data.
- The Start menu (and the desktop) get **AvatarCast Office**. While it runs, a tray icon appears at the bottom right of the taskbar; right-click it for Open office, Restart and Stop server (to update, run a newer installer). To remove it, uninstall it from Apps in Windows Settings; you will be asked whether to delete the data as well.
- If you check **Install Tailscale and sign in** on the last screen, Tailscale is installed so you can use the office from your phone or from outside. You sign up for and sign in to Tailscale yourself.
- Building the installer: `powershell -File installer/build.ps1` (requires Inno Setup 6). When you push a version tag (`v0.2.0`), GitHub Actions builds it and attaches it to the Release.

**Method 1. One command**

1. Search for `PowerShell` in the Start menu and open it.
2. Copy the line below, paste it and press Enter.

   ```powershell
   irm https://raw.githubusercontent.com/YangJongWon/avataragent/main/scripts/get.ps1 | iex
   ```

**Method 2. Download the files**

1. Click the green **Code** button at the top of this page → **Download ZIP**.
2. Right-click the downloaded ZIP file → **Extract All** to wherever you like.
3. Double-click **`설치.cmd`** (Install) in the extracted folder. If a "Windows protected your PC" window appears, click **More info → Run anyway**.

What the installer takes care of:

- Installs Node.js if it is missing. Click **Yes** if a permission prompt appears.
- Downloads the required packages and builds the UI. The first time takes about 5–10 minutes.
- Asks for an access password. If you only use it on this PC, you can just press Enter.
- Creates one **AvatarCast Office** desktop shortcut and opens the office in your browser.

While it runs, a tray icon appears at the bottom right of the taskbar (next to the clock). Double-click it to open the office, or right-click it for the menu.

| Tray menu | What it does |
| --- | --- |
| Open office | Opens it in your browser (starts the server if it is stopped) |
| Restart | Stops and starts the server |
| Update | Downloads the new version and restarts. Settings (`.env`) and data (`data` folder) are kept |
| Stop server | Stops the server and removes the tray icon |

The install folder also has `시작.cmd` (start), `끄기.cmd` (stop) and `업데이트.cmd` (update), which do the same things.

At first it runs as a **simulation** without an API key. To use real AI, enter a free API key in the OpenRouter card of the **Models** tab at the top of the screen. Once you save the key, the default staff switch automatically to **Real AI per person** using OpenRouter's free models. Free models have usage limits and the models on offer can change, so we recommend not sending confidential or personal information.

If something goes wrong:

- If you see "Another program is using the port", open the `.env` file in the install folder with Notepad, change `PORT=8787` to something like `PORT=8788`, and start again.
- If the server does not start, share the contents of `logs\server.err.log` in the install folder.
- If a Windows Firewall window appears, click **Allow**. It is needed to open the office from a phone on the same Wi-Fi.

## Easy installation (macOS / Linux)

1. Open **Terminal**. On macOS, press `Command+Space` to open Spotlight and search for `Terminal`.
2. Copy the line below, paste it and press Enter.

   ```bash
   curl -fsSL https://raw.githubusercontent.com/YangJongWon/avataragent/main/scripts/get.sh | bash
   ```

The program is installed to `avataragent` in your home folder. In the same order as on Windows, it takes care of Node.js, packages, the settings file, building the UI, launch icons and the first run.

- If Node.js is missing, macOS installs it with Homebrew when Homebrew is available; otherwise it is installed in your user folder (nvm). No administrator password is needed.
- On macOS, only `AvatarCast Office.command` (start) is created on the desktop. Double-click it and a Terminal window briefly opens to run it. Stop and update with `끄기.command` and `업데이트.command` in the install folder.
- On Linux, one launcher is added to the app list (and the desktop); stop and update are in its right-click menu.
- If you downloaded the ZIP, on macOS right-click `설치.command` in the folder → **Open**; on Linux, run `bash scripts/install.sh` in the folder.
- To manage it directly from the terminal, use `scripts/office.sh start|stop|restart|status|update|upgrade`. If the server does not start, check `logs/server.err.log`.

## Getting started (for developers)

Node.js 24 or later is required.

```bash
npm install
cp .env.example .env   # Windows PowerShell: Copy-Item .env.example .env
```

If you leave `.env` at its default (`AI_PROVIDER=mock`), it runs as a simulation without an API key.
To use real models, register an API key in the **Models** tab and choose "Real AI per person", or fill in `AI_PROVIDER` and the API key in `.env`.

### Development mode

```bash
npm run dev
```

The server (`tsx watch`) and the Vite dev server start together.

### Production mode

```bash
npm run build
npm start              # http://localhost:8787
```

On Windows, one script handles background running, updates and public access through Tailscale.

```powershell
npm run office -- start    # run in the background
npm run office -- status   # check status and access addresses
npm run office -- update   # build and restart
npm run office -- upgrade  # fetch new code (git pull or ZIP) + build + restart
npm run office -- open     # start if stopped and open in the browser
npm run office -- stop
```

> Always set `ACCESS_PASSWORD` in `.env` before exposing the server to the outside.

### Verification

```powershell
npm test
npm run typecheck
npm run build
```

## Folder structure

```text
shared/   Types shared by UI and server; team, workflow and permission rules
server/   API, real-time events, task orchestrator, AI calls, storage
web/      React UI and the pixel office (pixi.js)
site/     Public website and community gallery
scripts/  Operation scripts (office.ps1, office.sh), installation (install.ps1, get.ps1, install.sh, get.sh)
```

## Documentation

- [Product plan](AI_AGENT_OFFICE_PRODUCT_PLAN.en.md)
- [Development status](DEVELOPMENT_STATUS.en.md)
- [Operations guide](OPERATIONS.en.md)
- [Help](docs/HELP.en.md)
- [Theme guide](docs/THEME_GUIDE.en.md)
- [Privacy](docs/PRIVACY.en.md)
- [Architecture decision records](docs/ARCHITECTURE_DECISIONS.en.md)
- [Contributing](CONTRIBUTING.en.md)

## License

Dual-licensed under [AGPL-3.0](LICENSE) and a commercial license. A commercial license is required to use modified code in a service without publishing it. See [LICENSING.en.md](LICENSING.en.md) for details.
