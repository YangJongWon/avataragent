# Game-style AI agent office — product plan

[한국어](AI_AGENT_OFFICE_PRODUCT_PLAN.md) | English | [日本語](AI_AGENT_OFFICE_PRODUCT_PLAN.ja.md) | [简体中文](AI_AGENT_OFFICE_PRODUCT_PLAN.zh-CN.md)

Written: 2026-10-03  
Document status: initial product plan

## 1. Product overview

This product is an AI organization service for non-developers that shows several AI agents collaborating as a cute pixel-art office.

Users create an office per project, hire AI staff with roles, and post tasks on a shared board. The AI staff research, analyze, write documents and review them following the actual order of the work. You can watch tasks and outputs move between staff through character animation and a visual flowchart.

The report panel on the right shows intermediate outputs, review comments, the final report, costs and the run log in real time.

### Core value of the product

1. You can understand who is doing what within 3 seconds.
2. You can see visually in what order the work proceeds.
3. You can manage which rules and materials each agent used.
4. Users can step in like in a game and control permissions, cost and quality.
5. Even users unfamiliar with AI can use multiple agents as if running an organization.
6. You can see how much value the AI budget you paid for created, like a company's profit.

## 2. Market and similar services

Game-style or visual AI agent offices are already appearing, but there is not yet a clear, complete work service that has all of the following.

- An office per project
- Real work executed by characters
- A shared board
- Rule documents per agent
- An editable task flowchart
- Review and rejection loops
- A real-time report panel on the right
- Controls designed for non-developers

Main reference services:

| Service | What to learn from | Limits or differentiation opportunity |
|---|---|---|
| Agent HQ | 2D office, hiring staff, delegating to managers, passing tasks | Limited shared-board and report-centered work operation |
| TaskVille | Roles, desks, status, schedules, real outputs | In beta, limited screen customization |
| Agent Desk | Behavior rules, memory, task assignment, cost tracking | Relatively weak game-style space and character expression |
| Pixel Agents | Pixel office, character status, space editing | Mainly a visualization tool for coding agents |
| AgentOffice demo | 3D office, rework on review failure | A hackathon project; production readiness needs separate verification |

Reference links:

- Agent HQ: https://game.swarms.world/landing.html
- TaskVille: https://taskville.co/virtual-office-ai-agents/
- Agent Desk: https://www.agentdesk.work/
- Pixel Agents: https://github.com/pixel-agents-hq/pixel-agents
- AgentOffice: https://2026.quackhacks.org/projects/agentoffice

## 3. Core user experience

### 3.1 Project offices

One office means one project.

Examples:

- Japan market research room
- Blog content production room
- New service development room
- Customer inquiry room

Offices are switched with the project tabs at the top, and each office has its own goals, staff, rules, materials, task flowchart and reports.

### 3.2 Hiring AI staff

The `Hire staff` tab sets the following.

- Name
- Role
- Appearance and role hat
- AI provider and model to use
- Basic behavior rules
- Project-specific rules
- Tools they can use
- Forbidden actions
- Budget per task or per month
- Actions that need user approval
- The project office to place them in

When hiring is done, the character walks in through the office door and sits at their assigned desk.

### 3.3 Showing character roles

Above each character's head are their name, role and current status. Hats are a visual device for telling roles apart quickly.

| Role | Example |
|---|---|
| Manager | Fedora or necktie |
| Researcher | Detective hat and magnifying glass |
| Analyst | Glasses or mortarboard |
| Writer | Beret and pen |
| Reviewer | Red pen or inspector's cap |

Character appearance is managed as a `skin`, separate from role and status logic. The look can change while keeping the same role markers and status expressions, and an anime-girl skin pack is planned later (3.10).

### 3.4 Clicking a character

Left-clicking a character shows its current status in a pixel speech bubble.

Examples:

- "I'm comparing 12 sources on market size."
- "The source dates are old, so I'm looking for newer material."
- "I've passed the draft to the reviewer."
- "I'm waiting for user approval."
- "The comparison criteria can be read two ways, so I'm a bit stuck. Which way should I go?"

The model's private internal reasoning is never exposed as is. Only the current action, the tool in use, progress and the next step are safely summarized. Bubble text is built from execution event templates without extra AI calls (Appendix C).

### 3.5 Right-clicking a character

The right-click menu offers:

- Chat
- Help (highlighted when stuck, 3.9)
- Give a new task
- View current task
- View rules
- Add a rule
- Change a rule
- Delete a rule
- Pass reference material
- Hand the task over to another staff member
- Pause
- Send home

When rules are changed through chat, the scope is confirmed.

Example:

> User: From now on, attach the source and year to every statistic.  
> Agent: Should this rule apply to all projects, or only the current project?

The before and after are shown, and the rule is applied only after the user approves.

### 3.6 Clocking in and out, work schedules

Each AI staff member has working hours and capacity. Per staff member or team, you set clock-in and clock-out times, work days, time zone, breaks, maximum concurrent tasks, cost limits, whether after-hours calls are allowed, and a substitute when absent.

At clock-in time the character walks in through the office door; at clock-out time it saves progress or hands over to the next shift and leaves. During breaks it moves to the lounge or coffee area.

