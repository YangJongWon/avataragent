import { randomUUID } from 'node:crypto';
import { splitDraft } from '../shared/draft.ts';
import { taskTypeOf, TEAMS } from '../shared/teams.ts';
import type { Agent, Artifact, Expression, Role, StepStatus, Task, TeamId, WorkflowStep, WorkflowStepInput } from '../shared/types.ts';
import { MAX_LOOP, normalizePlan, parseLoop, remapLoops, STEP_KIND, templatePlan, validatePlan } from '../shared/workflow.ts';
import { usableBy, type McpServer, type McpTool, type McpToolMode, type PlannedAction } from '../shared/mcp.ts';
import { modelOf } from '../shared/models.ts';
import { complete, costKrw, parseJson, type Purpose } from './ai.ts';
import { config, ORGANIZATION_SAFETY_RULES } from './config.ts';
import { callTool } from './mcp.ts';
import { nextInquiry, nextMail } from './seed.ts';
import { store } from './store.ts';
import { systemPromptFor, TEAM_SPECS } from './teams.ts';

class BudgetExceededError extends Error {}

type ApprovalDecision = { kind: 'approve'; valueKrw?: number } | { kind: 'changes'; comment: string };

const helpWaiters = new Map<string, (answer: string | null) => void>();
const approvalWaiters = new Map<string, (decision: ApprovalDecision) => void>();

const ACTIVE: Task['status'][] = ['running', 'awaiting_help', 'awaiting_approval'];
const now = () => new Date().toISOString();
const teamOf = (task: Task) => store.office(task.officeId).team;
const specOf = (task: Task) => TEAM_SPECS[teamOf(task)];
const agentOf = (task: Task, role: Role) => store.agentByRole(task.officeId, role);
const officeAgents = (officeId: string) => store.data.agents.filter((a) => a.officeId === officeId);

function systemPrompt(agent: Agent) {
  return [
    systemPromptFor(store.office(agent.officeId).team, agent.role),
    '',
    '[조직 안전 규칙 - 다른 규칙보다 우선]',
    ...ORGANIZATION_SAFETY_RULES.map((r) => `- ${r}`),
    '',
    '[개인 규칙]',
    agent.rules || '(없음)',
  ].join('\n');
}

function setAgent(agent: Agent, status: Agent['status'], expression: Expression, activity: string) {
  store.updateAgent(agent.id, { status: store.agent(agent.id).paused ? 'paused' : status, expression, activity });
}

const stepById = (task: Task, stepId: string) => {
  const step = task.plan.find((s) => s.id === stepId);
  if (!step) throw new Error(`unknown step ${stepId}`);
  return step;
};

function setStep(taskId: string, stepId: string, status: StepStatus) {
  store.updateTask(taskId, (t) => {
    stepById(t, stepId).status = status;
    if (status === 'running' || status === 'awaiting') t.currentStepId = stepId;
  });
}

/** Approval belongs to the user; the manager carries the result to them. */
function agentOfStep(task: Task, step: WorkflowStep) {
  if (step.agentId) {
    const agent = store.data.agents.find((a) => a.id === step.agentId && a.officeId === task.officeId);
    if (agent) return agent;
  }
  return agentOf(task, 'manager');
}

const stepNote = (step: WorkflowStep, feedback?: string) =>
  [
    `[이번 단계] ${step.label}`,
    step.instructions ? `[단계 지시] ${step.instructions}` : '',
    feedback ? `[다시 하는 이유] ${feedback}` : '',
  ]
    .filter(Boolean)
    .join('\n');

