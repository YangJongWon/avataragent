# 服务器运营指南（个人测试用）

介绍如何在这台电脑上启动服务器，并通过 Tailscale 从手机或外部访问。
所有命令都在项目文件夹的 PowerShell 中运行。

## 访问地址

| 类型 | 地址 | 可访问的位置 |
|---|---|---|
| 本机 | http://localhost:8787 | 本机 |
| Tailscale | `http://<Tailscale IP>:8787` | 已登录 Tailscale 的你的设备 |
| 对外公开 | `https://<设备名>.<tailnet>.ts.net:8443` | 互联网上任何地方 |

- 实际地址用 `npm run office -- status` 查看。
- 访问密码：`.env` 中的 `ACCESS_PASSWORD`
- 登录一次后，该浏览器 30 天内不会再询问。
- 退出登录：在地址后加上 `/logout` 访问。

## 分享给其他人

只有所有者（用密码登录的人）可以操作。

1. 在办公室标签（“开发团队”“支持团队”等）上，桌面端右键、手机上长按，打开菜单。
2. 选择 **🔗 分享此办公室**（已预先选中该办公室）或 **🏢 分享全部办公室**。
3. 设定名称（例如“金代理的手机”）、范围（全部办公室或所选办公室）、权限和有效期，然后创建。
4. 用手机扫描列表中的二维码，或复制链接发送。收到的人无需密码即可查看该范围。

| 权限 | 可以做的事 |
|---|---|
| 查看 | 只能查看办公室画面、任务流程和报告 |
| 处理任务 | 查看 + 登记任务和编辑流程、回复求助、批准和要求修改、取消任务 |
| 管理办公室 | 处理任务 + 员工设置、团队资料（关注点等）、模拟 |

- 任何权限都不能添加或删除办公室、管理预算或管理分享。
- 用同一标签菜单中的 **🗑 关闭办公室** 关闭自己创建的办公室。默认办公室和有任务进行中的办公室不能关闭。
- 通过“分享此办公室”打开时，列表只显示能查看该办公室的链接。要查看全部链接，请打开“也显示其他办公室的链接”。
- 链接地址由 `.env` 中的 `PUBLIC_URL`（对外公开地址）生成。也可以在分享窗口中改为 Tailscale 地址等。
- 点击 **撤回** 后，正在通过该链接访问的画面也会立即断开。
- 在通过分享链接进入的浏览器中，若要恢复为所有者，请点击顶部徽章上的 **离开**（`/logout`），再用密码登录。

## 常用命令

| 想做的事 | 命令 |
|---|---|
| 启动服务器 | `npm run office -- start` |
| 停止服务器 | `npm run office -- stop` |
| 重启服务器 | `npm run office -- restart` |
| 修改代码后更新（安装 + 构建 + 重启） | `npm run office -- update` |
| 获取新版本并更新（git pull 或 GitHub ZIP + update） | `npm run office -- upgrade` |
| 未运行则启动并在浏览器中打开 | `npm run office -- open` |
| 查看当前状态（服务器、Tailscale 地址、是否对外公开） | `npm run office -- status` |
| 打开对外公开 | `npm run office -- public-on` |
| 关闭对外公开 | `npm run office -- public-off` |
| 生成外部访问二维码 | `npm run office -- qr` |