AI does not need rest like people do, but these schedules are used for cost control, respecting external systems' hours, preventing automatic runs at night, and setting focused work time.

### 3.7 Idle staff detection and automatic reassignment

AI staff with no work are shown as `Idle`. A coffee icon appears above their head, and clicking shows the last completion time, idle time, tasks they can handle, skills, estimated cost and other staff's queues.

Automatic assignment comes in three levels.

1. Manual: the user assigns tasks directly.
2. Suggested: the system suggests a suitable idle staff member and the user approves.
3. Automatic: the manager agent assigns within the bounds of role, permissions, budget and security level.

If work piles up on one staff member, a bottleneck warning appears with a suggestion to split or reassign the work to idle staff with the same role.

### 3.8 Game-style condition and emotional expression

We do not let people mistake the AI for having real emotions. The `stress` on screen is not a measure of emotion but an operational load indicator combining workload, complexity, failures, rework, waiting time and budget pressure. The user screen calls it `condition` or `work stress` in a friendly way, and the detail screen shows how it is calculated.

#### Work stress levels

| Level | Example basis | Character expression |
|---|---|---|
| Relaxed | No queue and no errors | Smile, relaxed posture |
| Normal | 1–2 tasks in progress | Focused default face |
| Busy | Growing queue or deadline near | A drop of sweat, fast typing |
| Overloaded | Repeated rework, rising errors, budget/time pressure | Red face, twitching eyebrows, smoke above head |
| Stuck | Instructions vague or rules conflict; can proceed but with low confidence | Drooping eyebrows, scratching cheek, question mark and a little sweat above head |
| Blocked | Cannot proceed without permission, material or user approval | Flustered face and a big exclamation mark |

`Stuck` and `Blocked` are distinct. Blocked means no further progress is possible; stuck means progress is possible, but a little help from the user would improve the result a lot.

The overloaded state is not just decoration. Clicking the character explains the cause and suggests splitting the work, changing the model, adding staff, adjusting priorities or user intervention.

#### Showing workload

- 0 queued tasks: a clean desk
- 1–2 queued tasks: a thin stack of papers
- 3–5 queued tasks: a tall pile of papers
- Includes urgent work: a red folder on top
- Waiting for approval: a document with a blue stamp
- Rejected work: a document with a red stamp
- Finished work: a green folder moves to the report tray

The height of the paper pile is calculated from the number of `work units` and the estimated effort, not the actual document size. The displayable height is capped so the screen is not blocked.

#### Showing task difficulty

When doing hard work, a short thinking animation appears above the character's head.

- Analysis/calculation: `∑`, `√`, `%`, a small chart
- Complex logic: puzzle pieces and gears
- Searching for material: a magnifying glass and question mark
- Writing: a pencil and a blinking sentence
- Review: check marks, a magnifying glass and red underlines
- Fixing errors: lightning, tools and a warning triangle

Symbols are shown according to the actual work type and events, not scattered randomly as decoration.

#### Behavior by idle time

| Continuous idle time | Behavior |
|---:|---|
| 0–2 min | Tidying the desk, stretching |
| 2–5 min | Drinking coffee or tea |
| 5–10 min | Moving to the lounge, brief chat with other idle staff |
| 10+ min | A mini game, tending plants, reading or looking out the window |

Idle animations never trigger real model calls. They are local animations that run only on screen, so they cost nothing. When a new task comes in, they stop immediately and return to their seats.

#### Game-style feedback

- Small stars and a stamp effect when a task is done
- A sparkling green badge on passing review the first time
- A tool badge for fixing errors in a row
- A team celebration when a project is finished
- The office clock and lighting change gently as a deadline nears
- The view outside the window and desk lamps change during night work
- Waving or nodding when the user clicks a character

Points and badges are only supplementary feedback so they do not distort work quality. They reward accuracy, passing review, staying within budget and source quality, not just finishing fast.

### 3.9 Stuck faces and helping

When instructions are hard or ambiguous, the character makes a troubled face so the user can come over and help. The goal is to turn the user's feeling of "I want to help" into actions that actually improve result quality (clarifying instructions, providing material).

#### When a character becomes stuck

The stuck face is shown only when there is a real signal, never staged randomly.

| Signal | Example |
|---|---|
| Agent asks for clarification | The model reports `needs_clarification` and a list of questions in structured output |
| Missing instructions | A required item among goal, scope, output format or deadline is empty |
| Rule conflict | Project rules and personal rules demand different formats |
| Repeated rejection | The same task is rejected at review 2 or more times |
| Lack of material | Needed sources could not be found, but it can proceed on estimates |

#### Expression levels

| Level | Character expression | Bubble example |
|---|---|---|
| Slightly stuck | Head tilt, small question mark | "Is it okay if I understand this part this way?" |
| Stuck | Drooping eyebrows, scratching cheek, a little sweat | "There are two criteria, so it's hard to choose." |
| Very stuck | Holding papers and looking toward the user, raising a hand | "With a little help I could do this much better." |

#### Helping actions

Clicking the character or choosing `Help` in the right-click menu shows what is hard along with these options.

