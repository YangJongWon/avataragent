# AvatarCast Office

**AvatarCast** — 展示 AI 角色团队工作过程的项目办公室

[한국어](README.md) | [English](README.en.md) | [日本語](README.ja.md) | 简体中文

[avatarcast.app](https://avatarcast.app)

一款把 AI 智能体按角色编排成角色阵容，并在办公室和项目室中直观展示其工作过程与业务流程的 Web 应用。
登记任务后，管理者、调研员、撰写员和审核员会沿着 **工作流** 依次工作；最后由用户批准后，成果及其价值会反映到报告和损益中。

## GitHub 简介

| 语言 | 简介 |
| --- | --- |
| 한국어 | AI 캐릭터 팀이 일하는 모습, 업무 흐름, 결과 보고서를 게임처럼 보여 주는 프로젝트 오피스 |
| English | A visual project office where AI character teams work, show their workflow, and report results like a game |
| 日本語 | AIキャラクターチームの作業、ワークフロー、成果レポートをゲームのように見せるプロジェクトオフィス |
| 简体中文 | 像游戏一样展示 AI 角色团队的工作过程、工作流和成果报告的项目办公室 |

持久化执行和 PostgreSQL 开发环境：先启动 Docker Desktop，再运行 `npm.cmd run infra:up`。迁移现有 SQLite 数据和验证 Temporal 的步骤请参阅 [OPERATIONS.zh-CN.md](OPERATIONS.zh-CN.md)。

<p align="center">
  <img src="docs/office.webp" alt="用插画办公室主题装饰的开发团队办公室" width="720">
</p>

## 主要功能

- **像素办公室**
  - 默认有 5 个团队办公室（开发、人事、管理、客服、福利），也可以添加办公室。
  - 正在工作的员工坐在自己的办公桌前，完成工作的员工在休息室休息。
  - 每个模型提供商有专属帽子，每个模型等级有专属闪光效果，并可切换 3 种皮肤（像素、美少女、粉色女孩）。
- **工作流**
  - 可以使用每种任务类型的固定工作流，也可以交给 AI 设计，或自己编排步骤。
  - 步骤顺序为 简报 → 调研 → 撰写 → 审核 → 批准，最多 10 步。
  - **条件循环**：可以为每一步设置条件，例如"未达到审核标准就返回撰写（最多 2 次）"。
  - 工作流界面会根据宽度自动换行，也可以手动调整节点的位置和大小。
- **批准与损益**
  - 成果必须经用户批准后才会生效。要求修改时会返回撰写步骤。
  - 对比 AI 调用费用与折算成人工成本的价值，显示损益和月度预算。
- **共享与权限**
  - 右键点击办公室标签（移动端为长按）会出现共享、关闭菜单。
  - 可以通过二维码或链接共享整个办公室或其中一部分，权限可在查看、运营、管理中选择。
- **AI 提供商**
  - 提供无需 API 密钥即可运行的 mock 模式。
  - 支持 OpenAI、Anthropic、Gemini、xAI 以及 OpenAI 兼容 API（DeepSeek、Ollama 等），每位员工可以使用不同的模型。
  - 在 **模型管理** 标签中登记提供商（帽子形状和颜色）、API 密钥和模型（等级装饰和单价），并可随时切换运行方式。

## 技术栈

| 领域 | 使用技术 |
| --- | --- |
| 界面 | React 19, Vite 8, pixi.js 8, React Flow (@xyflow/react) |
| 服务器 | Node.js 24, Express 5, WebSocket (ws) |
| 存储 | node:sqlite（事件记录 + 状态） |
| 语言 | TypeScript（界面和服务器共用 `shared/` 中的类型） |

## 轻松安装（Windows 10/11）

不懂编程也没关系。只需从下面的方法中任选一种。

**方法 0. 安装程序（最简单）**

1. 从 [Releases](https://github.com/YangJongWon/avataragent/releases/latest) 下载 `AvatarCast-Setup-<版本>.exe`。
2. 双击安装。如果出现"Windows 已保护你的电脑"窗口，请点击 **更多信息 → 仍要运行**（因为目前还没有代码签名，所以会出现）。
3. 安装完成后，浏览器会打开办公室。不需要管理员权限，也不需要另外安装 Node.js，程序已内置 Node.js。

- 程序位于 `%LOCALAPPDATA%\Programs\AvatarCast Office`，设置（`.env`）、数据和日志位于 `%APPDATA%\AvatarCast Office`。直接运行新版本的安装程序即可更新，设置和数据会保留。
- 开始菜单（和桌面）会出现 **AvatarCast Office**。启动后任务栏右下角会出现托盘图标，右键点击可以选择打开办公室、重新启动和停止服务器（更新请运行新版安装程序）。卸载时在 Windows 设置的"应用"中卸载，届时会询问是否同时删除数据。
- 如果在最后一个界面勾选 **安装 Tailscale 并登录**，会安装 Tailscale，以便从手机或外部使用。Tailscale 的注册和登录需要你自己完成。
- 制作安装程序：`powershell -File installer/build.ps1`（需要 Inno Setup 6）。推送版本标签（`v0.2.0`）后，GitHub Actions 会自动制作并附加到 Release。

**方法 1. 一行命令**

1. 在开始菜单中搜索并打开 `PowerShell`。
2. 复制下面这一行，粘贴后按 Enter。

   ```powershell
   irm https://raw.githubusercontent.com/YangJongWon/avataragent/main/scripts/get.ps1 | iex
   ```

**方法 2. 下载文件**

1. 点击本页面上方的绿色 **Code** 按钮 → **Download ZIP**。
2. 右键点击下载的 ZIP 文件 → **全部解压缩**，解压到任意位置。
3. 双击解压后文件夹中的 **`설치.cmd`**（安装）。如果出现"Windows 已保护你的电脑"窗口，请点击 **更多信息 → 仍要运行**。

安装程序会自动完成：

- 如果没有 Node.js 会自动安装。出现权限确认窗口时请点击 **是**。
- 下载所需组件并构建界面。首次大约需要 5–10 分钟。
- 询问访问密码。如果只在这台电脑上使用，直接按 Enter 即可。
- 在桌面创建一个 **AvatarCast Office** 快捷方式，并用浏览器打开办公室。

运行期间，任务栏右下角（时钟旁）会出现托盘图标。双击图标会打开办公室，右键点击会出现菜单。

| 托盘菜单 | 作用 |
| --- | --- |
| 打开办公室 | 在浏览器中打开（如果已停止则启动） |
| 重新启动 | 停止并重新启动服务器 |
| 更新 | 获取新版本并重新启动。设置（`.env`）和数据（`data` 文件夹）保持不变 |
| 停止服务器 | 停止服务器，托盘图标也会消失 |

安装文件夹中也有作用相同的 `시작.cmd`（启动）、`끄기.cmd`（停止）和 `업데이트.cmd`（更新）。

一开始会在没有 API 密钥的情况下以 **模拟** 方式运行。要使用真实 AI，请在界面上方 **模型管理** 标签的 OpenRouter 卡片中填入免费 API 密钥。保存密钥后，默认员工会自动切换为使用 OpenRouter 免费模型的 **每人真实 AI**。免费模型有使用量限制，提供的模型也可能变化，建议不要发送机密或个人信息。

遇到问题时：

- 如果提示"端口被其他程序占用"，用记事本打开安装文件夹中的 `.env` 文件，把 `PORT=8787` 改成 `PORT=8788` 之类，然后重新启动。
- 如果服务器无法启动，请提供安装文件夹中 `logs\server.err.log` 的内容。
- 如果出现 Windows 防火墙窗口，请点击 **允许**。从同一 Wi-Fi 下的手机打开时需要。

## 轻松安装（macOS / Linux）

1. 打开 **终端**。在 macOS 上按 `Command+Space` 打开 Spotlight，搜索 `终端`。
2. 复制下面这一行，粘贴后按 Enter。

   ```bash
   curl -fsSL https://raw.githubusercontent.com/YangJongWon/avataragent/main/scripts/get.sh | bash
   ```

程序会安装到主文件夹下的 `avataragent`。与 Windows 相同，会依次自动完成 Node.js、组件、设置文件、界面构建、启动图标和首次运行。

- 如果没有 Node.js，macOS 在有 Homebrew 时用 Homebrew 安装，否则安装到你的用户文件夹（nvm）。不需要管理员密码。
- macOS 只在桌面创建 `AvatarCast Office.command`（启动）。双击后会短暂打开终端窗口并运行。停止和更新使用安装文件夹中的 `끄기.command` 和 `업데이트.command`。
- Linux 会在应用列表（和桌面）中创建一个启动图标，停止和更新放在图标的右键菜单中。
- 如果是下载的 ZIP，在 macOS 上右键点击文件夹中的 `설치.command` → **打开** 运行；在 Linux 上在文件夹中运行 `bash scripts/install.sh`。
- 在终端中直接操作时，使用 `scripts/office.sh start|stop|restart|status|update|upgrade`。如果服务器无法启动，请检查 `logs/server.err.log`。

## 快速开始（开发者）

需要 Node.js 24 或更高版本。

```bash
npm install
cp .env.example .env   # Windows PowerShell: Copy-Item .env.example .env
```

如果 `.env` 保持默认值（`AI_PROVIDER=mock`），无需 API 密钥即可以模拟方式运行。
要使用真实模型，请在界面的 **模型管理** 标签中登记 API 密钥并选择"每人真实 AI"，或在 `.env` 中填写 `AI_PROVIDER` 和 API 密钥。

### 开发模式

```bash
npm run dev
```

服务器（`tsx watch`）和 Vite 开发服务器会一起启动。

### 生产模式

```bash
npm run build
npm start              # http://localhost:8787
```

在 Windows 上，一个脚本即可完成后台运行、更新和通过 Tailscale 对外公开。

```powershell
npm run office -- start    # 后台运行
npm run office -- status   # 查看状态和访问地址
npm run office -- update   # 构建后重启
npm run office -- upgrade  # 获取新代码（git pull 或 ZIP）+ 构建 + 重启
npm run office -- open     # 如果已停止则启动，并在浏览器中打开
npm run office -- stop
```

> 对外公开时，请务必设置 `.env` 中的 `ACCESS_PASSWORD`。

### 验证

```powershell
npm test
npm run typecheck
npm run build
```

## 目录结构

```text
shared/   界面与服务器共用的类型，团队、工作流和权限规则
server/   API、实时事件、任务编排器、AI 调用、存储
web/      React 界面和像素办公室（pixi.js）
site/     公开网站和社区画廊
scripts/  运营脚本（office.ps1, office.sh），安装（install.ps1, get.ps1, install.sh, get.sh）
```

## 文档

- [产品企划书](AI_AGENT_OFFICE_PRODUCT_PLAN.zh-CN.md)
- [开发现状](DEVELOPMENT_STATUS.zh-CN.md)
- [运营指南](OPERATIONS.zh-CN.md)
- [帮助](docs/HELP.zh-CN.md)
- [主题指南](docs/THEME_GUIDE.zh-CN.md)
- [隐私](docs/PRIVACY.zh-CN.md)
- [架构决策记录](docs/ARCHITECTURE_DECISIONS.zh-CN.md)
- [贡献指南](CONTRIBUTING.zh-CN.md)

## 许可

采用 [AGPL-3.0](LICENSE) 与商业许可的双重许可。如果要在服务中使用修改后的代码而不公开源码，需要商业许可。详情请参阅 [LICENSING.zh-CN.md](LICENSING.zh-CN.md)。