- 服务器与终端分离，在后台运行。关闭终端窗口后仍会继续运行，用 `stop` 停止。
- 服务器日志写入 `logs\server.log`，错误日志写入 `logs\server.err.log`。
- 实际脚本是 `scripts\office.ps1`。`npm run office -- start` 等同于：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\office.ps1 start
```

### 什么时候用哪个

- **修改了界面或服务器代码时：** `update`。界面必须构建后才会生效，只用 `restart` 不够。
- **只修改了 `.env` 时（密码、AI 密钥等）：** `restart`。
- **电脑重启后：** `start`。Tailscale 会记住对外公开的设置，无需重新打开。

## 修改密码

1. 把 `.env` 中 `ACCESS_PASSWORD=` 的值改为想要的密码。
2. 运行 `npm run office -- restart`。

- 修改密码后，之前登录的所有设备都会被登出。分享链接不受影响。
- `ACCESS_PASSWORD` 留空时无需密码即可打开。对外公开期间不要留空。

## 对外公开时的注意事项

- 短密码只用于测试。要把地址告诉别人或使用真实的 AI 密钥时，请换成长密码。
- `.env` 中的 `AI_PROVIDER` 为 `mock` 时不会产生 AI 费用。换成真实模型后，从外部登记的任务也会产生费用。
- 在界面的 **模型管理** 标签中更改运行方式会优先于 `.env`。选择“按员工使用真实 AI”后，从下一次 AI 调用开始产生实际费用。
- 在模型管理中登记的 API 密钥保存在 `data/office.db` 中。备份或迁移 `data/` 文件夹时，密钥也会一起带走，请注意。
- 测试结束后用 `public-off` 关闭对外公开。
- 本应用通过 Tailscale Funnel 的 8443 端口对外公开。不带端口的默认地址可能被其他服务使用，不要改动。

## 开发模式

用于一边修改界面一边即时查看。它与正式服务器使用同一端口（8787），所以先用 `stop` 停止正式服务器。

```powershell
npm run office -- stop
npm run dev
```

- 界面：http://localhost:5173（保存后立即生效）
- 如果设置了密码，开发模式下也会显示登录界面。
- 结束后用 `Ctrl+C` 停止；要重新启动正式服务器，请运行 `npm run office -- update`。

## 首次安装（其他电脑）

对不懂编程的人，请引导他们查看 README 中的“轻松安装”。`설치.cmd`（或 `scripts\get.ps1` 一行命令）会完成 Node.js 安装（winget）、`npm install`、创建 `.env`（会询问密码）、构建、桌面快捷方式和首次运行。

- 在用 git 获取的文件夹中，`upgrade` 会执行 `git pull --ff-only`，有修改过的文件时会停止。在用 ZIP 获取的文件夹中，会下载 GitHub 的 main ZIP 并覆盖，不会动 `.env`、`data`、`logs`、`node_modules`。
- 修改 `.env` 中的 `PORT` 后，`office` 脚本也会使用该端口。
- `stop` 不仅会停止占用端口的服务器，也会一并停止其上层的 tsx、npm 启动器。

macOS/Linux 上由 `scripts/get.sh`（一行命令）或 `scripts/install.sh` 完成同样的工作。Node.js 在 macOS 上如有 Homebrew 则用 Homebrew 安装；没有 Homebrew 或在 Linux 上，则用 nvm 安装到主目录。启动图标在 macOS 上是桌面的 `.command` 文件，在 Linux 上是 `~/.local/share/applications` 中的 `.desktop` 文件。

- `scripts/office.sh` 支持与 `office.ps1` 相同的命令（start、stop、restart、update、upgrade、open、status、public-on、public-off）。
- 服务器 PID 写入 `logs/server.pid`。Linux 上用 `setsid` 启动并按进程组整体停止，macOS 上会找到子进程一并停止。
- `upgrade` 在 git 文件夹中执行 `git pull --ff-only`，否则下载 GitHub 的 main tar.gz 并覆盖。不会动 `.env` 和 `data`。
- 已在 Ubuntu 24.04 容器（无 Node.js）中验证了安装、启动/重启/停止和 upgrade。macOS 尚未在真机上验证。

## 出现问题时

| 症状 | 检查项 |
|---|---|
| `start` 后提示“15 秒内没有启动” | 查看 `logs\server.err.log` |
| 提示“已在运行”但打不开界面 | 检查是否有其他程序占用 8787。先 `stop` 再 `start` |
| 手机上打不开 Tailscale 地址 | 确认手机上的 Tailscale 应用处于已连接（Connected）状态。仍不行就添加下面的防火墙规则 |
| 打不开外部地址 | 用 `npm run office -- status` 确认服务器和对外公开都已打开 |

只允许 Tailscale 设备访问 8787 端口的防火墙规则（在管理员 PowerShell 中只需运行一次）：

```powershell
New-NetFirewallRule -DisplayName "avataragent 8787 (Tailscale)" -Direction Inbound -Protocol TCP -LocalPort 8787 -RemoteAddress 100.64.0.0/10 -Action Allow
```

## 数据

- 任务、员工、费用记录保存在 `data\office.db` 中。
- 想单独使用测试数据时，在 `.env` 中指定其他文件夹，例如 `DATA_DIR=data/test`，然后 `restart`。
- 旧的单一 JSON 状态会自动迁移到新的关系型表中。迁移前另外保存一份 DB 文件会更安全。
- 重启服务器后，任务会从当前步骤继续，等待中的批准和求助也会恢复。
- 目前是 at-least-once 恢复，如果服务器在 AI 响应后立即停止，可能会再次调用同一步骤。在添加幂等键之前，不要接入对外发送或付款类工具。

## AI 调用稳定性

可以在 `.env` 中调整以下值。

| 变量 | 默认值 | 含义 |
|---|---:|---|
| `AI_TIMEOUT_MS` | 60000 | AI HTTP 调用的超时时间 |
| `AI_MAX_RETRIES` | 2 | 临时错误和无效 JSON 响应的最大重试次数 |
| `AI_RETRY_BASE_MS` | 750 | 指数退避的初始等待时间 |

408、409、429 和 5xx 响应、网络错误和超时会重试。认证失败和一般的 4xx 请求错误不会重试。

## MCP 连接（搜索、Notion、邮件等）

在顶部的 **MCP 管理** 标签中，把外部功能作为 MCP 服务器接入。只有所有者能看到。

1. 在 **添加连接** 中选择预设项目（网页搜索、Notion、GitHub、网页读取），或点击 **手动输入**。
2. 填入令牌或 API 密钥后点击 **保存并检查连接**，会显示该服务器的工具列表。
3. 为每个工具选择使用方式和使用它的办公室。
   - **关闭**：不使用。
   - **调研时自动**：该办公室的员工在 **调研步骤** 需要时最多调用 3 次。调用和结果会留在任务记录和调研笔记中。
   - **批准后执行**：用于发送邮件、发帖等向外写入的工具。成果进入批准步骤时，撰写者会提出“批准后执行的外部操作”（最多 3 个）。可在批准界面展开查看要发送的内容，并逐项关闭；只有点击 **批准并生效** 才会执行。

- 只有服务器标记为“只读”的工具一开始就是“调研时自动”。没有标记的工具默认关闭，标记为“危险（删除等）”的工具只能选择“批准后执行”。
- 服务器卡片上显示调用次数、失败次数和最后使用时间，任务标题行显示该任务的工具调用次数。
- 同一个外部操作只会执行一次。执行前会先保存状态，所以如果执行中服务器停止，不会重新发送，而是标记为“需要确认结果”。这种情况下请到对方服务中直接确认。
- 要求修改后，已提出的外部操作会被删除，再次进入批准步骤时会重新提出。
- 令牌和密钥只保存在 `data/office.db` 中，界面上只显示最后 4 位。
- **OAuth 登录**：对于用登录代替令牌接入的远程 MCP（例如预设项目“Notion（登录）”），打开 **使用 OAuth 登录** 后保存。新窗口会打开该服务的登录和授权界面，允许后返回办公室并加载工具列表。用卡片上的 **登录**／**退出登录** 按钮重新登录或解除。
  - 返回地址在设置了 `PUBLIC_URL` 时为 `PUBLIC_URL/api/mcp-oauth/callback`，否则为当前访问的地址。如果是通过对外公开地址登录的，需要在同一地址下重新登录。
  - 登录令牌同样只保存在 `data/office.db` 中，过期后会自动刷新。刷新失败时卡片上会显示“需要登录”。
  - 请在以办公室所有者身份登录的浏览器中打开登录窗口。
- **通过地址连接（HTTP）** 可以直接使用。**在本机运行（npx·uvx）** 会在本机执行命令，需要在 `.env` 中加入 `MCP_ALLOW_STDIO=1` 并 `restart` 后才会启用。如果正在对外公开，请先把密码改长。
- 预设项目中，网页搜索和 Notion 需要本机安装 Node.js（npx），网页读取需要 uv（uvx）。
- 即使在模拟模式下，已打开的工具也会被真实调用（用任务标题调用一次第一个搜索类工具）。如果是收费的 API，请注意。“批准后执行”的工具在模拟中也会用第一个工具提出一项操作，批准后会真实执行，所以测试时请关闭工具或取消勾选该操作。

## 任务执行器（local / Temporal）

### 本地开发基础设施

启动 Docker Desktop 后，用 `npm.cmd run infra:up` 同时启动应用用的 PostgreSQL、Temporal 和 Temporal UI。

- 应用 DB：`postgresql://avataragent:avataragent_dev@localhost:55432/avataragent`
- Temporal：`localhost:7233`
- Temporal UI：`http://localhost:8233`
- 停止：`npm.cmd run infra:down`（数据卷会保留）