- Answer the question: pick one of the option buttons the agent offers, or answer briefly.
- Give an example or reference: pass an example of the desired result, a file or a link.
- Break the task down: split a hard task into smaller steps and reassign.
- Set the criteria: decide which of the conflicting rules to follow, and save it as a rule if needed.
- Add a colleague: assign another staff member to work together.
- Let them carry on: confirm the assumption the agent proposed and let it proceed.

After getting help, the character brightens, bows in thanks and goes back to work. The profit card records the rework count and cost change of `helped tasks`, showing whether helping actually increased profit.

#### Operating principles

- The detail screen states that the stuck face is a signal about instruction clarity, not an AI emotion.
- Questions about the same task are bundled together and not raised repeatedly in a short time.
- If the user does not respond, after a set time it proceeds with the proposed assumption or changes to `Blocked`. The response deadline is configurable.
- No guilt-inducing wording, exaggerated crying faces, or staging that pushes extra payment or usage.
- The intensity of stuck expressions can be reduced or turned off in settings.

### 3.10 Character skins and an anime-girl version (planned)

Appearance is separated out as skins, and an anime-girl skin pack is added at a later stage alongside the default pixel staff skin. Even before release, the skin picker on the hiring screen shows an `Anime Girl (coming soon)` slot with a preview silhouette, and the landing page and roadmap list it as a planned feature.

#### Skin structure

- Skins change only the image set, not role, status or animation logic.
- Every skin must follow the same frame specs, animation list (section 7) and expression set.
- Required expression set: default, smile, focused, sweat, overloaded, stuck, flustered, thankful, celebrating
- Roles can be shown with role-specific outfits and props instead of hats (e.g. researcher in a detective coat with a magnifying glass, writer with a beret and pen, reviewer with glasses and a red pen).
- Skins can be chosen for a whole office or per staff member.

#### Anime-girl skin policy

- All characters are set as adult staff.
- No excessive exposure or suggestive staging. The focus is on cuteness and facial acting.
- Stuck and thankful expressions are crafted carefully as the core appeal of the anime-girl skin, while following the operating principles of 3.9 just the same.
- A `Switch to default skin now` button is provided for screen sharing or use at work.
- Designs are original, not imitating particular anime or game characters (section 15).

#### Production considerations

- The number of drawings grows with the expression set and animations, so the production effort per skin is estimated in advance, starting with one set for 4 staff.
- When working with outside illustrators, rights to commercial use, modification and derivative use are stated in the contract.

## 4. Main screen layout

```text
┌ Project tabs ────────────────────────────────────────────────────┐
│ Market research │ Content │ Development │ + New office           │
├────────────────────────────────────┬─────────────────────────────┤
│                                    │ Report                      │
│   ┌──── Shared board ────────┐     │                             │
│   │ Goal: Japan market study │     │ Final report                │
│   │ Progress: 3/5            │     │ Intermediate outputs        │
│   │ Awaiting approval: 1     │     │ Review comments             │
│   └──────────────────────────┘     │ Sources                     │
│                                    │ Cost & time                 │
│  🎩 Researcher   👒 Analyst          │ Run log                     │
│  [Searching]     [Analyzing]       │                             │
│                                    │ [Approve] [Revise] [Export] │
│  🧢 Writer  ───▶ 🎓 Reviewer        │                             │
│  [Drafting]      [Checking]        │                             │
├────────────────────────────────────┴─────────────────────────────┤
│ Workflow: intake → research → analysis → write → review → approve → done │
└──────────────────────────────────────────────────────────────────┘
```

### Top tabs

- Project office
- Hire staff
- Task board
- Workflow design
- Report archive
- Cost & activity
- Profit & settlement
- Work & efficiency
- Settings

## 5. Shared board and passing tasks

The shared board shows:

- Project goal
- Current tasks
- Priority
- Due date
- Assignee
- Progress
- Tasks waiting for approval
- Failed or rejected tasks

When a task is added, a pixel sticky note goes up on the board. The manager takes the note and carries it to the assignee. When a task moves to the next step, documents or bundles of material actually move between characters.

## 6. Visual task flowchart

### 6.1 Basic flow

```text
📌 Task intake
     ↓
🔍 Research
     ↓
📊 Analysis
     ↓
✍️ Report writing
     ↓
🧐 Quality review
   ├─ Pass ──▶ 🙋 User approval ──▶ ✅ Done
   └─ Reject ─▶ ✍️ Revise
```

### 6.2 Status colors

| Status | Visual |
|---|---|
| Waiting | Gray |
| Working | Blinking yellow |
| Done | Green check |
| Error | Red |
| Waiting for approval | Blue exclamation mark |
| Rejected/rework | Red dashed arrow |

### 6.3 Flowchart editing features

- Drag and drop blocks
- Assign agents to blocks
- Set execution order with connecting lines
- Conditional branches
- Parallel execution
- User approval steps
- Going back on review failure
- Maximum retry count
- Time limits
- Project budget cap

### 6.4 Syncing the office and the flowchart

The office and the flowchart use the same task data.

- Changing the assignee in the flowchart moves the document to the new assignee in the office.
- Handing a task to another staff member in the office changes the assignee in the flowchart.
- Selecting the current node in the flowchart opens that step's result on the right.
- Rejecting at a review node makes the character stamp the document red and return it to the writer.