async function waitIfPaused(agent: Agent) {
  while (store.agent(agent.id).paused) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

async function callAI(agent: Agent, task: Task | null, purpose: Purpose, user: string, mockText: () => string, json = false) {
  const budget = store.budget;
  const taskId = task?.id;
  if (budget.spentKrw >= budget.monthlyKrw) {
    store.emit('budget.exceeded', { taskId, agentId: agent.id, payload: { spentKrw: budget.spentKrw } });
    throw new BudgetExceededError('이번 달 AI 예산을 모두 사용했습니다. 손익·결산 탭에서 예산을 늘리면 다시 실행할 수 있습니다.');
  }
  const office = store.office(agent.officeId);
  if (office.budgetKrw !== null && office.spentKrw >= office.budgetKrw) {
    store.emit('budget.exceeded', { taskId, agentId: agent.id, payload: { spentKrw: office.spentKrw, officeId: office.id } });
    throw new BudgetExceededError(`${office.name}의 이번 달 예산 상한을 모두 사용했습니다. 경영팀 자료 탭에서 상한을 조정할 수 있습니다.`);
  }

  const model = modelOf(store.agent(agent.id).model);
  const result = await complete({ purpose, system: systemPrompt(agent), user, json, model, mockText });
  const amount = costKrw(result, model);

  if (taskId) {
    store.updateTask(taskId, (t) => {
      t.costKrw += amount;
      t.costByAgent[agent.id] = (t.costByAgent[agent.id] ?? 0) + amount;
    });
  }
  store.updateAgent(agent.id, { costKrw: store.agent(agent.id).costKrw + amount });
  store.updateOffice(office.id, (o) => {
    o.spentKrw += amount;
  });
  store.updateBudget((b) => {
    b.spentKrw += amount;
  });
  store.emit('cost.recorded', {
    taskId,
    agentId: agent.id,
    payload: { amountKrw: amount, inputTokens: result.inputTokens, outputTokens: result.outputTokens, purpose },
  });

  const after = store.budget;
  if (!after.warned80 && after.spentKrw >= after.monthlyKrw * 0.8) {
    store.updateBudget((b) => {
      b.warned80 = true;
    });
    store.emit('budget.threshold_reached', { agentId: agent.id, payload: { ratio: 0.8, spentKrw: after.spentKrw } });
  }
  return result.text;
}

function addArtifact(taskId: string, agent: Agent, step: WorkflowStep, kind: Artifact['kind'], title: string, content: string) {
  const task = store.task(taskId);
  const version = task.artifacts.filter((a) => (kind === 'research' ? a.stepId === step.id : a.kind === kind)).length + 1;
  const artifact: Artifact = { id: `art_${randomUUID()}`, agentId: agent.id, stepId: step.id, kind, title, content, version, createdAt: now() };
  store.updateTask(taskId, (t) => t.artifacts.push(artifact));
  store.emit('artifact.created', {
    taskId,
    agentId: agent.id,
    payload: { artifactId: artifact.id, kind, title: `${title} v${version}` },
  });
  return artifact;
}

function handOff(taskId: string, from: Agent, to: Agent, label: string) {
  if (from.id === to.id) return;
  setAgent(from, 'idle', 'smile', `${to.name}에게 ${label}을(를) 넘겼어요.`);
  store.emit('task.handed_off', { taskId, agentId: from.id, payload: { from: from.id, to: to.id, label } });
}

const latest = (task: Task, kind: Artifact['kind']) => task.artifacts.filter((a) => a.kind === kind).at(-1);

function researchNotes(task: Task) {
  const notes = task.plan
    .filter((s) => s.kind === 'research')
    .map((s) => {
      const note = task.artifacts.filter((a) => a.stepId === s.id).at(-1);
      return note ? `[${s.label}]\n${note.content}` : '';
    })
    .filter(Boolean);
  return notes.length ? notes.join('\n\n') : '(조사 단계 없음)';
}

// ───────────────────────────── 업무 여정 설계 ─────────────────────────────

const toSteps = (inputs: WorkflowStepInput[]): WorkflowStep[] =>
  inputs.map((s, i) => ({ ...s, id: `st_${randomUUID().slice(0, 8)}_${i}`, status: 'pending' }));

function mockPlan(officeId: string, taskType: string, description: string) {
  const team = store.office(officeId).team;
  const agents = officeAgents(officeId);
  let plan = templatePlan(team, taskType, agents);
  const pick = (role: Role) => agents.find((a) => a.role === role)?.id ?? null;
  const notes: string[] = [];
  const insertAt = (at: number, step: WorkflowStepInput) => {
    plan = remapLoops(plan, (i) => (i >= at ? i + 1 : i));
    plan.splice(at, 0, step);
  };
  const draftAt = plan.findIndex((s) => s.kind === 'draft');
  const firstResearch = plan.findIndex((s) => s.kind === 'research');
  if (/비교|vs|경쟁|대안/i.test(description) && !plan.some((s, i) => i < draftAt && s.label.includes('비교'))) {
    insertAt(draftAt, {
      kind: 'research',
      label: '비교 기준 정리',
      agentId: pick('reviewer'),
      instructions: '비교 대상과 평가 기준을 표로 정리한다.',
      loop: { to: firstResearch >= 0 ? firstResearch : draftAt, when: '비교할 후보가 2개 미만이면', max: 1 },
    });
    notes.push('비교가 필요해 보여서 검토자에게 비교 기준 정리를 먼저 맡겼어요. 후보가 모자라면 조사로 되돌아가요.');
  }
  if (/급|빠르게|간단|짧게/.test(description)) {
    const kept = plan.filter((s) => s.kind !== 'review');
    if (kept.length !== plan.length) notes.push('빨리 끝내야 해서 검토 단계를 뺐어요.');
    plan = kept;
  } else if (/꼼꼼|중요|정확|임원|대표/.test(description)) {
    const research = plan.findIndex((s) => s.kind === 'research');
    insertAt(plan.length - 1, {
      kind: 'review',
      label: '최종 점검',
      agentId: pick('manager'),
      instructions: '의사결정자가 바로 읽을 수 있는지 마지막으로 점검한다.',
      loop: { to: research >= 0 ? research : plan.findIndex((s) => s.kind === 'draft'), when: '근거가 부족하거나 결론이 흐리면', max: 1 },
    });
    notes.push('중요한 업무라서 팀장이 최종 점검을 한 번 더 하고, 근거가 부족하면 조사부터 다시 해요.');
  }
  return JSON.stringify({ steps: plan, note: notes.join(' ') || '업무 유형의 기본 여정이 요청에 잘 맞아서 그대로 쓸게요.' });
}

/** Asks the office manager to design the journey. Cost is charged to the task when there is one. */
export async function designPlan(input: { officeId: string; title: string; description: string; taskType: string }, task: Task | null = null) {
  const office = store.office(input.officeId);
  const agents = officeAgents(office.id);
  const manager = store.agentByRole(office.id, 'manager');
  const team = TEAMS[office.team];
  const template = templatePlan(office.team, input.taskType, agents);
  const raw = await callAI(
    manager,
    task,
    'plan',
    [
      `업무 제목: ${input.title || '(제목 없음)'}`,
      `업무 유형: ${taskTypeOf(office.team, input.taskType).label}`,
      input.description ? `요청 내용: ${input.description}` : '',
      '',
      '[우리 팀 직원]',
      ...agents.map((a) => `- id=${a.id} | ${a.name} | ${team.roleTitles[a.role]} | 모델 ${modelOf(a.model).label}`),
      '',
      '[단계 종류]',
      ...Object.entries(STEP_KIND).map(([kind, meta]) => `- ${kind}: ${meta.title}. ${meta.hint}`),
      '',
      '[기본 여정]',
      ...template.map(
        (s, i) =>
          `${i}. ${s.kind} | ${s.label} | ${s.agentId ?? '사용자'}${s.loop ? ` | 루프: "${s.loop.when}"이면 ${s.loop.to}번으로 (최대 ${s.loop.max}회)` : ''}`,
      ),
      '',
      '요청에 맞게 업무 여정을 설계하고 각 단계에 가장 알맞은 직원을 배정해라.',
      '순서 규칙: brief 1개로 시작, research 0개 이상, draft 1개, review 0개 이상, approval 1개로 끝. 전체 10단계 이하.',
      `조건 루프: research·draft·review 단계에는 "조건이 맞으면 앞 단계로 되돌아가기"를 붙일 수 있다. to는 steps 배열의 0부터 세는 번호이고, research·draft는 자기 자신 이하, review는 draft 이하만 된다. max는 1~${MAX_LOOP}. 필요 없으면 null.`,
      '기본 여정으로 충분하면 그대로 써도 된다. 불필요한 단계와 루프는 비용만 늘린다.',
      'JSON으로만 답한다: {"steps": [{"kind": string, "label": string (12자 이내), "agentId": string, "instructions": string, "loop": {"to": number, "when": string (조건, 20자 이내), "max": number} | null}], "note": string (설계 이유 한두 문장)}',
    ]
      .filter(Boolean)
      .join('\n'),
    () => mockPlan(office.id, input.taskType, `${input.title} ${input.description}`),
    true,
  );
  const parsed = parseJson(raw, { steps: [] as Partial<WorkflowStepInput>[], note: '' });
  return {
    steps: normalizePlan(Array.isArray(parsed.steps) ? parsed.steps : [], office.team, input.taskType, agents),
    note: String(parsed.note ?? '').slice(0, 300),
  };
}

async function designAtStart(taskId: string) {
  const task = store.task(taskId);
  const manager = agentOf(task, 'manager');
  await waitIfPaused(manager);
  setStep(taskId, task.plan[0].id, 'running');
  setAgent(manager, 'working', 'focus', '요청을 보고 업무 여정과 담당자를 정하고 있어요.');
  const { steps, note } = await designPlan(
    { officeId: task.officeId, title: task.title, description: task.description, taskType: task.taskType },
    task,
  );
  store.updateTask(taskId, (t) => {
    t.plan = toSteps(steps);
    t.planNote = note;
    t.currentStepId = null;
  });
  store.emit('workflow.planned', {
    taskId,
    agentId: manager.id,
    payload: { steps: steps.length, note, labels: steps.map((s) => s.label) },
  });
}

// ───────────────────────────── 단계 실행 ─────────────────────────────

async function briefStep(taskId: string, step: WorkflowStep, feedback?: string) {
  const task = store.task(taskId);
  const spec = specOf(task);
  const team = TEAMS[teamOf(task)];
  const agent = agentOfStep(task, step);
  await waitIfPaused(agent);
  setStep(taskId, step.id, 'running');
  setAgent(agent, 'working', 'focus', `칠판의 새 업무를 확인하고 있어요: ${task.title}`);
  store.emit('task.assigned', { taskId, agentId: agent.id, payload: { step: step.id, label: step.label } });

  const brief = await callAI(
    agent,
    task,
    'brief',
    [
      `업무 제목: ${task.title}`,
      `업무 유형: ${taskTypeOf(team.id, task.taskType).label}`,
      task.description ? `요청 내용: ${task.description}` : '',
      `[처리할 자료]\n${task.inputText}`,
      `[업무 여정]\n${task.plan.map((s, i) => `${i + 1}. ${s.label}`).join('\n')}`,
      stepNote(step, feedback),
      '',
      spec.briefAsk,
    ]
      .filter(Boolean)
      .join('\n'),
    () => spec.mock.brief(store.task(taskId)),
  );
  addArtifact(taskId, agent, step, 'brief', '작업 지시서', brief);
  setStep(taskId, step.id, 'done');
}

const MAX_TOOL_CALLS = 3;

type OfficeTool = { server: McpServer; tool: McpTool; ref: string };

const officeTools = (officeId: string, mode: McpToolMode): OfficeTool[] =>
  store.data.mcpServers
    .filter((server) => usableBy(server, officeId))
    .flatMap((server) => server.tools.filter((tool) => tool.mode === mode).map((tool) => ({ server, tool, ref: `${server.id}/${tool.name}` })));

const toolList = (tools: OfficeTool[]) =>
  tools.map(({ ref, server, tool }) => `- ${ref} (${server.name}): ${tool.description || '(설명 없음)'}\n  인자: ${JSON.stringify(tool.inputSchema)}`);

const argsOf = (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

/** Offline demo: query the first tool that takes one string argument with the task title. */
function mockToolCalls(tools: OfficeTool[], task: Task) {
  for (const { ref, tool } of tools) {
    const props = (tool.inputSchema.properties ?? {}) as Record<string, { type?: unknown }>;
    const required = Array.isArray(tool.inputSchema.required) ? (tool.inputSchema.required as string[]) : [];
    const strings = Object.keys(props).filter((key) => props[key]?.type === 'string');
    const target = required.length === 1 && strings.includes(required[0]) ? required[0] : required.length === 0 ? strings[0] : undefined;
    if (target) return [{ tool: ref, arguments: { [target]: task.title }, why: '업무 제목으로 찾아봐요.' }];
  }
  return [];
}

/** Lets the agent pick up to MAX_TOOL_CALLS enabled MCP tool calls and returns their results for the prompt. */
async function useTools(taskId: string, agent: Agent, context: string) {
  const tools = officeTools(store.task(taskId).officeId, 'auto');
  if (!tools.length) return '';
  setAgent(agent, 'working', 'focus', '연결된 도구로 무엇을 찾아볼지 정하고 있어요.');
  const raw = await callAI(
    agent,
    store.task(taskId),
    'tools',
    [
      context,
      '',
      '[쓸 수 있는 도구]',
      ...toolList(tools),
      '',
      `이 단계에 꼭 필요한 정보만 도구로 찾아라. 최대 ${MAX_TOOL_CALLS}번이고, 필요 없으면 빈 배열로 답한다.`,
      '외부에 글을 쓰거나, 보내거나, 지우는 호출은 하지 않는다.',
      'JSON으로만 답한다: {"calls": [{"tool": string (목록의 이름 그대로), "arguments": object, "why": string}]}',
    ].join('\n'),
    () => JSON.stringify({ calls: mockToolCalls(tools, store.task(taskId)) }),
    true,
  );
  const parsed = parseJson(raw, { calls: [] as { tool?: unknown; arguments?: unknown }[] });
  const results: string[] = [];
  for (const call of (Array.isArray(parsed.calls) ? parsed.calls : []).slice(0, MAX_TOOL_CALLS)) {
    const picked = tools.find((t) => t.ref === call?.tool);
    if (!picked) continue;
    const args = argsOf(call.arguments);
    setAgent(agent, 'working', 'focus', `${picked.server.icon} ${picked.server.name}에서 찾아보고 있어요.`);
    const result = await invokeTool(taskId, agent, picked.server, picked.tool.name, args, false);
    const label = `[${picked.server.name} · ${picked.tool.name}]`;
    results.push(result.ok ? `${label} ${JSON.stringify(args)}\n${result.output}` : `${label} 실패: ${result.reason}`);
  }
  return results.join('\n\n');
}

/** Calls one MCP tool for a task, logging the call and counting it on the server and the task. */
async function invokeTool(taskId: string, agent: Agent, server: McpServer, tool: string, args: Record<string, unknown>, approved: boolean) {
  const payload = { server: server.name, icon: server.icon, tool };
  store.emit('mcp.called', { taskId, agentId: agent.id, payload: { ...payload, arguments: args, ...(approved ? { approved } : {}) } });
  const count = (failed: boolean) => {
    store.mutate((s) => {
      const target = s.mcpServers.find((m) => m.id === server.id);
      if (!target) return;
      const stats = (target.stats ??= { calls: 0, failures: 0, lastUsedAt: null });
      stats.calls += 1;
      if (failed) stats.failures += 1;
      stats.lastUsedAt = now();
    });
    store.updateTask(taskId, (t) => {
      t.toolCalls = (t.toolCalls ?? 0) + 1;
    });
  };
  try {
    const output = await callTool(server, tool, args);
    count(false);
    store.emit('mcp.result', { taskId, agentId: agent.id, payload: { ...payload, chars: output.length } });
    return { ok: true as const, output };
  } catch (error) {
    const reason = (error instanceof Error ? error.message : String(error)).split('\n')[0].slice(0, 200);
    count(true);
    store.emit('mcp.failed', { taskId, agentId: agent.id, payload: { ...payload, reason } });
    return { ok: false as const, reason };
  }
}

async function researchStep(taskId: string, step: WorkflowStep, feedback?: string) {
  const task = store.task(taskId);
  const spec = specOf(task);
  const agent = agentOfStep(task, step);
  await waitIfPaused(agent);
  setStep(taskId, step.id, 'running');
  setAgent(agent, 'working', 'focus', `${step.label} 중이에요.`);
  store.emit('tool.started', { taskId, agentId: agent.id, payload: { tool: 'research', label: step.label } });

  const earlier = researchNotes(task);
  const context = [
    `[작업 지시서]\n${latest(task, 'brief')?.content}`,
    `[처리할 자료]\n${task.inputText}`,
    earlier !== '(조사 단계 없음)' ? `[앞 단계 메모]\n${earlier}` : '',
    stepNote(step, feedback),
  ]
    .filter(Boolean)
    .join('\n\n');
  const found = await useTools(taskId, agent, context);
  setAgent(agent, 'working', 'focus', `${step.label} 중이에요.`);
  const notes = await callAI(
    agent,
    store.task(taskId),
    'research',
    [
      context,
      found ? `[연결된 도구로 찾은 내용]\n${found}` : '',
      '',
      step.instructions || spec.researchAsk,
      found ? '도구로 찾은 내용을 근거로 쓰고, 어느 도구에서 왔는지 밝혀라.' : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
    () =>
      `## ${step.label}\n${spec.mock.research(store.task(taskId))}` +
      (found ? `\n\n### 연결된 도구에서 찾은 내용\n${found.slice(0, 1500)}` : ''),
  );
  store.emit('tool.completed', { taskId, agentId: agent.id, payload: { tool: 'research' } });
  addArtifact(taskId, agent, step, 'research', step.label, notes);
  setStep(taskId, step.id, 'done');
}

/**
 * Decides whether the writer must ask the user before drafting. Returns `'continue'` to draft now,
 * or `'waiting'` when the runtime will deliver the answer later (durable runtimes wait outside the process).
 */
type Clarify = (taskId: string, step: WorkflowStep, writer: Agent) => Promise<'continue' | 'waiting'>;

async function askForHelp(taskId: string, step: WorkflowStep, writer: Agent): Promise<'continue'> {
  const help = await raiseHelp(taskId, step, writer);
  if (!help) return 'continue';
  const answer = await new Promise<string | null>((resolve) => {
    const remainingMs = Math.max(0, help.deadline - Date.now());
    const timer = setTimeout(() => {
      helpWaiters.delete(taskId);
      resolve(null);
    }, remainingMs);
    helpWaiters.set(taskId, (value) => {
      clearTimeout(timer);
      helpWaiters.delete(taskId);
      resolve(value);
    });
  });
  settleHelp(taskId, step, writer, answer);
  return 'continue';
}

/**
 * Clarify for durable runtimes. Without an answer it raises the question and reports `'waiting'`;
 * on the re-run it applies the delivered answer (null = timed out, use the assumption).
 */
export function clarifyWith(answer: string | null | undefined): Clarify {
  return async (taskId, step, writer) => {
    if (answer !== undefined) {
      settleHelp(taskId, step, writer, answer);
      return 'continue';
    }
    return (await raiseHelp(taskId, step, writer)) ? 'waiting' : 'continue';
  };
}

/** Puts the writer's question to the user, or re-announces one restored after a restart. Null when no question is needed. */
async function raiseHelp(taskId: string, step: WorkflowStep, writer: Agent) {
  const task = store.task(taskId);
  let help = task.help;
  if (!help) {
    setAgent(writer, 'working', 'focus', '쓰기 전에 지시 내용을 다시 읽고 있어요.');
    const raw = await callAI(
      writer,
      task,
      'clarify',
      [
        `[작업 지시서]\n${latest(task, 'brief')?.content}`,
        `[조사 메모]\n${researchNotes(task)}`,
        '',
        '결과물을 쓰기 전에, 사용자에게 꼭 물어봐야 결과가 크게 달라지는 모호한 점이 있는지 판단해라.',
        '정말 필요한 경우에만 질문하고, 질문은 하나만 한다.',
        'JSON으로만 답한다: {"needs_clarification": boolean, "question": string, "options": string[] (2~3개), "assumption": string (답이 없을 때 따를 가정)}',
      ].join('\n'),
      () =>
        JSON.stringify(
          store.task(taskId).clarifications.length === 0
            ? {
                needs_clarification: true,
                question: '과제의 초점이 두 가지로 읽혀요. 어느 쪽을 중심으로 정리할까요?',
                options: ['비용·효과 중심', '기술적 장단점 중심'],
                assumption: '비용·효과 중심',
              }
            : { needs_clarification: false, question: '', options: [], assumption: '' },
        ),
      true,
    );
    const parsed = parseJson(raw, { needs_clarification: false, question: '', options: [] as string[], assumption: '' });
    if (!parsed.needs_clarification || !parsed.question) return null;

    help = {
      id: `help_${randomUUID()}`,
      agentId: writer.id,
      question: parsed.question,
      options: (parsed.options ?? []).slice(0, 3),
      assumption: parsed.assumption || parsed.options?.[0] || '일반적인 방향',
      deadline: Date.now() + config.helpTimeoutSec * 1000,
    };
    store.updateTask(taskId, (t) => {
      t.help = help;
      t.status = 'awaiting_help';
    });
    setStep(taskId, step.id, 'awaiting');
    store.emit('agent.help_requested', {
      taskId,
      agentId: writer.id,
      payload: { question: help.question, options: help.options, deadline: help.deadline },
    });
  } else {
    store.emit('agent.help_restored', {
      taskId,
      agentId: writer.id,
      payload: { question: help.question, options: help.options, deadline: help.deadline },
    });
  }
  setAgent(writer, 'help_requested', 'troubled', `${help.question} 조금만 도와주실 수 있을까요?`);
  return help;
}

/** Applies the user's answer, or the writer's assumption when the answer is null (timed out). */
function settleHelp(taskId: string, step: WorkflowStep, writer: Agent, answer: string | null) {
  const help = store.task(taskId).help;
  if (!help) return;
  const decided = answer?.trim() || help.assumption;
  store.updateTask(taskId, (t) => {
    t.help = null;
    t.status = 'running';
    t.clarifications.push(decided);
  });
  setStep(taskId, step.id, 'running');
  if (answer) {
    setAgent(writer, 'working', 'thanks', '덕분에 방향이 잡혔어요. 다시 해볼게요!');
    store.emit('agent.help_received', { taskId, agentId: writer.id, payload: { answer: decided } });
  } else {
    setAgent(writer, 'working', 'focus', `우선 "${decided}"(으)로 진행해 둘게요.`);
    store.emit('agent.help_timed_out', { taskId, agentId: writer.id, payload: { assumption: decided } });
  }
}

/** Returns false when the draft is on hold until the user answers a help request. */
async function draftStep(taskId: string, step: WorkflowStep, attempt: number, clarify: Clarify, feedback?: string) {
  const spec = specOf(store.task(taskId));
  const writer = agentOfStep(store.task(taskId), step);
  await waitIfPaused(writer);
  setStep(taskId, step.id, 'running');
  if (!store.task(taskId).help) store.emit('task.started', { taskId, agentId: writer.id, payload: { step: step.id, attempt } });

  if (attempt === 1 && spec.allowClarify && (await clarify(taskId, step, writer)) === 'waiting') return false;

  const task = store.task(taskId);
  const lastReview = task.reviews.at(-1);
  const lastChange = task.userChangeRequests.at(-1);
  setAgent(writer, 'working', attempt > 1 ? 'sweat' : 'focus', attempt > 1 ? '지적받은 부분을 고쳐서 다시 쓰고 있어요.' : `${step.label} 중이에요.`);
  const draft = await callAI(
    writer,
    task,
    'draft',
    [
      `[업무 제목] ${task.title}`,
      `[작업 지시서]\n${latest(task, 'brief')?.content}`,
      `[조사 메모]\n${researchNotes(task)}`,
      `[처리할 자료]\n${task.inputText}`,
      task.clarifications.length ? `[사용자가 정한 방향]\n${task.clarifications.join('\n')}` : '',
      attempt > 1 ? `[이전 초안]\n${latest(task, 'draft')?.content}` : '',
      lastReview && !lastReview.approved ? `[검수 반려 사유]\n${lastReview.reason}` : '',
      lastChange ? `[사용자 수정 요청]\n${lastChange}` : '',
      stepNote(step, feedback),
      '',
      spec.draftAsk,
    ]
      .filter(Boolean)
      .join('\n\n'),
    () => spec.mock.draft(store.task(taskId)),
  );
  addArtifact(taskId, writer, step, 'draft', '초안', draft);
  setStep(taskId, step.id, 'done');
  return true;
}

/** `returnTo` is the step a rejection sends the work back to; null means the review only leaves an opinion. */
async function reviewStep(taskId: string, step: WorkflowStep, attempt: number, returnTo: WorkflowStep | null) {
  const task = store.task(taskId);
  const spec = specOf(task);
  const reviewer = agentOfStep(task, step);
  const writer = agentOfStep(task, returnTo ?? task.plan.find((s) => s.kind === 'draft')!);
  await waitIfPaused(reviewer);
  setStep(taskId, step.id, 'running');
  setAgent(reviewer, 'working', 'focus', `안경을 고쳐 쓰고 초안을 ${step.label}하고 있어요.`);
  store.emit('review.started', { taskId, agentId: reviewer.id, payload: { attempt, step: step.id } });

  const firstReview = task.plan.find((s) => s.kind === 'review')?.id === step.id;
  const mockReject = firstReview && spec.rejectFirstInMock && attempt === 1 && task.userChangeRequests.length === 0;
  const mockScore = 78 + 6 * modelOf(writer.model).tier;
  const raw = await callAI(
    reviewer,
    task,
    'review',
    [
      `[업무 제목] ${task.title}`,
      `[처리할 자료]\n${task.inputText}`,
      `[초안]\n${latest(task, 'draft')?.content}`,
      stepNote(step),
      '',
      spec.reviewAsk,
      step.instructions ? `추가 관점: ${step.instructions}` : '',
      step.loop ? `반려 조건: ${step.loop.when}` : '',
      'JSON으로만 답한다: {"approved": boolean, "score": number (0~100), "reason": string (구체적인 근거 한두 문장)}',
    ]
      .filter(Boolean)
      .join('\n'),
    () =>
      JSON.stringify(
        mockReject
          ? { approved: false, score: 62, reason: spec.mock.rejectReason }
          : { approved: true, score: mockScore, reason: '요청한 형식을 지켰고 내용이 자료와 맞습니다.' },
      ),
    true,
  );
  const parsed = parseJson(raw, { approved: true, score: 70, reason: '검수 결과를 해석하지 못해 기본 통과 처리했습니다.' });
  const score = Math.max(0, Math.min(100, Number(parsed.score) || 0));
  const approved = Boolean(parsed.approved);
  store.updateTask(taskId, (t) => t.reviews.push({ agentId: reviewer.id, approved, score, reason: parsed.reason, at: now() }));

  if (approved) {
    setStep(taskId, step.id, 'done');
    setAgent(reviewer, 'idle', 'smile', `${step.label} 통과! ${score}점이에요.`);
    store.emit('review.approved', { taskId, agentId: reviewer.id, payload: { score } });
    return { approved, reason: parsed.reason };
  }

  if (!returnTo) {
    setStep(taskId, step.id, 'done');
    setAgent(reviewer, 'idle', 'normal', `의견을 남기고 넘길게요: ${parsed.reason}`);
    store.emit('review.rejected', { taskId, agentId: reviewer.id, payload: { reason: parsed.reason, score, returnTo: null } });
    return { approved, reason: parsed.reason };
  }

  setStep(taskId, step.id, 'rejected');
  setAgent(reviewer, 'idle', 'normal', `${parsed.reason} 때문에 다시 해야 해요.`);
  if (writer.id !== reviewer.id) setAgent(writer, 'waiting', 'sweat', `반려됐어요. ${returnTo.label}부터 다시 할 준비를 하고 있어요.`);
  store.emit('review.rejected', {
    taskId,
    agentId: reviewer.id,
    payload: { reason: parsed.reason, score, returnTo: writer.id },
  });
  return { approved, reason: parsed.reason };
}

/** Asks the step's owner whether the loop condition holds for what they just produced. */
async function checkLoop(taskId: string, step: WorkflowStep) {
  const task = store.task(taskId);
  const loop = step.loop!;
  const agent = agentOfStep(task, step);
  const output = step.kind === 'draft' ? latest(task, 'draft') : task.artifacts.filter((a) => a.stepId === step.id).at(-1);
  const taken = task.loopCounts?.[step.id] ?? 0;
  setAgent(agent, 'working', 'focus', `"${loop.when}"인지 확인하고 있어요.`);
  const raw = await callAI(
    agent,
    task,
    'check',
    [
      `[업무 제목] ${task.title}`,
      stepNote(step),
      `[방금 만든 결과]\n${output?.content ?? '(없음)'}`,
      '',
      `반복 조건: "${loop.when}"`,
      '조건에 해당하면 앞 단계로 되돌아가 다시 해야 한다. 지금 결과가 조건에 해당하는지 판단해라. 애매하면 해당하지 않는 것으로 본다.',
      'JSON으로만 답한다: {"repeat": boolean, "reason": string (한 문장)}',
    ].join('\n'),
    () =>
      JSON.stringify(
        taken === 0
          ? { repeat: true, reason: `확인해 보니 "${loop.when}"에 해당해요.` }
          : { repeat: false, reason: '이번에는 조건에 해당하지 않아요.' },
      ),
    true,
  );
  const parsed = parseJson(raw, { repeat: false, reason: '' });
  return { repeat: Boolean(parsed.repeat), reason: String(parsed.reason || loop.when) };
}

function takeLoop(taskId: string, plan: WorkflowStep[], from: number, reason: string) {
  const step = plan[from];
  const loop = step.loop!;
  const target = plan[loop.to];
  const count = (store.task(taskId).loopCounts?.[step.id] ?? 0) + 1;
  store.updateTask(taskId, (t) => {
    t.loopCounts = { ...t.loopCounts, [step.id]: count };
    if (step.kind !== 'review') stepById(t, step.id).status = 'looped';
    for (let i = loop.to; i < from; i++) t.plan[i].status = 'pending';
  });
  const task = store.task(taskId);
  const owner = agentOfStep(task, step);
  setAgent(owner, 'idle', 'normal', `${reason} ${loop.to === from ? '한 번 더 할게요.' : `${target.label}(으)로 되돌아가요.`}`);
  store.emit('workflow.looped', {
    taskId,
    agentId: owner.id,
    payload: { from: step.label, to: target.label, when: loop.when, reason, count, max: loop.max },
  });
  handOff(taskId, owner, agentOfStep(task, target), '다시 할 일');
}

function estimateValue(task: Task, itemCount: number) {
  const type = taskTypeOf(teamOf(task), task.taskType);
  const hours = type.standardHours + (type.hoursPerItem ?? 0) * itemCount;
  const base = Math.round(hours * store.budget.hourlyRateKrw);
  const score = task.reviews.at(-1)?.score ?? 70;
  const qualityMultiplier = Math.round((0.7 + (0.5 * score) / 100) * 100) / 100;
  const userMultiplier = task.userChangeRequests.length > 0 ? 0.7 : 1;
  return {
    baseKrw: base,
    qualityMultiplier,
    userMultiplier,
    estimatedKrw: Math.round(base * qualityMultiplier * userMultiplier),
    recognizedKrw: 0,
    userEdited: false,
  };
}

const MAX_ACTIONS = 3;

/** Offline demo: proposes one call to the first approval tool, filling string arguments from the task. */
function mockActions(tools: OfficeTool[], task: Task, report: string) {
  const picked = tools[0];
  if (!picked) return [];
  const props = (picked.tool.inputSchema.properties ?? {}) as Record<string, { type?: unknown }>;
  const args: Record<string, string> = {};
  for (const [key, prop] of Object.entries(props)) {
    if (prop?.type !== 'string') continue;
    args[key] = /title|subject|name|제목/i.test(key) ? task.title : report.slice(0, 300);
  }
  return [{ tool: picked.ref, arguments: args, summary: `${picked.server.name}에 "${task.title}" 결과를 반영해요.` }];
}

/** Lets the writer propose external tool calls that run only after the user approves the task. */
async function planActions(taskId: string): Promise<PlannedAction[]> {
  const task = store.task(taskId);
  const tools = officeTools(task.officeId, 'approval');
  if (!tools.length) return [];
  const draftStepOf = task.plan.find((s) => s.kind === 'draft');
  const writer = draftStepOf ? agentOfStep(task, draftStepOf) : agentOf(task, 'manager');
  const report = splitDraft(latest(task, 'draft')?.content ?? '').body;
  setAgent(writer, 'working', 'focus', '승인받으면 실행할 외부 작업을 정리하고 있어요.');
  const raw = await callAI(
    writer,
    task,
    'actions',
    [
      `[업무 제목] ${task.title}`,
      `[최종 결과물]\n${report.slice(0, 4000)}`,
      '',
      '[승인 후 쓸 수 있는 도구]',
      ...toolList(tools),
      '',
      `이 결과물을 실제로 반영하려면 어떤 도구 호출이 필요한지 제안해라. 최대 ${MAX_ACTIONS}개이고, 필요 없으면 빈 배열로 답한다.`,
      '사용자가 승인해야만 실행되므로, 무엇을 하는지 summary에 한 문장으로 분명히 쓴다.',
      'JSON으로만 답한다: {"actions": [{"tool": string (목록의 이름 그대로), "arguments": object, "summary": string}]}',
    ].join('\n'),
    () => JSON.stringify({ actions: mockActions(tools, store.task(taskId), report) }),
    true,
  );
  const parsed = parseJson(raw, { actions: [] as { tool?: unknown; arguments?: unknown; summary?: unknown }[] });
  const actions: PlannedAction[] = [];
  for (const item of (Array.isArray(parsed.actions) ? parsed.actions : []).slice(0, MAX_ACTIONS)) {
    const picked = tools.find((t) => t.ref === item?.tool);
    if (!picked) continue;
    actions.push({
      id: `act_${randomUUID().slice(0, 8)}`,
      serverId: picked.server.id,
      serverName: picked.server.name,
      icon: picked.server.icon,
      tool: picked.tool.name,
      arguments: argsOf(item.arguments),
      summary: String(item.summary ?? '').slice(0, 200) || `${picked.server.name} ${picked.tool.name} 호출`,
      enabled: true,
      status: 'proposed',
    });
  }
  return actions;
}

/**
 * Runs the approved actions one by one, persisting `running` before each call. Done actions are
 * skipped, and one left `running` by a crash becomes `unknown` rather than being sent twice.
 */
async function runActions(taskId: string) {
  store.updateTask(taskId, (t) => {
    for (const action of t.actions ?? []) if (action.status === 'running') action.status = 'unknown';
  });
  const manager = agentOf(store.task(taskId), 'manager');
  for (const action of store.task(taskId).actions ?? []) {
    if (action.status !== 'proposed') continue;
    const set = (patch: Partial<PlannedAction>) =>
      store.updateTask(taskId, (t) => {
        const target = t.actions?.find((a) => a.id === action.id);
        if (target) Object.assign(target, patch);
      });
    if (!action.enabled) {
      set({ status: 'skipped', result: '사용자가 끔' });
      continue;
    }
    const server = store.data.mcpServers.find((s) => s.id === action.serverId);
    const tool = server?.tools.find((t) => t.name === action.tool);
    if (!server || !usableBy(server, store.task(taskId).officeId) || tool?.mode !== 'approval') {
      set({ status: 'skipped', result: '도구가 꺼졌거나 지워졌어요.' });
      continue;
    }
    set({ status: 'running' });
    setAgent(manager, 'working', 'focus', `${server.icon} ${server.name}에 반영하고 있어요.`);
    const result = await invokeTool(taskId, manager, server, action.tool, action.arguments, true);
    set(result.ok ? { status: 'done', result: result.output.slice(0, 500) } : { status: 'failed', result: result.reason });
  }
}

/** Posts the result for the user's decision. A repeat call for the same step only restores the waiting state. */
export async function requestApproval(taskId: string, stepId: string) {
  const task = store.task(taskId);
  const step = stepById(task, stepId);
  const manager = agentOf(task, 'manager');
  if (task.status === 'awaiting_approval' && task.currentStepId === step.id) {
    setAgent(manager, 'awaiting_approval', 'normal', '결과물을 올렸어요. 사용자 승인을 기다리고 있어요.');
    return;
  }
  const actions = await planActions(taskId);
  const { json } = splitDraft(latest(task, 'draft')?.content ?? '');
  setStep(taskId, step.id, 'awaiting');
  store.updateTask(taskId, (t) => {
    t.status = 'awaiting_approval';
    t.value = estimateValue(t, Math.max(1, t.inputIds.length));
    t.proposal = specOf(t).buildProposal(json, t);
    t.actions = actions;
  });
  setAgent(manager, 'awaiting_approval', 'normal', '결과물을 올렸어요. 사용자 승인을 기다리고 있어요.');
  store.emit('approval.requested', {
    taskId,
    agentId: manager.id,
    payload: { estimatedKrw: store.task(taskId).value?.estimatedKrw },
  });
}

function recognizeValue(taskId: string, override?: number) {
  const task = store.task(taskId);
  const value = { ...(task.value ?? estimateValue(task, Math.max(1, task.inputIds.length))) };
  value.recognizedKrw = override !== undefined && override >= 0 ? Math.round(override) : value.estimatedKrw;
  value.userEdited = value.recognizedKrw !== value.estimatedKrw;

  const totalCost = Object.values(task.costByAgent).reduce((a, b) => a + b, 0);
  const participants = Object.keys(task.costByAgent);
  for (const agentId of participants) {
    const share = totalCost > 0 ? task.costByAgent[agentId] / totalCost : 1 / participants.length;
    const agent = store.agent(agentId);
    store.updateAgent(agentId, {
      valueKrw: agent.valueKrw + value.recognizedKrw * share,
      tasksDone: agent.tasksDone + 1,
    });
  }
  store.updateOffice(task.officeId, (o) => {
    o.valueKrw += value.recognizedKrw;
  });
  store.updateBudget((b) => {
    b.valueKrw += value.recognizedKrw;
  });
  store.updateTask(taskId, (t) => {
    t.value = value;
  });
  store.emit('value.recognized', {
    taskId,
    agentId: agentOf(task, 'manager').id,
    payload: { amountKrw: value.recognizedKrw, profitKrw: value.recognizedKrw - task.costKrw },
  });
}

function finish(taskId: string, applied: string) {
  const task = store.task(taskId);
  store.updateTask(taskId, (t) => {
    t.status = 'completed';
    t.currentStepId = null;
    t.completedAt = now();
  });
  for (const agent of officeAgents(task.officeId)) {
    setAgent(agent, 'idle', 'celebrate', `업무 완료! ${applied}`);
  }
  store.emit('task.completed', { taskId, payload: { title: task.title } });
  setTimeout(() => {
    for (const agent of officeAgents(task.officeId)) {
      if (agent.status === 'idle' && agent.expression === 'celebrate') {
        setAgent(agent, 'idle', 'normal', '휴게실에서 쉬고 있어요. ☕');
      }
    }
  }, 6000);
}

/** Upper bound on step executions per run, so a loop the AI keeps triggering cannot spin forever. */
const MAX_STEP_RUNS = 40;
const HANDOFF_LABEL: Partial<Record<WorkflowStep['kind'], string>> = { brief: '작업 지시서', draft: '초안' };

export interface RunPoint {
  /** Index of the step to run next. */
  at: number;
  /** Step executions already spent, counted against MAX_STEP_RUNS. */
  runs: number;
  steps: { id: string; kind: WorkflowStep['kind'] }[];
}

export type StepOutcome = { kind: 'next'; at: number; feedback: string | null } | { kind: 'needs_help'; timeoutMs: number };

export const tooManyRunsMessage = '업무 여정이 너무 많이 반복돼서 멈췄어요. 루프 조건을 확인해 주세요.';

/** Designs an AI plan on first start, then works out where a new or restored run continues. */
export async function prepareRun(taskId: string): Promise<RunPoint> {
  const initial = store.task(taskId);
  if (initial.planMode === 'ai' && initial.plan.every((step) => step.status === 'pending') && initial.artifacts.length === 0) {
    await designAtStart(taskId);
  }
  store.updateTask(taskId, (t) => {
    t.loopCounts ??= {};
    if (t.status === 'running') t.failureReason = null;
  });
  const task = store.task(taskId);
  const plan = task.plan;
  const currentAt = task.currentStepId ? plan.findIndex((step) => step.id === task.currentStepId) : -1;
  const firstIncomplete = plan.findIndex((step) => step.status !== 'done');
  return {
    at: currentAt >= 0 && plan[currentAt].status !== 'done' ? currentAt : firstIncomplete >= 0 ? firstIncomplete : plan.length - 1,
    runs: plan.filter((step) => step.status === 'done').length + Object.values(task.loopCounts ?? {}).reduce((a, b) => a + b, 0),
    steps: plan.map((step) => ({ id: step.id, kind: step.kind })),
  };
}

/** Runs the non-approval step at `at` and decides where the journey goes next. */
export async function runStepAt(taskId: string, at: number, feedback: string | null, clarify: Clarify = askForHelp): Promise<StepOutcome> {
  const plan = store.task(taskId).plan;
  const step = plan[at];
  if (step.kind === 'approval') throw new Error('승인 단계는 requestApproval로 처리해야 해요.');
  const reason = feedback ?? undefined;
  const drafts = () => store.task(taskId).artifacts.filter((artifact) => artifact.kind === 'draft').length;
  const canLoop = Boolean(step.loop) && (store.task(taskId).loopCounts?.[step.id] ?? 0) < step.loop!.max;
  let loopReason: string | null = null;

  if (step.kind === 'brief') await briefStep(taskId, step, reason);
  else if (step.kind === 'research') await researchStep(taskId, step, reason);
  else if (step.kind === 'draft') {
    if (!(await draftStep(taskId, step, drafts() + 1, clarify, reason))) {
      const help = store.task(taskId).help;
      return { kind: 'needs_help', timeoutMs: Math.max(0, (help?.deadline ?? Date.now()) - Date.now()) };
    }
  } else if (step.kind === 'review') {
    const result = await reviewStep(taskId, step, drafts(), canLoop ? plan[step.loop!.to] : null);
    if (!result.approved && canLoop) loopReason = result.reason;
  }

  if (canLoop && step.kind !== 'review') {
    const check = await checkLoop(taskId, step);
    if (check.repeat) loopReason = check.reason;
  }
  if (loopReason !== null) {
    takeLoop(taskId, plan, at, loopReason);
    return { kind: 'next', at: step.loop!.to, feedback: loopReason };
  }
  const label = HANDOFF_LABEL[step.kind] ?? step.label;
  if (step.kind !== 'review') handOff(taskId, agentOfStep(store.task(taskId), step), agentOfStep(store.task(taskId), plan[at + 1]), label);
  return { kind: 'next', at: at + 1, feedback: null };
}

/** Records the user's change request and returns the draft step index the journey restarts from. */
export function applyChangeRequest(taskId: string, stepId: string, comment: string) {
  const task = store.task(taskId);
  const at = task.plan.findIndex((s) => s.id === stepId);
  const draftIndex = task.plan.findIndex((s) => s.kind === 'draft');
  const manager = agentOf(task, 'manager');
  if (task.status !== 'awaiting_approval') return draftIndex;
  store.updateTask(taskId, (t) => {
    t.userChangeRequests.push(comment);
    t.status = 'running';
    t.loopCounts = {};
    stepById(t, stepId).status = 'rejected';
    for (let i = draftIndex; i < at; i++) t.plan[i].status = 'pending';
    t.proposal = null;
    t.actions = [];
  });
  setAgent(manager, 'idle', 'normal', '수정 요청을 작성자에게 전달했어요.');
  store.emit('approval.denied', { taskId, agentId: manager.id, payload: { comment } });
  store.emit('task.handed_off', {
    taskId,
    agentId: manager.id,
    payload: { from: manager.id, to: agentOfStep(task, task.plan[draftIndex]).id, label: '수정 요청' },
  });
  return draftIndex;
}

const completing = new Set<string>();

/** Applies the approved result and runs the approved actions. A repeat call after completion does nothing. */
export async function completeTask(taskId: string, valueKrw?: number) {
  if (store.task(taskId).status === 'completed' || completing.has(taskId)) return;
  completing.add(taskId);
  try {
    await runActions(taskId);
    const task = store.task(taskId);
    const manager = agentOf(task, 'manager');
    const approval = task.plan.find((s) => s.kind === 'approval')!;
    setStep(taskId, approval.id, 'done');
    store.emit('approval.granted', { taskId, agentId: manager.id, payload: {} });
    recognizeValue(taskId, valueKrw);
    const { json } = splitDraft(latest(task, 'draft')?.content ?? '');
    const actions = store.task(taskId).actions ?? [];
    const done = actions.filter((a) => a.status === 'done').length;
    const missed = actions.filter((a) => a.status === 'failed' || a.status === 'unknown').length;
    const applied = [
      specOf(task).onApprove(json, store.task(taskId)),
      done ? `외부 작업 ${done}건 실행` : '',
      missed ? `외부 작업 ${missed}건 확인 필요` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    store.emit('team.applied', { taskId, agentId: manager.id, payload: { summary: applied } });
    finish(taskId, applied);
  } finally {
    completing.delete(taskId);
  }
}

export function failTask(taskId: string, reason: string) {
  const task = store.task(taskId);
  if (task.status === 'failed') return;
  const step = task.plan.find((s) => s.id === task.currentStepId);
  store.updateTask(taskId, (t) => {
    t.status = 'failed';
    t.failureReason = reason;
    t.help = null;
    const current = t.plan.find((s) => s.id === t.currentStepId);
    if (current) current.status = 'error';
  });
  const agent = step ? agentOfStep(task, step) : agentOf(task, 'manager');
  setAgent(agent, 'error', 'panic', `문제가 생겼어요: ${reason}`);
  store.emit('task.failed', { taskId, agentId: agent.id, payload: { reason } });
}

/** In-process wait for the user's decision; durable runtimes receive it as a signal instead. */
const approvalDecision = (taskId: string) => new Promise<ApprovalDecision>((resolve) => approvalWaiters.set(taskId, resolve));

async function runTask(taskId: string) {
  try {
    let { at, runs } = await prepareRun(taskId);
    let feedback: string | null = null;
    for (;;) {
      if (++runs > MAX_STEP_RUNS) throw new Error(tooManyRunsMessage);
      const step = store.task(taskId).plan[at];
      if (step.kind === 'approval') {
        await requestApproval(taskId, step.id);
        const decision = await approvalDecision(taskId);
        approvalWaiters.delete(taskId);
        if (decision.kind === 'approve') {
          await completeTask(taskId, decision.valueKrw);
          return;
        }
        at = applyChangeRequest(taskId, step.id, decision.comment);
        feedback = null;
        continue;
      }
      const outcome = await runStepAt(taskId, at, feedback);
      if (outcome.kind === 'needs_help') throw new Error('도움 요청 응답을 받지 못했어요.');
      ({ at, feedback } = outcome);
    }
  } catch (error) {
    failTask(taskId, error instanceof Error ? error.message : String(error));
  } finally {
    setTimeout(drainQueues, NEXT_TASK_DELAY_MS);
  }
}

const NEXT_TASK_DELAY_MS = 2500;

const activeTaskOf = (officeId: string) =>
  store.data.tasks.find((t) => t.officeId === officeId && ACTIVE.includes(t.status));

const queuedOf = (officeId: string) =>
  store.data.tasks.filter((t) => t.officeId === officeId && t.status === 'queued').reverse();

const sharesInbox = (team: TeamId) => team === 'hr' || team === 'support';

function canStart(officeId: string) {
  const office = store.office(officeId);
  if (activeTaskOf(office.id)) return false;
  if (!sharesInbox(office.team)) return true;
  return !store.data.offices.some((o) => o.team === office.team && activeTaskOf(o.id));
}

function startTask(taskId: string) {
  if (claimTask(taskId)) void runTask(taskId);
}

/** Marks a queued task running and gathers its inputs; false when it was skipped for lack of input. */
export function claimTask(taskId: string) {
  const task = store.task(taskId);
  const team = store.office(task.officeId).team;
  const spec = TEAM_SPECS[team];
  const inputs = spec.gatherInputs(task.description);
  store.updateTask(taskId, (t) => {
    t.status = 'running';
    t.inputText = inputs.text;
    t.inputIds = inputs.ids;
    if (t.autoTitle) t.title = inputs.ids.length > 1 ? `${spec.defaultTitle} (${inputs.ids.length}건)` : spec.defaultTitle;
  });
  store.emit('queue.started', { taskId, agentId: agentOf(task, 'manager').id, payload: { title: store.task(taskId).title } });
  if (TEAMS[team].inputLabel && inputs.ids.length === 0) {
    store.updateTask(taskId, (t) => {
      t.status = 'failed';
      t.failureReason = `${TEAMS[team].inputLabel}이(가) 없어서 건너뛰었어요.`;
    });
    store.emit('task.failed', { taskId, payload: { reason: store.task(taskId).failureReason } });
    return false;
  }
  return true;
}

export function drainQueues(start: (taskId: string) => void = (taskId) => void runTask(taskId)) {
  for (const office of store.data.offices) {
    while (canStart(office.id)) {
      const next = queuedOf(office.id)[0];
      if (!next) break;
      if (claimTask(next.id)) start(next.id);
    }
  }
}

export function resumeActiveTasks() {
  for (const task of store.data.tasks) {
    if (!ACTIVE.includes(task.status)) continue;
    store.emit('task.restored', { taskId: task.id, payload: { status: task.status, stepId: task.currentStepId } });
    void runTask(task.id);
  }
}

export function cancelTask(taskId: string) {
  const task = store.task(taskId);
  if (task.status !== 'queued') throw new Error('대기 중인 업무만 취소할 수 있어요.');
  store.mutate((s) => {
    s.tasks = s.tasks.filter((t) => t.id !== taskId);
  });
  store.emit('task.cancelled', { payload: { officeId: task.officeId, title: task.title } });
}

const MAX_QUEUE = 10;

function checkedPlan(officeId: string, steps: unknown) {
  if (!Array.isArray(steps)) throw new Error('업무 여정 형식이 올바르지 않아요.');
  const inputs: WorkflowStepInput[] = steps.map((s) => ({
    kind: s?.kind,
    label: String(s?.label ?? '').trim().slice(0, 20),
    agentId: s?.kind === 'approval' ? null : typeof s?.agentId === 'string' ? s.agentId : null,
    instructions: String(s?.instructions ?? '').trim().slice(0, 300),
    loop: parseLoop(s?.loop),
  }));
  const error = validatePlan(inputs, officeAgents(officeId));
  if (error) throw new Error(error);
  return inputs;
}

type TaskInput = {
  officeId: string;
  title?: string;
  description?: string;
  taskType?: string;
  planMode?: Task['planMode'];
  steps?: unknown;
  planNote?: string;
};

export function createTask(input: TaskInput) {
  const task = recordTask(input);
  if (canStart(task.officeId) && queuedOf(task.officeId).length === 1) startTask(task.id);
  return store.task(task.id);
}

/** Validates and stores a queued task without starting it. */
export function recordTask(input: TaskInput) {
  const office = store.office(input.officeId);
  if (queuedOf(office.id).length >= MAX_QUEUE) throw new Error(`${office.name}의 대기 업무가 ${MAX_QUEUE}건이 넘었어요. 몇 개 끝낸 뒤 추가해 주세요.`);

  const spec = TEAM_SPECS[office.team];
  const description = (input.description ?? '').trim();
  const title = input.title?.trim() ?? '';
  const taskType = taskTypeOf(office.team, input.taskType ?? '').id;
  const planMode = input.planMode === 'ai' || input.planMode === 'custom' ? input.planMode : 'template';
  const plan =
    planMode === 'custom' ? checkedPlan(office.id, input.steps) : templatePlan(office.team, taskType, officeAgents(office.id));
  const task: Task = {
    id: `task_${randomUUID().slice(0, 8)}`,
    officeId: office.id,
    title: title || spec.defaultTitle,
    autoTitle: !title,
    description,
    taskType,
    status: 'queued',
    plan: toSteps(plan),
    planMode,
    planNote: planMode === 'custom' ? String(input.planNote ?? '').slice(0, 300) : '',
    currentStepId: null,
    inputText: '',
    inputIds: [],
    artifacts: [],
    reviews: [],
    help: null,
    clarifications: [],
    userChangeRequests: [],
    proposal: null,
    costKrw: 0,
    costByAgent: {},
    value: null,
    failureReason: null,
    createdAt: now(),
    completedAt: null,
  };
  store.addTask(task);
  const startsNow = canStart(office.id) && queuedOf(office.id).length === 1;
  store.emit('task.created', {
    taskId: task.id,
    agentId: agentOf(task, 'manager').id,
    payload: { title: task.title, officeId: office.id, queued: !startsNow, planMode },
  });
  return store.task(task.id);
}

export function updatePlan(taskId: string, steps: unknown) {
  const task = store.task(taskId);
  if (task.status !== 'queued') throw new Error('대기 중인 업무의 여정만 바꿀 수 있어요.');
  const inputs = checkedPlan(task.officeId, steps);
  store.updateTask(taskId, (t) => {
    t.plan = toSteps(inputs);
    t.planMode = 'custom';
  });
  store.emit('workflow.updated', { taskId, payload: { steps: inputs.length, labels: inputs.map((s) => s.label) } });
  return store.task(taskId);
}

export function answerHelp(taskId: string, answer: string | null) {
  const waiter = helpWaiters.get(taskId);
  if (!waiter) throw new Error('도움을 기다리는 업무가 아닙니다.');
  waiter(answer);
}

export function approve(taskId: string, valueKrw?: number) {
  const waiter = approvalWaiters.get(taskId);
  if (!waiter) throw new Error('승인을 기다리는 업무가 아닙니다.');
  waiter({ kind: 'approve', valueKrw });
}

export function requestChanges(taskId: string, comment: string) {
  const waiter = approvalWaiters.get(taskId);
  if (!waiter) throw new Error('승인을 기다리는 업무가 아닙니다.');
  if (!comment.trim()) throw new Error('수정 요청 내용을 입력해 주세요.');
  waiter({ kind: 'changes', comment: comment.trim() });
}

/** Switches one proposed action on or off while the task waits for approval. Works for every runtime. */
export function setActionEnabled(taskId: string, actionId: string, enabled: boolean) {
  const task = store.task(taskId);
  if (task.status !== 'awaiting_approval' || completing.has(taskId)) throw new Error('승인을 기다리는 업무가 아닙니다.');
  const action = task.actions?.find((a) => a.id === actionId);
  if (!action || action.status !== 'proposed') throw new Error('바꿀 수 없는 외부 작업이에요.');
  store.updateTask(taskId, (t) => {
    const target = t.actions?.find((a) => a.id === actionId);
    if (target) target.enabled = enabled;
  });
  return store.task(taskId).actions?.find((a) => a.id === actionId);
}

export function setPaused(agentId: string, paused: boolean) {
  const agent = store.agent(agentId);
  store.updateAgent(agentId, {
    paused,
    status: paused ? 'paused' : agent.status === 'paused' ? 'idle' : agent.status,
    activity: paused ? '일시정지 중이에요. 지금 하던 호출이 끝나면 멈출게요.' : '다시 일할 준비가 됐어요.',
  });
  store.emit(paused ? 'task.paused' : 'task.resumed', { agentId, payload: {} });
}

export function simulateMail() {
  const mail = nextMail(store.data.mailbox);
  store.mutate((s) => {
    s.mailbox.unshift(mail);
    s.mailbox = s.mailbox.slice(0, 100);
  });
  store.emit('mail.received', { agentId: store.agentByRole('office_hr', 'researcher').id, payload: { subject: mail.subject } });
  return mail;
}

export function simulateInquiry() {
  const inquiry = nextInquiry(store.data.inquiries);
  store.mutate((s) => {
    s.inquiries.unshift(inquiry);
    s.inquiries = s.inquiries.slice(0, 100);
  });
  store.emit('inquiry.received', { agentId: store.agentByRole('office_support', 'researcher').id, payload: { subject: inquiry.subject } });
  return inquiry;
}

/** Offices with auto-run that are idle and have unprocessed input waiting. */
export function autoRunOffices() {
  return store.data.offices.filter((office) => {
    if (!office.autoRun || !canStart(office.id) || queuedOf(office.id).length > 0) return false;
    if (office.team === 'hr') return store.data.mailbox.some((m) => !m.processed);
    if (office.team === 'support') return store.data.inquiries.some((q) => q.status === 'new');
    return false;
  });
}

export const AUTO_RUN_DESCRIPTION = '자동 확인으로 시작된 업무';

export function autoRunTick() {
  for (const office of autoRunOffices()) {
    try {
      createTask({ officeId: office.id, description: AUTO_RUN_DESCRIPTION });
    } catch (error) {
      console.warn(`[auto-run] ${office.name}:`, error instanceof Error ? error.message : error);
    }
  }
}