`infra/compose.dev.yml` 仅用于开发。Temporal 的 `auto-setup` 镜像不用于正式部署。正式环境请使用托管的 Temporal Cloud，或单独管理 schema 的 `temporalio/server` 配置。

### 切换到 PostgreSQL

1. 正常关闭应用。
2. 在 PostgreSQL 中创建一个空数据库。
3. 用以下命令一次性迁移现有的 SQLite。

```powershell
$env:DATABASE_URL='postgresql://avataragent:avataragent_dev@localhost:55432/avataragent'
npm.cmd run storage:migrate
```

其他 SQLite 文件用 `$env:SQLITE_PATH='D:\backup\office.db'` 指定。迁移成功后，把 `DATABASE_URL` 保存到 `.env` 中。不设置的话会继续使用现有的 `data/office.db`。

在 `GET /api/health` 中可以查看存储类型、tenant、保存队列错误、tenant 锁、写入冲突次数和执行器类型。进程正常退出时，会写完所有等待中的 PostgreSQL 写入。

### tenant 与多台服务器

- 所有数据都保存在 `.env` 的 `TENANT_ID`（默认 `default`，可用英文字母、数字、`-`、`_`）下。为每家公司用不同的 `TENANT_ID` 启动服务器，即使共用同一个 PostgreSQL，也看不到彼此的数据（包括设置和 API 密钥）。
- 同一个 `TENANT_ID` 只能启动一台服务器。第二台服务器会等待 30 秒，然后以“另一台服务器正在使用 tenant … 的数据”退出。如果刚被强制关闭的服务器连接还在，会在这段时间内释放。
- 保存时只写入有变化的行，并检查版本。如果与直接修改 DB 等其他写入冲突，服务器会放弃自己的保存，重新读取 DB 内容（`/api/health` 的 `conflicts`）。
- 旧结构的 `data/office.db` 或 PostgreSQL 会在新版本首次启动时自动迁移。迁移前先备份更安全（SQLite 请先停止服务器，再复制 `data/office.db*` 文件）。
- `storage:migrate` 只迁移 `TENANT_ID` 的数据，如果目标 PostgreSQL 中已有该 tenant 的数据则会停止。