## 7. Character animation

The basic motions needed in the first version are:

- Idle
- Walking
- Sitting
- Typing
- Reading
- Talking
- Carrying papers
- Searching for material
- Inspecting
- Stamping
- Waiting for approval
- Stuck (head tilt, scratching cheek, raising a hand)
- Bowing in thanks
- Flustered
- Celebrating completion

Real execution events must be tied to animations. They are not played arbitrarily as decoration.

| Execution event | On screen |
|---|---|
| Task assigned | Papers move to the assignee |
| Web search starts | Moves to the computer or bookshelf |
| Output created | A document appears on the desk |
| Task handed off | Document passed to the next assignee |
| Review starts | Inspects with glasses and a red pen |
| Review rejected | Red stamp, then document returned |
| Approval requested | Blue exclamation mark above head |
| Help requested | Troubled face, question mark, raising a hand toward the user |
| Help received | Face brightens, bows in thanks, resumes work |
| Task completed | Report moves to the archive |

## 8. Report panel

The report panel on the right shows task results in real time.

### What it shows

- Intermediate output of the current step
- Final report
- Review comments and score
- Sources used
- Writer and reviewer
- Run time
- Model and token usage
- Estimated and actual cost (API and subscription allocation shown separately)
- Output value estimated by the system and recognized value
- Profit per task and return on investment (ROI)
- Error and retry history
- Utilization and idle time per staff member
- Task waiting time and bottlenecks

### User actions

- Approve (including checking and editing the estimated value)
- Request changes
- Send back to a particular agent
- Compare versions
- Export Markdown
- Export PDF
- Share link

The report body uses a regular, readable font. Pixel design is applied to borders, buttons, stamps, icons and entrance effects.

## 9. Agent rule system

Rules are separated into four levels.

1. Organization rules: apply to all AI staff
2. Job rules: apply per role, such as researcher, writer or reviewer
3. Project rules: apply only to the current office
4. Personal rules: apply only to a specific staff member (including the basic behavior rules set when hiring)

When rules conflict, the more specific rule wins. Priority is `personal > project > job > organization`.

However, organization rules marked as `safety rules` (actions needing approval in section 14, forbidden actions, budget caps, handling of secrets) cannot be overridden by lower rules. If a conflict is detected, a warning is shown when saving the rule, and the safety rule is followed at run time.

Every rule change keeps a history and can be restored to a previous version.

Each agent's rule document includes:

- Role and goal
- Tone and output format
- Quality criteria
- Materials and tools available
- Forbidden actions
- Actions needing approval
- Handoff conditions
- Completion conditions
- Maximum repeat count

### 9.1 Staff status system

| Status | Meaning | On screen |
|---|---|---|
| Not in yet | Before work starts | Empty desk and faded name tag |
| Arriving | Moving to the office | Walking from the door to the desk |
| Waiting | Waiting for scheduled work or a preceding step | Waiting at the desk |
| Working | Running a task | Role-specific work animation |
| Collaborating | Passing work or in a meeting | Moving to the meeting area |
| Waiting for approval | Needs the user's judgment | Blue exclamation mark |
| Needs help | Instructions are vague and the user's help would be good (can still proceed) | Troubled face and question mark above head |
| Idle | No work to take | Coffee icon and moving to the break area |
| On break | Scheduled break time | Lounge animation |
| Error | Cannot continue | Red warning icon |
| Off duty | Not current working hours | Moving out of the office |

`Waiting` and `Idle` are distinct. Waiting means waiting for preceding work, material or approval; idle means there is no work to take and real spare capacity exists.

### 9.2 Efficiency metrics

The `Work & efficiency` tab provides the following metrics.

Core metrics (linked to profit in section 10):

- Profit and return on investment (ROI) per staff member and per project
- Average cost and average recognized value per task
- First-time review pass rate and rework rate (rework directly cuts profit)
- Loss-making task types and causes of losses

Supplementary metrics:

- Average processing time
- Idle time and task waiting time
- Bottleneck steps and the longest queue
- Utilization per staff member
- Actual completions versus scheduled work

Utilization itself is not to be raised unconditionally. Creating unnecessary work to run AI only increases cost, so the default optimization goal is `increasing profit while meeting quality criteria` — reducing waiting time and cost and increasing approved outputs.

The work stress metric normalizes each factor to the 0–1 range, then takes a weighted average on a 0–100 scale.

```text
Work stress = 100 x (w1 x queue load + w2 x deadline pressure + w3 x error frequency
                   + w4 x rework count + w5 x context usage + w6 x blocked time)
              / (w1 + w2 + w3 + w4 + w5 + w6)

Each factor = min(measured value / reference value, 1)
e.g. queue load = min(queued tasks / 5, 1)
```

Operators must be able to see and adjust each factor's reference value and weight. The help states that this value is not an AI emotion but a number visualizing system state in an easy-to-understand way.

Examples of automatic efficiency rules:

```text
If the analyst's queue is 3 or more and the assistant analyst is idle
→ distribute work to the assistant analyst, starting with the lowest security level

If the reviewer's expected waiting time exceeds 30 minutes
→ suggest a substitute who can review

If 80% of the project budget is used
→ stop automatic assignment and ask for user approval

If work is not expected to finish 10 minutes before clock-out
→ save a checkpoint and hand over to the next shift
```

