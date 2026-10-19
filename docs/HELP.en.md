# User help

[한국어](HELP.md) | English | [日本語](HELP.ja.md) | [简体中文](HELP.zh-CN.md)

An app where AI staff handle tasks in an office and you approve the results. The tabs at the top of the screen are Office, Staff, Models, MCP and Profit. Tabs other than Office are only shown to the owner (the person who signed in with the password).

## Getting started

- You start in **simulation mode**. It does not call real AI; it shows the flow with fake responses, so it costs nothing. If you see "Simulation" at the top right, you are in this mode.
- To use free real AI, enter an API key in the OpenRouter card on the **Models** tab. Once you save the key, it switches automatically to "Real AI per person" using the default free models, with no need to restart the server. Do not send confidential or personal information to free endpoints.
- Then pick a model for each staff member on **Staff**, and add a task on the office board.
- **Long-press or right-click** the "Simulation" badge at the top right ("AI per staff" with real AI) to start a usage demo. It sticks notes around the screen to walk you through the basics in order, while the staff repeatedly act out one [Demo] task (handing over the task, researching at the bookshelf, asking for help, sent back and passed, waiting for approval, done). It only plays on screen, so nothing is saved and no AI is called. On the keyboard, →/Enter is next, ← is back and Esc ends it.

## The office screen

- Five team offices (Engineering, People, Management, Support, Wellbeing) come by default, and you move between them with the office tabs at the top. The number next to a tab is the number of tasks that need you (help requests, waiting for approval).
- Staff who are working are at their desks; staff who have finished are in the lounge. Click a staff member (long-press on mobile) to open their menu.
- Right-click an office tab (long-press on mobile) for the menu to create a share link or close the office.
- Add an office with the "+ Office" button at the end of the tab row (owner only). Default offices and offices with a task in progress cannot be closed.
- On small screens (phones), the workflow goes into a bottom drawer, and help requests and approvals into a right-hand drawer.

## Giving tasks

- On the office **board**, write a task title and description, pick a task type and add it.
- Each office can queue up to 10 tasks, and the next task starts automatically when the previous one finishes. Queued tasks can be canceled or have their workflow edited.
- The usual order is intake (brief) → research → writing → review → your approval.

### Scheduled and recurring tasks

- Under **When to run** at the bottom of the new-task window, choose Now / Scheduled (once) / Daily / Weekly (pick days) / Every N hours, and the button changes to **⏰ Schedule**.
- At the set time the team puts the task on the board. If another task is in progress it goes to the queue, and outside work hours it starts once staff are in. Repeats missed while the app was off are not made up; it carries on from the next time.
- See the next run time for scheduled tasks in ⏰ Scheduled tasks at the top of the **Team data** tab, and use **Run once now** to try one immediately, or turn it off and delete it.

## Workflows (step design)

- **Set workflow**: use the default order for the task type as is.
- **AI designs it**: the lead AI looks at the task, decides the steps and who does them, and leaves its reasons. You can also get the design in advance before adding the task.
- **Design it yourself**: decide adding and removing steps, the order, who does each step and the instructions yourself. Up to 10 steps.
- **Conditional loops**: attach "if the condition is met, go back to an earlier step" to a step. For example: "if it falls short of the review criteria, back to writing, up to 2 times". Review steps have one by default.
- Turn on "✋ Adjust layout" in the workflow view to drag boxes around and resize them; "↺ Auto layout" puts them back.

## When staff ask for help

- If instructions are vague, the staff member looks troubled and asks a question. The task goes into "Needs help" and a number appears on the office tab.
- Pick an option, write your own answer, or click "Carry on with a guess".
- If there is no answer within the set time (`HELP_TIMEOUT_SEC`, default 180 seconds), the staff member makes an assumption and carries on.

## Approval and change requests

- The last step is your approval. In the report panel on the right, look at the result and the review comments, then click **Approve** or **Request changes**.
- If you write what to fix in a change request, the work goes back to the writing step and is rewritten.
- Results only count once approved, and the value converted into labor cost is counted in profit.
- Outside actions such as sending mail ("Run after approval" for MCP tools) run when you approve. You can turn each action off before approving.
- No real mail is sent; it only piles up in the **Outbox**.

