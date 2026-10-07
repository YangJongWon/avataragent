# 🏢 AvatarCast Office

**AI 智能体办公室** — 看得见工作过程的 AI 员工

[한국어](README.md) | [English](README.en.md) | [日本語](README.ja.md) | 简体中文

这是一款可视化 Web 应用：你可以把工作交给 AI 员工，在像素办公室中观察其工作过程，并审核最终成果。经理、研究员、撰稿人和审核员会按照可视化工作流依次执行任务。用户批准最终成果后，其价值会计入收益。

如需耐久工作流和 PostgreSQL 开发环境，请启动 Docker Desktop 后运行 `npm.cmd run infra:up`。SQLite 迁移和 Temporal 验证步骤请参阅 `OPERATIONS.md`。

<p align="center"><img src="docs/office.webp" alt="插画办公室主题的开发团队办公室" width="720"></p>

## 主要功能

- **可视化办公室：** 默认提供五个团队，可添加办公室；包含工作和休息动画、不同 AI 厂商的帽子、模型等级特效以及可切换的角色皮肤。
- **工作流：** 可使用模板、让 AI 自动设计，或手动创建最多十个步骤。条件循环可将未通过审核的成果送回修改。
- **审批与收益：** 只有经过用户批准的成果才会生效，并统一展示 AI 调用成本、折算人工价值、收益和月度预算。
- **共享与权限：** 可通过链接或二维码共享全部或部分办公室，并设置查看、操作或管理权限。
- **AI 提供商：** 支持无需 API 密钥的模拟模式，以及 OpenAI、Anthropic、Gemini、xAI 和 DeepSeek、Ollama 等 OpenAI 兼容 API。

## 技术栈

| 范围 | 技术 |
| --- | --- |
| 前端 | React 19、Vite 8、pixi.js 8、React Flow |
| 服务端 | Node.js 24、Express 5、WebSocket |
| 存储 | node:sqlite（事件记录与状态） |
| 语言 | TypeScript（前后端共享类型） |

## 简易安装 — Windows 10/11

打开 PowerShell 并运行：

```powershell
irm https://raw.githubusercontent.com/YangJongWon/avataragent/main/scripts/get.ps1 | iex
```

也可以下载仓库 ZIP，解压后双击 **`설치.cmd`**。如果出现 Windows SmartScreen，请选择**更多信息 → 仍要运行**。

安装程序会按需安装 Node.js、下载依赖、构建应用、询问可选访问密码、创建桌面快捷方式并打开办公室。首次安装可能需要 5～10 分钟。

初始状态使用不需要 API 密钥的模拟模式。若要使用真实 AI，请在页面顶部的**模型管理**标签中添加 API 密钥。

故障排查：

- 如果端口已被占用，请将 `.env` 中的 `PORT=8787` 改为 `PORT=8788` 等其他端口。
- 如果服务器无法启动，请查看 `logs/server.err.log`。
- 如需从同一 Wi-Fi 下的手机访问，请允许 Windows 防火墙访问。

## 简易安装 — macOS / Linux

打开终端并运行：

```bash
curl -fsSL https://raw.githubusercontent.com/YangJongWon/avataragent/main/scripts/get.sh | bash
```

应用会安装到 `~/avataragent`。安装程序会自动准备 Node.js、依赖、配置、生产构建、启动图标和首次运行。

- macOS 会在桌面创建启动、停止和更新用的 `.command` 快捷方式。
- Linux 会在应用菜单和桌面创建对应快捷方式。
- 使用 ZIP 时，macOS 请右键 **`설치.command`** 并选择“打开”；Linux 请运行 `bash scripts/install.sh`。
- 命令行管理：`scripts/office.sh start|stop|restart|status|update|upgrade`

## 开发者设置

需要 Node.js 24 或更高版本。

```bash
npm install
cp .env.example .env   # PowerShell: Copy-Item .env.example .env
npm run dev
```

生产模式：

```bash
npm run build
npm start              # http://localhost:8787
```

将服务器开放到设备外部之前，请务必在 `.env` 中设置 `ACCESS_PASSWORD`。

验证：

```bash
npm test
npm run typecheck
npm run build
```

## 目录结构

```text
shared/   共享类型、团队、工作流与权限规则
server/   API、实时事件、编排器、AI 调用与存储
web/      React 界面与 pixi.js 办公室
site/     官方网站与社区画廊
scripts/  安装和运维脚本
```

## 文档

- [产品规划](AI_AGENT_OFFICE_PRODUCT_PLAN.md)
- [开发状态](DEVELOPMENT_STATUS.md)
- [运维指南](OPERATIONS.md)
- [架构决策记录](docs/ARCHITECTURE_DECISIONS.md)
- [贡献指南](CONTRIBUTING.md)

## 许可证

项目采用 [AGPL-3.0](LICENSE) 与商业许可证双重授权。如果希望在不公开修改后源代码的情况下将其作为服务运行，则需要商业许可证。详情请参阅 [LICENSING.md](LICENSING.md)。