### 9.3 Security levels

Tasks and materials get one of three security levels. Automatic assignment and task splitting only target tasks at or below the staff member's allowed level.

| Level | Example | Handling conditions |
|---|---|---|
| Public | Researching public web material, general writing | Any staff and model can handle |
| Internal | Internal project documents, unannounced plans | Only permitted staff; approval for external transfer |
| Sensitive | Personal data, contracts, finances, secrets | Only designated staff and models (e.g. local models); no automatic assignment |

## 10. AI budget and virtual profit and loss

This product is not a service sold to others but a tool for running the AI budget the user has already paid for. Each office is treated like a company: AI usage fees are costs and the value of approved outputs is revenue, from which profit is shown.

| Company concept | Meaning in the product |
|---|---|
| Capital | This month's AI budget (API top-ups + flat subscription fees) |
| Cost | AI staff's actual usage fees (staff salaries) |
| Revenue | Value of outputs the user approved |
| Profit | Revenue − cost |

```text
API usage cost ──────┐
                     ├─▶ Total cost ──────────────┐
Subscription share ──┘                            ▼
                                       Profit = revenue − cost
Labor-cost value → review score adj. → user rating adj. → recognized revenue ─┘
```

### 10.1 Calculating cost

Pay-as-you-go APIs and flat subscriptions can be used together.

- **Pay-as-you-go API**: each call records the actual cost as `input tokens x input price + output tokens x output price`. The model price table is managed in settings and, where possible, periodically reconciled with the provider's usage reporting.
- **Flat subscription**: the monthly fee is allocated to tasks according to the share of the usage limit consumed.

```text
Task allocated cost = monthly fee x (task's limit usage / monthly usage limit)
```

- Subscription limit consumption is shown separately from cost as a `work capacity` gauge. When the limit runs out, staff using that subscription become `Blocked`, and the user is asked whether to substitute API staff.
- Both costs are summed in won and shown as the company balance. Foreign-currency prices are converted at the configured exchange rate.

**Risk**: most flat subscriptions do not allow external programs to call them directly. For subscription budgets, consider connecting through official CLI agents (Claude Code, Codex CLI, Gemini CLI, etc.), and check each service's terms of use before connecting. Subscriptions not permitted by the terms are registered for cost recording only.

### 10.2 Calculating revenue (value)

Based on the labor cost of a person doing the same work, adjusted by review score and user rating.

```text
Recognized value = base value x quality adjustment x user rating adjustment
Base value = standard hours per task type x hourly rate set by the user
```

| Factor | How it is calculated | Example |
|---|---|---|
| Base value | Standard hours per task type x hourly rate | Market research 3 hours x ₩30,000 = ₩90,000 |
| Quality adjustment | Review score, first-time review pass, source quality | 0.7–1.2x |
| User rating adjustment | How it was approved | Approved as is 100%, approved after changes 70%, discarded 0% |

Principles:

- Value is recognized only when the user approves. Rejected, retried and discarded work only accumulates cost.
- Users can adjust standard hours and hourly rates per task type. Defaults are provided as templates.
- The approval screen shows the system's estimated value, and the user can edit the amount directly. The edit history is used to calibrate later estimates.
- The help states that value estimates are reference indicators, not real accounting figures.

### 10.3 Profit aggregation and game-style presentation

- Cost, recognized value, profit and return on investment (ROI) are aggregated per task, staff member, project and month.
- A safe sits in a corner of the office showing the balance. When a task is approved, coins go into the safe; on model calls, a small cost indicator leaves the staff member's desk.
- Staff profit card: clicking a staff member shows this month's cost, the value they earned, profit and first-time review pass rate.
- Month-end settlement screen: summarizes surplus or deficit, the most profitable task type, loss-making task types and the remaining budget.
- At 80% of the budget, it warns and stops automatic assignment. For task types with repeated losses, it suggests a cheaper model, adjusting review criteria, or having a person do the work.

### 10.4 Data and events

| Data | Main fields |
|---|---|
| `BudgetPeriod` | Period, API budget, subscription list, exchange rate, warning thresholds |
| `CostRecord` | Task, staff, source (`api` or `subscription`), model, tokens or limit usage, cost in won |
| `ValueRecord` | Task, base value, quality adjustment, user rating adjustment, recognized value, whether the user edited it |
| `RateTable` | Task type, standard hours, hourly rate, quality adjustment range |

Additional events:

```text
cost.recorded
value.recognized
budget.period_reset
subscription.limit_warning
```

## 11. Recommended technology