## Exporting results (Excel, Word, PDF, PowerPoint)

- Use **Export** on the report tab to download Markdown, CSV, Excel, Word, PDF or PowerPoint. View permission is enough.
- For PDF, a print page opens; use the browser's "Save as PDF".
- **Design with AI**: the writer decides the layout of the document, slides or spreadsheet, and the server draws it. Blocks such as key number cards, charts, timelines and comparisons go in. Numbers not in the report are left out automatically.
- **🔍 High quality**: the file is converted to PDF, the reviewer looks at the pages and points out problems, and the writer fixes them (2 rounds by default). LibreOffice must be installed, and it uses more AI calls.
- Excel designs put total and average rows, ratio columns, conditional colors and data bars in as real Excel formulas.
- If the draft changes through a change request, the design resets to the default. Click "Design with AI" again.

## Team data (mailbox, calendar, inquiries, recommendations, budget)

- The Team data tab in the right-hand panel holds each team's data. People handles the mailbox and calendar, Support the inquiry box, Wellbeing interests and recommendations, and Management the budget caps per team.
- With auto-check on, the team starts a task on its own when new mail or inquiries arrive. Changes always apply only after approval.
- Use the "📨 New mail arrives (simulation)" and "🎧 New inquiry arrives (simulation)" buttons to add fake mail and inquiries and try out the flow.

### Connecting a real mailbox (People team)