默认是在服务器进程内运行任务的本地执行器。切换到 Temporal 执行器后，每个任务都会创建一个 Temporal Workflow，即使服务器停止再启动，也会从 Temporal 的执行历史继续。

1. 启动 Temporal 服务器。个人测试用 Temporal CLI 的开发服务器就够了：`temporal server start-dev`（默认地址 `localhost:7233`，网页 UI `http://localhost:8233`）。
2. 在 `.env` 中加入 `WORKFLOW_RUNTIME=temporal` 并 `restart`。地址不同时，同时指定 `TEMPORAL_ADDRESS`、`TEMPORAL_NAMESPACE`、`TEMPORAL_TASK_QUEUE`。

- 目前 Temporal Worker 与服务器进程一起运行。停止服务器后，进行中的任务会暂停，再次启动时继续。
- 用本地执行器进行中的任务，在切换到 Temporal 后首次启动时由 Temporal 接管。反过来切回时，请在 Temporal 中没有进行中的任务时再切换。
- Temporal 服务器关闭时，新任务会以“无法启动 Temporal 执行”失败。

## 检查命令

| 检查 | 命令 |
|---|---|
| 常规测试 | `npm.cmd run test:unit` |
| Temporal 集成测试 | `npm.cmd run infra:up` 后运行 `npm.cmd run test:temporal` |
| 全部测试 | `npm test`（可使用内置 Temporal 开发服务器的环境） |
| 类型检查 | `npm run typecheck` |
| 正式构建 | `npm run build` |