| Area | Recommended tool | Purpose |
|---|---|---|
| Web UI | React + TypeScript | Tabs, menus, reports and the overall screen |
| Pixel office | PixiJS | Characters, furniture, speech bubbles and animation |
| Task flowchart | React Flow | Nodes, connectors, branches and parallel flows |
| Real-time communication | WebSocket | Syncing execution state and the screen |
| Task execution | LangGraph or own state machine | Sequential, parallel, review, rejection and approval |
| Model connection | Common model adapter | Swapping OpenAI, Anthropic, Gemini and local models |
| External tools | MCP | Connecting search, Drive, Notion, Slack, etc. |
| Database | PostgreSQL | Projects, rules, tasks, results and costs |
| Job queue | Redis + BullMQ | Long-running jobs, retries and scheduled runs |
| Scheduler | BullMQ repeatable jobs or Temporal | Clock-in/out, scheduled tasks and safe resumption |
| File storage | S3-compatible storage | Reports, images and attachments |
| Report editing | TipTap or Markdown | Real-time report editing and output |
| Authentication | Auth.js or Clerk | Sign-in and user permissions |
| Execution tracing | Langfuse + OpenTelemetry | Model calls, costs, errors and execution flow |
| Testing | Vitest + Playwright | Automated logic and UI tests |
| Pixel design | Aseprite | Characters, hats, furniture and animation |
| Office map | Tiled | Tilemap editing |
| UI design | Figma | Screen design and design system |

References:

- PixiJS: https://pixijs.download/dev/docs/rendering.html
- React Flow: https://reactflow.dev/index
- LangGraph Human-in-the-loop: https://github.com/langchain-ai/langgraphjs/blob/main/docs/docs/agents/human-in-the-loop.md
- MCP overview: https://modelcontextprotocol.io/specification/draft/server/index

## 12. System architecture

```text
React user interface
 ├─ PixiJS office
 ├─ React Flow task flowchart
 └─ Report and settings panels
              ↓ WebSocket / API
Task orchestrator
 ├─ Manager agent
 ├─ Research agent
 ├─ Analysis agent
 ├─ Writing agent
 └─ Review agent
              ↓
Model adapters and MCP tools
 ├─ OpenAI
 ├─ Anthropic
 ├─ Gemini
 ├─ Local models
 └─ Search, documents, external services
              ↓
Cost and value ledger (CostRecord, ValueRecord)
              ↓
PostgreSQL / Redis / file storage / execution tracing
```

The MVP starts with just PostgreSQL, an in-house state machine and WebSocket. Redis, BullMQ, Temporal, Langfuse and S3-compatible storage come in at the beta stage when long-running jobs and scheduled runs are needed. While there is only one executor, the Workflow Compiler stays a simple conversion function.

The on-screen flowchart is not coupled directly to any particular execution framework. A common Workflow JSON is created and converted to fit each executor.

```text
Common Workflow JSON
         ↓
Workflow Compiler
 ├─ LangGraph executor
 ├─ Simple sequential executor
 └─ Future executors
```

## 13. Core event model

Every executor sends events in a common format.

```text
agent.hired
agent.clocked_in
agent.clocked_out
agent.idle_started
agent.idle_ended
agent.break_started
agent.break_ended
agent.load_changed
agent.leisure_started
agent.leisure_ended
agent.status_changed
task.created
task.assigned
task.started
tool.started
tool.completed
artifact.created
task.handed_off
review.started
review.rejected
review.approved
approval.requested
task.completed
task.failed
task.reassigned
task.paused
task.resumed
task.cancelled
approval.granted
approval.denied
rule.changed
tool.failed
artifact.updated
schedule.triggered
budget.threshold_reached
budget.exceeded
budget.period_reset
cost.recorded
value.recognized
subscription.limit_warning
agent.fired
agent.help_requested
agent.help_received
agent.help_timed_out
```

The common fields and delivery rules of all events follow Appendix A.

These events update the office animation, flowchart state, report panel and activity log at the same time.

## 14. Security and user approval

The following actions require user approval by default.

- Sending email and messages
- Public posting
- Deleting files
- Changing databases
- Payments or purchases
- Changing accounts and permissions
- Passing personal data to external systems

Additional principles:

- Separate tool permissions per agent
- Data isolation per project
- Keep run logs and change history
- Encrypt secrets
- Cost caps and repeat limits
- Defend against prompt injection in external content
- Explicit confirmation before running risky tools
- No automatic infinite retries of failed work

## 15. Copyright and design asset policy

Pixel Agents' program code is published under the MIT license, so commercial use, modification and distribution are allowed, as long as the copyright notice and license text are kept.

Code licenses and image asset licenses are reviewed separately. For the commercial product, the basic principle is not to copy the repository's character and furniture images as is, but to create original pixel assets.

### Recommended policy

- Use rendering and state management ideas within the scope of open source licenses
- Create characters, hats, furniture and UI icons from scratch
- Keep production source files and work history
- Use only CC0 or clearly commercially licensed external assets
- Check whether purchased assets may be redistributed in SaaS
- Do not directly imitate famous game and anime characters
- Create all skins, including the anime-girl skin, as original designs, and when outsourcing, state rights to commercial use, modification and derivative use in the contract
- For assets made with AI image generation tools, check the tool's commercial use terms and keep generation records
- Provide an open source notices page in the product
- Automatically check the list of third-party licenses before release

Pixel Agents license: https://github.com/pixel-agents-hq/pixel-agents/blob/main/LICENSE

## 16. MVP scope

The first real product focuses on one office and one complete workflow. The key question to validate is "Can I see AI work with my own eyes, control it, and check whether it makes a profit relative to my budget?"

### Included