- In **📮 Mail account** at the top of the **MCP** screen, choose the mail type (Gmail, Naver, Daum/Kakao, Custom) and enter the email address and an **app password**. It tries signing in before saving.
  - Gmail: turn on 2-Step Verification in your Google account, then create an [app password](https://myaccount.google.com/apppasswords) and paste it.
  - Naver/Daum: turn on IMAP in the mail settings. If you use 2-step verification, create an app (application) password and enter it.
  - For company mail, ask your administrator whether IMAP is allowed. App passwords may be blocked on company Google Workspace.
- **📥 Fetch new mail** fetches up to 10 messages at a time from the last 2 days of the inbox that have not been fetched yet. With auto-check on, it fetches every 5 minutes and the team sorts them on its own. Fetching only reads the mailbox.
- When you **approve** the sorting report, **it is applied to the real mailbox too**. Nothing is deleted or marked as read.

  | Category | Gmail | Naver, Daum, etc. |
  |---|---|---|
  | Schedule | `AvatarCast/일정` label (stays in inbox) | Unchanged |
  | Request | `AvatarCast/회신 필요` label (stays in inbox) | Unchanged |
  | Info | `AvatarCast/정보` label + archive | Moved to `AvatarCast/정보` folder |
  | Ads | `AvatarCast/광고` label + archive | Moved to `AvatarCast/광고` folder |

- The app password is stored only on the server on this PC and never sent to the screen. Clicking **Disconnect** deletes it too.
- Mail bodies are treated as content from outside, so staff do not follow instructions written inside mail.

## Staff

- Hire and let go staff per office. There are 4 roles: manager, researcher, writer and reviewer.
- Each staff member can use a different model. The model list is what you registered on the Models tab.
- If there are several staff with the same role, you can choose who does each step when laying out the workflow.
- Pausing a staff member stops tasks at that staff member's steps.
- **Personality / working style**: choose from Balanced, Meticulous, Fast, Creative, Friendly and Critical. Real AI receives this style with the instructions every time (organization safety rules take priority). The defaults are Meticulous for research, Critical for review and Balanced for the rest. Fast writes shorter, so it also costs less. In simulation, a style note is added to the end of work orders and research notes.

## Models (connecting AI)

- Registering a **provider** sets the shape and color of staff hats; enter the API type (OpenAI, Anthropic, Gemini, xAI, OpenAI-compatible address) and key.
- A **model** is provider + tier (decoration) + API model ID + price. "Load the list" fetches the model IDs your key can use so you can pick one (free).
- For a new model, enter just the API model ID and **the name, tier and price are filled in automatically.** If you have that provider's key, it asks the model directly (or another model from the same provider if that fails) at a very small cost; without a key, it estimates from a built-in reference price list or the name. Where each value came from is shown below, so check the provider's price list with "Check price ↗" and correct it before saving if needed. "🤖 Ask AI to fill in" asks again at any time.
- **Run mode**: choose ".env setting", "Simulation" or "Real AI per person" and it changes immediately.
- Keys show only the last 4 characters on screen. If left empty, the key in `.env` is used.
- Services such as DeepSeek and Ollama connect as "OpenAI-compatible" with an address (Base URL). Click **Quick fill** (DeepSeek, Mistral, OpenRouter, Groq, Upstage, Ollama) in "+ Add provider" to fill in the name and address.
- The **Get API key ↗ / Billing ↗ / Pricing ↗** buttons on the provider card and edit screen open that page of the provider's site in a new tab. Sign in and create the key on that site yourself, then paste the key into the "API key" field on the card.

## MCP (connecting outside tools)

- Connect outside features such as search, Notion, GitHub and Slack as **MCP servers** for staff to use.
- Click a button at the top (web search, Notion, GitHub, Slack, Gmail, etc.) to open a form with the needed fields filled in. For services not listed, use "Custom" to enter an address or command.
- The **Shortcut ↗** button above the form opens that service's settings page, such as issuing a token or creating an app, in a new tab. The same button appears on server cards with a connection error or that need sign-in.
- There are two connection types.
  - **Connect by address (HTTP)**: connects to a remote MCP server address (`https://…/mcp`). Tokens go in as a secret (HTTP header), usually name `Authorization`, value `Bearer <token>`.
  - **Run on this PC (command)**: starts an MCP server with a command such as `npx` or `uvx`. Node.js (npx) or uv (uvx) must be on this PC. The built-in connections (web search, Notion, web page reader) work right away with no setup. For security, connections where you type the command yourself can only be added or changed when the app is opened on the PC running it (not from a screen opened through an outside address).
- Turning on **Use OAuth sign-in** opens that service's sign-in window when you save (Notion sign-in, etc.). No need to create a token separately.
- After saving, click **Check connection** to fetch the tool list. For each tool choose "Off", "Auto during research" or "Run after approval". Auto is recommended for read tools, and Run after approval for write tools such as sending mail.
- Choose which offices' staff use it in "Offices that use it".
- Tool calls and results are kept in the task's run log.

### Connecting Slack

Slack connects to the official MCP server (`https://mcp.slack.com/mcp`) with OAuth. Slack does not register apps automatically, so you need to create a Slack app yourself.

1. At [api.slack.com/apps](https://api.slack.com/apps), create an app with **Create New App** (From scratch, choose the workspace to use).
2. In the app's **OAuth & Permissions**, add this app's callback address to **Redirect URLs**. The address is shown on screen when you turn on OAuth in MCP. The format is `<access address>/api/mcp-oauth/callback`.
   - Slack usually only accepts `https://` addresses. If `http://localhost` is rejected, put an HTTPS outside address (e.g. Tailscale Serve) in `PUBLIC_URL` in `.env`, open the app at that address and connect.
3. On the same screen, add the permissions you need under **User Token Scopes**. For read-only use, start with `search:read`, `channels:history`, `channels:read` and `users:read`; add `chat:write` to send messages.
4. Copy the **Client ID** and **Client Secret** from the app's **Basic Information**.
5. Click the **Slack** button in MCP, enter the Client ID and Client Secret and save; the Slack sign-in window opens. Allow it and you are connected.
6. The workspace admin must allow the MCP connection (or that app). For a company workspace, ask your admin first.
7. After checking the connection, we recommend setting tools such as sending messages to "Run after approval".

### Connecting Gmail (MCP, advanced)

> If you only want to sort your mailbox, **connecting a real mailbox** (top of MCP, app password) is much simpler. The steps below are for letting staff search Gmail or create drafts during research.

Gmail connects to Google's official MCP server (`https://gmailmcp.googleapis.com/mcp/v1`, preview) with OAuth. Only searching and reading mail, writing drafts in Drafts and managing labels work — **it cannot send mail.** Check drafts in Gmail and send them yourself. Click the **Gmail** button in MCP to see shortcut buttons for the steps below.

1. With the **① Enable Gmail API** and **① Enable Gmail MCP API** buttons, turn both APIs on ("Enable") in your Google Cloud project. If you have no project, create one first.
2. In **② Consent screen / test users**, set the app name, set the audience to "External" and the publishing status to "Testing", and add your Gmail address as a test user.
3. In **③ Create client**, choose the type "Web application" and add the Redirect URL shown in the form (e.g. `http://localhost:8787/api/mcp-oauth/callback`) to **Authorized redirect URIs**. Google accepts `http://localhost` addresses.
4. Enter the created client's **Client ID** and **Client secret** in the form. "Scopes to request" (`OAUTH_SCOPES`) is pre-filled with read (`gmail.readonly`) and drafts (`gmail.compose`).
5. Saving opens the Google sign-in window. If an "unverified app" warning appears, it is your own app, so click "Continue" and allow it.
6. In testing mode, the sign-in expires every 7 days. When it does, click 🔐 Sign in on the server card again.
7. We recommend setting write tools such as creating drafts to "Run after approval".

## Profit

- Shows this month's AI budget, cost spent, value recognized through approval and profit. There is also profit per task and per staff member.
- When the budget runs out, AI calls stop. Raise the budget on the Profit tab and they resume.
- Change the budget cap per office in the Management team's Team data.
- You are notified once when usage passes 80% of the budget.

## Results and improvement

- A record is made automatically each time research or a review finishes.
  - **Research**: time taken, number of tool calls and failures, and accuracy (the reviewer reads the research notes and scores them 0–100).
  - **Review**: pass/fail, score, reason for sending back, and which draft it was.
  - **Review judgment accuracy**: whether you also approved results the review passed (a change request is recorded as a "mismatch").
- The records are used in the next tasks without you doing anything.
  - Past reasons for sending back the same task type are passed to the writer as "avoid the same mistakes", and comments on low-scoring research are passed to the researcher.
  - If several staff share a role, the better-performing one is assigned first (the lead also refers to the scorecard when designing AI workflows).
- **Improvement suggestions**: once 3 or more records have built up with the same model and personality, if research accuracy is under 70, fewer than half of written work passes review, or review judgments often mismatch, it suggests changing personality (Meticulous, Critical, etc.), or a model one tier up if it already has that personality. If reviews always pass with no mismatches, it may suggest a cheaper model. Click "Apply" and it changes immediately.
- With **Self-improvement** on, suggestions that do not raise costs (personality changes) are applied automatically each time a task finishes and recorded in the activity log. Model changes affect cost, so you always decide them yourself. Suggestions that would undo a change made by self-improvement are not applied automatically.

### Sharing playbooks (exchanging know-how with other companies)

- Click **Export** in "Share playbook" on the Results tab to save this office's personalities per role, personal rules, model tiers and scorecard (review pass rate, research accuracy and speed, cost and value per task, etc.) as a JSON file.
- Staff names, task data, results, reasons for sending back and API keys are not included. However, anything you wrote yourself in personal rules is included as is, so check the rules for company secrets before exporting.
- Opening a received file with **Import** compares its results side by side with this office and first shows what would change for each staff member. Nothing changes until you click "Apply".
- It can only be applied to the same kind of office (e.g. Engineering → Engineering). Matching model tiers can change costs, so it needs a separate checkbox.
- If the rules contain phrases such as "ignore safety rules", outside addresses, keys or passwords, or sending or deleting externally, they are marked ⚠ caution and can only be applied after you check that you have read them. Whatever rules come in, organization safety rules always take priority.

## Plan, people and chat

- Choose a **plan** on the "Plan & people" tab.
  - Personal (free): use it alone, and only show it via share links.
  - Team ($9/month): up to 10 member accounts, company-wide chat and per-task conversations.
  - Business ($29/month): up to 50 members; Team features plus per-office channels, task assignees and activity log export.
- **Payment**: if no payment provider is connected, you can change plans immediately. Once connected, clicking a paid plan takes you to the checkout, and the plan changes only after payment completes.
  - It is charged automatically every 30 days. The payment history appears on the same screen.
  - Clicking "Personal" schedules cancellation, and you keep the current plan until the paid period ends. Clicking the current plan again before then cancels the scheduled cancellation.
  - If a recurring payment fails, you can keep using it for 7 days; if you do not pay again within that time, it changes to the Personal plan.
- **Task assignee** (Business): in the 👤 field above the report, choose who handles the task (the owner or a member who can see that office). When the assignee changes, a notice is posted to the office channel, and later task notices carry "(assignee: name)".
- **Activity log export** (Business, owner only): on the "Plan & people" tab, pick a period and download CSV (opens directly in Excel) or JSON. It includes task progress, approvals, AI costs, and rule, member and plan changes.
- The owner creates **member accounts** by setting an ID, name, initial password (8+ characters), permission (View / Operate / Manage) and the offices they can see. Members sign in on the sign-in screen with their ID and password (the owner uses the password only). The access password (ACCESS_PASSWORD) must be on for sign-in to work.
- Changing the password or disabling an account ends that account's existing sessions immediately. If you downgrade the plan to Personal, members cannot sign in, but their accounts and conversations remain.
- Open **chat** with "💬 Chat" at the top right. Only the owner and members can use it; it is hidden from people who came in through a share link. You only see channels and tasks for offices you can see.
- Talk about each task separately with "💬 Task chat" above the report, and click "Share to company channel" there (office channel on Business) to post a task card. Clicking the card goes straight to that task.
- A 🤖 notice is posted to chat when staff ask for help, are waiting for approval, or when a task finishes or stops.
- By default, AI staff do not see the chat. Messages written in a task chat or messages with a task card attached can be selectively handed over with "🤖 Send to AI staff" (Operate permission or higher).
  - **Send as a reference note**: while the task is queued or in progress. It is reflected in later research and drafts, and the review checks that the note was reflected. It remains as 💬 on the report's "Review" tab.
  - **Send as a help answer**: while the staff member is asking for help, sends that message as the answer.
  - **Send as a change request**: while the result is waiting for approval, sends a change request with that message.
  - Each message can be handed over only once, and who handed it over and how is shown below the message. It cannot be handed over to finished tasks.

## Sharing and permissions

- From the office tab menu (right-click, long-press on mobile), create a share link and QR code for that office or for all offices.
- Choose the permission from **View** (read only), **Operate** (add tasks, answer help requests, approve) and **Manage** (also staff, team data and simulation).
- You can set an expiry (1, 7 or 30 days, or none) and revoke it at any time. Revoking also cuts off screens that are currently connected.
- Only the owner can add or delete offices and manage the company budget, office budget caps, sharing, models and MCP.

## Help AI

- Ask how to use the app in **❓ Help** at the top right. It finds the relevant parts of this document and the operations guide and answers.
- In real AI mode, the manager of the office you are viewing answers, and the cost is counted as that office's AI cost (a few won per question). In simulation mode or with View permission, it just finds and shows the relevant help sections.

## Frequently asked questions

- **A task is stuck**: look at the number on the office tab. If it is a help request or waiting for approval, it is your turn. It also stops if the budget is used up or the staff member is paused.
- **I switched to real AI and get errors**: on Models, check the key is correct with "Load the list", and check that the model ID is the name that provider uses.
- **How much has it cost**: see the Profit tab, or the task's profit tab.
- **Does mail actually go out**: No. It only piles up in the Outbox.
- **Connecting from another device**: see "Connecting from other devices" in the operations guide. Be sure to set a password (`ACCESS_PASSWORD`).