1. One project office
2. Four characters: manager, researcher, writer, reviewer
3. Hiring staff and setting roles
4. Creating tasks on the shared board
5. Speech bubbles on clicking agents (based on event templates)
6. Right-click chat and rule editing
7. Visual task flowchart
8. Document handoff animation
9. Review pass and rejection loop
10. Real-time report on the right
11. User approval
12. Cost and run log
13. Markdown or PDF export
14. API usage cost records and monthly budget balance
15. Labor-cost value and value recognition on approval
16. Basic profit per task and per staff member
17. Stuck faces, question bubbles and helping when instructions are vague (answering options, passing material, carry on)
18. A character structure with appearance separated as skins, and an `Anime Girl (coming soon)` slot on the hiring screen

### Moved to beta

- Linking flat subscription budgets and allocating limits
- Clock-in/out schedules per staff member and shift handovers
- Idle staff display and task reassignment suggestions
- Utilization and waiting time analysis
- Paper piles and expressions that change with workload
- Coffee, break and mini-game animations by idle time
- Month-end settlement screen

### Excluded or lower priority

- Mobile app
- 3D graphics
- Voice conversation
- Many external service integrations
- Public agent marketplace
- Complex real-time multi-user collaboration
- A character editor where users draw their own
- Actually producing the anime-girl skin pack (stage 4 and later)
- Fully automatic staffing changes and advanced optimization

## 17. Development plan by stage

### Stage 1: UX prototype

Duration: 1–2 weeks

- Basic office screen
- Character selection and speech bubbles
- Right-click menu
- Task flowchart
- Report panel
- Simulated events instead of real AI
- Game-style status effects by workload, difficulty and idle time

### Stage 2: Working MVP

Duration: 6–10 weeks

- Real AI model connections
- Research → write → review flow
- Rule editing
- User approval
- Saving reports
- Cost tracking
- Handling failures and retries
- API cost records, labor-cost value and basic profit

### Stage 3: Private beta

Duration: 3–4 months

- Multiple offices per project
- Linking flat subscription budgets and allocating limits
- Month-end settlement screen and value estimate calibration
- Clock-in/out schedules, idle detection and task reassignment suggestions
- Paper piles, expressions and idle animations by workload
- Sign-in and per-user storage
- Model selection
- MCP external tool connections
- Scheduled tasks
- Operations monitoring
- Stronger security
- Bottleneck analysis and automatic task distribution
- Shift work and handovers by time zone

### Stage 4: Expansion

Duration: 5–8 months

Expansion targets a tool that individuals or small teams run with their own AI budget, not external sales.

- Unified budget management across several AI providers and subscriptions
- Inviting team members and per-office permissions
- Audit logs and exporting profit history
- Sharing standard-hours and hourly-rate templates per task type
- Personal data retention policy and backups
- Execution infrastructure for long-running and bulk jobs
- Producing and releasing the anime-girl skin pack (one set for 4 staff, including the full expression set)
- Refining stuck and thankful expressions, and per-skin speech bubble tone

### Paid team feature: shared project lounge

The Team and Business plans provide a shared seminar room that shows work across several offices as one result. Instead of only a numeric progress bar, a model fitting the project's nature is assembled as task steps are completed.

| Project nature | Default progress model |
|---|---|
| Software/technology | Spaceship, machine, circuit blueprint |
| Organization/hiring | Team house, campus |
| Management/strategy | Headquarters building, city model |
| Customer support/operations | Support ship, control center |
| Welfare/culture | Garden, community space |

- Overall progress is calculated as `Σ(milestone weight × milestone task completion rate)`. Milestone weights are a fixed denominator, so simply adding tasks does not hide the overall scope.
- Tasks not linked to a milestone are excluded from progress and flagged as `unclassified tasks`. Model parts are not completed arbitrarily before the user links them.
- Completed tasks count as 100%, tasks in progress as their share of completed steps, and waiting or failed tasks as 0%.
- Each model part is linked to a milestone or a group of tasks.
- Members see their assigned tasks, the part they are currently building, their completed count and their share of all completed steps.
- Contribution is shown as an indicator explaining assignment gaps and collaboration status, not as a performance review or ranking.
- The Personal plan gets a read-only preview; the lounge and assignee designation are enabled from the Team plan.
- The first version picks the model automatically by office type. Later, per-project theme selection, custom part names and completion celebrations will be added.

## 18. Estimated budget

| Stage | Estimated duration | Estimated cost |
|---|---:|---:|
| Clickable design prototype | 1–2 weeks | ₩3M–8M |
| Personal MVP with real AI | 6–10 weeks | ₩25M–50M |
| Beta with sign-in and project management | 3–4 months | ₩60M–120M |
| Team-scale expanded edition | 5–8 months | ₩150M–300M or more |

These amounts assume outsourced development, and the durations per stage are the same as in section 17.

Estimated initial monthly operating costs:

- Servers, database and storage: ₩100K–500K/month (almost zero when run locally)
- Monitoring and logs: ₩50K–300K/month
- AI model fees: covered by the API top-ups and flat subscriptions the user has already paid for, and managed on the profit screen in section 10.

Model costs depend heavily on the number of agents, repeat counts, document length and tool usage. The average cost per task for each task type is measured in practice during the MVP, compared with the base value in `RateTable`, and expansion starts from the task types that turn a profit.

### Recommended initial total budget

- Validation prototype: about ₩5M
- Working MVP: about ₩35M
- 3 months of beta operation and improvement: about ₩20M
- Contingency of about 20%: about ₩12M
- Recommended total: about ₩70M–80M

With in-house development using open source and AI development tools, the core feasibility can be validated for under ₩10M.

## 19. Success criteria

The success of the initial product is judged by the following indicators.

### MVP quantitative indicators

| Indicator | Target |
|---|---|
| Time from adding the first task to execution starting | Within 5 minutes |
| Time to identify the current assignee and step from the screen (usability test) | Within 3 seconds, 90%+ correct |
| Final report approval rate (including approval after changes) | 70% or more |
| Share approved as is without changes | 40% or more |
| Average cost per task | Measured per task type, 20% or less of base value |
| Monthly return on investment (ROI) | Shown monthly on the profit screen and stays in surplus |
| Gap between system-estimated value and user-edited value | Within ±30% on average |
| Runs exceeding the budget cap | 0 |
| Used at least once a week in week 4 | Maintained, based on own use |

### Qualitative criteria

- Is it easy to compare review rejection reasons with the revised results?
- Can the final report be used in real work?
- Does the character expression help understanding of the work rather than being mere decoration?
- Do game-style effects help grasp status without hiding real work information?
- Do the profit numbers help decide "Is this work worth giving to AI?"

### Beta indicators

- Can idle staff and work bottlenecks be identified immediately?
- Does automatic reassignment reduce processing time while protecting quality and budget?
- Can workload and difficulty be understood just from faces and desk state?

## 20. First implementation goal

The first implementation completes the following single scene.

> The user posts a market research task on the shared board. The manager passes the task to the researcher, and the researcher hands material to the writer. The writer finds the comparison criteria can be read two ways, makes a troubled face and raises a hand. The user clicks the character and picks one criterion, and the writer bows in thanks and resumes work. The writer creates a report draft and passes it to the reviewer. The reviewer rejects it once for lack of evidence, then approves the revised version. Each model call takes cost out of the staff member's desk, and when the user approves the final report, the value converted into labor cost goes into the safe. The finished report and the task's profit (cost, recognized value, profit) appear in the right-hand panel and the report archive. All of these steps are visible at the same time in the office animation and the task flowchart.

Once this flow works naturally and reliably, it expands to parallel processing with assistant staff, clocking in/out and shift handovers, flat subscription links, multiple offices per project and external tool connections.

## Appendix A. Common event format

Every event sent by any executor has the following common fields.

```json
{
  "eventId": "evt_01J...",
  "seq": 1024,
  "type": "review.rejected",
  "timestamp": "2026-10-03T22:15:00+09:00",
  "projectId": "prj_japan_market",
  "taskId": "task_042",
  "agentId": "agent_reviewer_1",
  "payload": { "reason": "Insufficient source evidence", "returnTo": "agent_writer_1" }
}
```

Delivery rules:

- `seq` increases monotonically within a project. The screen applies events in `seq` order.
- If the same `eventId` arrives again, it is ignored (duplicate prevention).
- When the screen reconnects, it fetches events after the last received `seq` from the server again to restore state.
- Events are stored, then sent. The office, flowchart, report and profit screens must be rebuildable at any time from stored events alone.

## Appendix B. Animation synchronization policy

Real execution speed and animation speed differ. Events sometimes arrive in a burst within milliseconds, and sometimes the model response takes 30 seconds or more.

- **Animation queue**: events are queued per staff member and played in order.
- **Minimum play time**: meaningful motions such as handing over documents or stamping are guaranteed at least 0.6–1 second so the user does not miss them.
- **Catching up**: if the screen falls 3 or more seconds behind the real state, intermediate movement animations are skipped and it jumps straight to the final state. State information (board, flowchart, report) updates immediately without waiting for animations.
- **Long waits**: while waiting for a model response, a looping motion fitting the task type (typing, flipping through material) and the elapsed time are shown.
- **Compact view mode**: a mode that minimizes animation and shows only status icons and text. It follows the operating system's reduce-motion setting.

## Appendix C. Speech bubble template policy

Bubble text is built from the event type and `payload` values without calling AI, so clicking never costs anything.

| Event | Template example |
|---|---|
| `tool.started` (web search) | "I'm looking for material on {query}." |
| `artifact.created` | "I've made a draft of {artifactName}." |
| `task.handed_off` | "I've passed {artifactName} to {toAgent}." |
| `review.rejected` | "I need to fix it again because of {reason}." |
| `approval.requested` | "I'm waiting for user approval." |
| `subscription.limit_warning` | "{remaining}% of today's work capacity is left." |
| `agent.help_requested` | "{question} Could you help me a little?" |
| `agent.help_received` | "Thanks to you I know which way to go. I'll try again!" |
| `agent.help_timed_out` | "For now I'll proceed with {assumption}." |

Each skin can have a set of templates that differ only in tone. Content and variables stay the same; only the tone changes.

If a more detailed explanation is needed, AI is called only when the user chooses `Chat`, and that cost is recorded as that staff member's cost.
