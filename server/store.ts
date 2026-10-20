import { randomUUID } from 'node:crypto';
import {
  DEFAULT_COMPANIES,
  DEFAULT_MODEL_BY_ROLE,
  DEFAULT_MODELS,
  isModelId,
  setCatalog,
  type Company,
  type ModelEntry,
} from '../shared/models.ts';
import type { McpServer } from '../shared/mcp.ts';
import { MAX_PERF_RECORDS, type ImprovementLog, type PerfRecord } from '../shared/performance.ts';
import { isPlan, type Plan } from '../shared/plans.ts';
import { freeSubscription, type Checkout, type Invoice, type Subscription } from '../shared/billing.ts';
import type { StoredMember } from './members.ts';
import { DEFAULT_PERSONALITY_BY_ROLE, isPersonality } from '../shared/personality.ts';
import { defaultMilestones } from '../shared/project.ts';
import { isAgentSkin } from '../shared/skins.ts';
import { adoptCompanyTheme, DEFAULT_THEME, type ThemeBooking } from '../shared/theme-pack.ts';
import { MAX_STAFF_PER_OFFICE, TEAM_ORDER, TEAMS } from '../shared/teams.ts';
import { DEFAULT_WORK_POLICY, freshDailyUsage, normalizeWorkPolicy } from '../shared/work-policy.ts';
import type {
  Agent,
  AiMode,
  AiTimeouts,
  ScheduledTask,
  Budget,
  CalendarEvent,
  ChatMessage,
  Inquiry,
  Interests,
  Mail,
  Office,
  OfficeEvent,
  OutboxReply,
  Recommendation,
  Role,
  SavedFlow,
  ShareLink,
  Snapshot,
  StepKind,
  StepStatus,
  Task,
  TeamId,
} from '../shared/types.ts';
import { reviewLoop, templatePlan } from '../shared/workflow.ts';
import { DEFAULT_LANGUAGE, isLanguage, viewerText, type Language } from '../shared/i18n.ts';
import { config, ORGANIZATION_SAFETY_RULES, type ProviderName } from './config.ts';
import { appendEvent, loadKv, loadRelationalState, maxSeq, onStorageConflict, recentEvents, saveKv, saveRelationalState } from './db.ts';
import { loginInfo } from './mcp-oauth.ts';
import { keyInfo, mcpSecretInfo } from './secrets.ts';
import { freeQuota } from './free-quota.ts';
import { renameMailPassword } from './secrets.ts';
import type { MailAccount } from '../shared/mail-providers.ts';
import { defaultInterests, initialInquiries, initialMails } from './seed.ts';

const PROJECT_ID = 'company_alpha';
const STATE_VERSION = 3;
/** Free models answer in 20–60 seconds without their thinking, but a busy one takes minutes. */
const FREE_TIMEOUT_SEC = 180;
const ROLES: Role[] = ['manager', 'researcher', 'writer', 'reviewer'];

export interface PersistedState {
  version: number;
  offices: Office[];
  agents: Agent[];
  tasks: Task[];
  budget: Budget;
  periodKey: string;
  mailbox: Mail[];
  calendar: CalendarEvent[];
  inquiries: Inquiry[];
  outbox: OutboxReply[];
  interests: Interests;
  recommendations: Recommendation[];
  shares: ShareLink[];
  companies: Company[];
  models: ModelEntry[];
  /** Built-in models deliberately removed by the owner; each can be restored from DEFAULT_MODELS. */
  removedBuiltinModelIds: string[];
  aiMode: AiMode;
  /** Seconds an AI call may take; null keeps the default. */
  aiTimeoutSec?: { paid: number | null; free: number | null };
  mcpServers: McpServer[];
  performance: PerfRecord[];
  improvements: ImprovementLog[];
  plan: Plan;
  members: StoredMember[];
  chat: ChatMessage[];
  billing: { subscription: Subscription; invoices: Invoice[]; checkouts: Checkout[]; processedEvents: string[] };
  language: Language;
  /** The theme every office shows unless it picked its own. */
  theme: string;
  /** Company themes booked for seasons (Halloween…), shown instead of `theme` on those dates. */
  themeBookings: ThemeBooking[];
  /** The theme for the page around the offices (top bar, tabs, panels); null follows the office being viewed. */
  siteTheme: string | null;
  /** The company's own logo as a data URL, for the top bar on the business plan. */
  companyLogo: string | null;
  flows: SavedFlow[];
  schedules: ScheduledTask[];
  mailAccounts: MailAccount[];
}

const freshBilling = (): PersistedState['billing'] => ({ subscription: freeSubscription(config.billingProvider), invoices: [], checkouts: [], processedEvents: [] });

function defaultOffices(): Office[] {
  return TEAM_ORDER.map((team) => ({
    id: `office_${team}`,
    team,
    name: TEAMS[team].name,
    autoRun: false,
    budgetKrw: null,
    spentKrw: 0,
    valueKrw: 0,
    milestones: defaultMilestones(team),
  }));
}

const EXTRA_NAMES = ['서연', '지호', '하린', '유나', '민준', '채원', '도현', '수아', '시우', '지안', '예준', '나은', '건우', '다인', '주원', '서아'];

function newAgent(office: Office, role: Role, id: string, name: string): Agent {
  return {
    id,
    officeId: office.id,
    name,
    role,
    model: DEFAULT_MODEL_BY_ROLE[role],
    rules: TEAMS[office.team].defaultRules[role],
    personality: DEFAULT_PERSONALITY_BY_ROLE[role],
    skin: 'pixel',
    status: 'idle',
    expression: 'normal',
    activity: viewerText('휴게실에서 쉬고 있어요. ☕'),
    paused: false,
    workPolicy: structuredClone(DEFAULT_WORK_POLICY),
    dailyUsage: freshDailyUsage(DEFAULT_WORK_POLICY),
    costKrw: 0,
    valueKrw: 0,
    tasksDone: 0,
  };
}

function defaultAgents(offices: Office[]): Agent[] {
  return offices.flatMap((office) =>
    ROLES.map((role) => newAgent(office, role, `agent_${office.team}_${role}`, TEAMS[office.team].agentNames[role])),
  );
}

const currentPeriodKey = () => new Date().toISOString().slice(0, 7);

function fresh(): PersistedState {
  const offices = defaultOffices();
  return {
    version: STATE_VERSION,
    offices,
    agents: defaultAgents(offices),
    tasks: [],
    budget: {
      monthlyKrw: config.monthlyBudgetKrw,
      hourlyRateKrw: config.hourlyRateKrw,
      spentKrw: 0,
      valueKrw: 0,
      warned80: false,
    },
    periodKey: currentPeriodKey(),
    mailbox: initialMails(),
    calendar: [],
    inquiries: initialInquiries(),
    outbox: [],
    interests: defaultInterests(),
    recommendations: [],
    shares: [],
    companies: structuredClone(DEFAULT_COMPANIES),
    models: structuredClone(DEFAULT_MODELS),
    removedBuiltinModelIds: [],
    // An OpenRouter key is enough to boot directly into the free per-agent setup.
    aiMode: config.keys.openrouter ? 'agents' : 'env',
    mcpServers: [],
    performance: [],
    improvements: [],
    plan: 'personal',
    members: [],
    chat: [],
    billing: freshBilling(),
    language: DEFAULT_LANGUAGE,
    theme: DEFAULT_THEME,
    themeBookings: [],
    siteTheme: null,
    companyLogo: null,
    flows: [],
    schedules: [],
    mailAccounts: [],
  };
}

function fillCatalog(state: PersistedState) {
  state.companies ??= [];
  state.models ??= [];
  state.removedBuiltinModelIds ??= [];
  state.aiMode ??= 'env';
  state.mcpServers ??= [];
  // Added after v3 shipped, so old rows simply lack it. Do not bump STATE_VERSION for this.
  if (!isLanguage(state.language)) state.language = DEFAULT_LANGUAGE;
  for (const tool of state.mcpServers.flatMap((server) => server.tools)) {
    tool.mode ??= tool.enabled ? 'auto' : 'off';
    delete tool.enabled;
  }
  for (const company of DEFAULT_COMPANIES) {
    if (!state.companies.some((c) => c.id === company.id)) state.companies.push(structuredClone(company));
  }
  for (const model of DEFAULT_MODELS) {
    if (!state.removedBuiltinModelIds.includes(model.id) && !state.models.some((m) => m.id === model.id)) state.models.push(structuredClone(model));
  }
}

type LegacyStepId = 'intake' | 'research' | 'write' | 'review' | 'approval';
type LegacyTask = Task & { steps?: Record<LegacyStepId, StepStatus>; currentStep?: LegacyStepId | 'done' };

const LEGACY_STEPS: [LegacyStepId, StepKind][] = [
  ['intake', 'brief'],
  ['research', 'research'],
  ['write', 'draft'],
  ['review', 'review'],
  ['approval', 'approval'],
];

function migrateTask(task: LegacyTask, state: PersistedState) {
  if (task.plan) return;
  const office = state.offices.find((o) => o.id === task.officeId);
  const agents = state.agents.filter((a) => a.officeId === task.officeId);
  const template = office ? templatePlan(office.team, task.taskType, agents) : [];
  task.plan = LEGACY_STEPS.map(([legacy, kind], i) => {
    const base = template.find((s) => s.kind === kind) ?? { kind, label: legacy, agentId: null, instructions: '' };
    return { ...base, loop: undefined, id: `st_${task.id}_${i}`, status: task.steps?.[legacy] ?? 'pending' };
  });
  const current = LEGACY_STEPS.findIndex(([legacy]) => legacy === task.currentStep);
  task.currentStepId = current >= 0 ? task.plan[current].id : null;
  task.planMode = 'template';
  task.planNote = '';
  delete task.steps;
  delete task.currentStep;
}

function load(): PersistedState {
  const saved = loadRelationalState<PersistedState>() ?? loadKv<PersistedState>('state');
  if (!saved) return fresh();
  if (saved.version === 2) {
    saved.shares = [];
    for (const task of saved.tasks) migrateTask(task, saved);
    saved.version = STATE_VERSION;
  }
  if (saved.version !== STATE_VERSION) return fresh();
  return normalize(saved);
}

/**
 * Mailboxes became per office: older mail belongs to the first mail office, and an office's one account joins the
 * list. The account keeps what it already read (or the next fetch brings the same messages back under new ids) and
 * its mail keeps a way back to the real mailbox (or approving a report can't label it).
 */
export function adoptOfficeMailAccounts(saved: Pick<PersistedState, 'offices' | 'mailbox' | 'mailAccounts'>) {
  saved.mailAccounts ??= [];
  const firstMailOffice = saved.offices.find((o) => o.team === 'hr')?.id ?? 'office_hr';
  for (const mail of saved.mailbox) mail.officeId ??= firstMailOffice;
  for (const office of saved.offices as (Office & { mailAccount?: Omit<MailAccount, 'id' | 'officeId'> })[]) {
    if (!office.mailAccount) continue;
    const id = `mail_${office.id}`;
    const { user, host, port } = office.mailAccount;
    saved.mailAccounts.push({ id, officeId: office.id, ...office.mailAccount });
    renameMailPassword(office.id, id);
    const seen = loadKv<string[]>(`mail_seen_${office.id}_${user}@${host}:${port}`);
    if (seen && !loadKv(`mail_seen_${id}`)) saveKv(`mail_seen_${id}`, seen);
    for (const mail of saved.mailbox) {
      if (mail.officeId === office.id && mail.remote && !mail.remote.accountId) mail.remote.accountId = id;
    }
    delete office.mailAccount;
  }
}

function normalize(saved: PersistedState) {
  fillCatalog(saved);
  if (typeof saved.theme !== 'string') saved.theme = adoptCompanyTheme(saved.offices);
  saved.themeBookings ??= [];
  saved.siteTheme ??= null;
  saved.companyLogo ??= null;
  saved.flows ??= [];
  saved.schedules ??= [];
  adoptOfficeMailAccounts(saved);
  saved.performance ??= [];
  saved.improvements ??= [];
  if (!isPlan(saved.plan)) saved.plan = 'personal';
  saved.members ??= [];
  saved.chat ??= [];
  saved.billing ??= freshBilling();
  for (const agent of saved.agents) {
    if (!isPersonality(agent.personality)) agent.personality = DEFAULT_PERSONALITY_BY_ROLE[agent.role];
    agent.workPolicy = normalizeWorkPolicy(agent.workPolicy);
    agent.dailyUsage ??= freshDailyUsage(agent.workPolicy);
  }
  for (const office of saved.offices) office.milestones ??= defaultMilestones(office.team);
  for (const task of saved.tasks) {
    for (const step of task.plan) {
      if (step.loop === undefined) step.loop = step.kind === 'review' ? reviewLoop(task.plan) : null;
    }
  }
  return saved;
}

type Listener = (message: { kind: 'event'; data: OfficeEvent } | { kind: 'snapshot'; data: Snapshot }) => void;

class Store {
  private state: PersistedState = load();
  private seq = maxSeq();
  private listeners = new Set<Listener>();
  private snapshotScheduled = false;

  constructor() {
    onStorageConflict((state) => {
      this.state = normalize(state as unknown as PersistedState);
      this.changed();
    });
    setCatalog(this.state.companies, this.state.models);
    for (const agent of this.state.agents) {
      if (!isModelId(agent.model)) agent.model = DEFAULT_MODEL_BY_ROLE[agent.role];
      // Theme characters (`<theme>:<character>`) survive restarts; a removed theme just draws the default look.
      if (!isAgentSkin(agent.skin)) agent.skin = 'pixel';
      agent.status = agent.paused ? 'paused' : 'idle';
      agent.expression = 'normal';
      agent.activity = viewerText(agent.paused ? '일시정지 중이에요.' : '휴게실에서 쉬고 있어요. ☕');
    }
    this.rollPeriodIfNeeded();
    this.persist();
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get aiTimeouts(): AiTimeouts {
    const paid = Math.round(config.aiTimeoutMs / 1000);
    const defaults = { paidSec: paid, freeSec: Math.max(paid, FREE_TIMEOUT_SEC) };
    const saved = this.state.aiTimeoutSec;
    return { paidSec: saved?.paid ?? defaults.paidSec, freeSec: saved?.free ?? defaults.freeSec, defaults };
  }

  /** AI_PROVIDER from .env unless the model settings page overrides it. */
  get provider(): ProviderName {
    return this.state.aiMode === 'env' ? config.provider : this.state.aiMode;
  }

  snapshot(): Snapshot {
    const s = this.state;
    const provider = this.provider;
    return {
      viewer: { kind: 'owner' },
      shares: s.shares,
      publicUrl: config.publicUrl || undefined,
      siteUrl: config.siteUrl || undefined,
      companyName: '알파 AI 컴퍼니',
      theme: s.theme,
      themeBookings: s.themeBookings,
      siteTheme: s.siteTheme,
      companyLogo: s.companyLogo,
      flows: s.flows,
      schedules: s.schedules,
      mailAccounts: s.mailAccounts,
      provider,
      model: provider === 'mock' || provider === 'agents' ? '직원별 모델' : config.model,
      aiMode: s.aiMode,
      aiTimeouts: this.aiTimeouts,
      envProvider: config.provider,
      companies: s.companies.map((c) => ({ ...c, key: keyInfo(c) })),
      models: s.models,
      freeQuota: freeQuota(),
      mcpServers: s.mcpServers.map((m) => ({ ...m, secrets: mcpSecretInfo(m.id), login: m.oauth ? loginInfo(m.id) : undefined })),
      mcpStdioAllowed: config.mcpAllowStdio,
      offices: s.offices,
      agents: s.agents,
      tasks: s.tasks,
      budget: s.budget,
      mailbox: s.mailbox,
      calendar: s.calendar,
      inquiries: s.inquiries,
      outbox: s.outbox,
      interests: s.interests,
      recommendations: s.recommendations,
      performance: s.performance,
      improvements: s.improvements,
      plan: s.plan,
      members: s.members.map(({ passwordHash: _hash, sessionVersion: _version, ...member }) => member),
      people: [
        { id: 'owner', name: '소유자', officeIds: 'all' as const },
        ...s.members.filter((m) => !m.disabled).map((m) => ({ id: m.id, name: m.name, officeIds: m.officeIds })),
      ],
      chat: s.chat,
      safetyRules: ORGANIZATION_SAFETY_RULES,
      helpTimeoutSec: config.helpTimeoutSec,
      language: s.language,
      seq: this.seq,
    };
  }

  get data(): Readonly<PersistedState> {
    return this.state;
  }

  recentEvents(limit = 300) {
    return recentEvents(limit);
  }

  get budget() {
    return this.state.budget;
  }

  office(id: string) {
    const office = this.state.offices.find((o) => o.id === id);
    if (!office) throw new Error(`알 수 없는 사무실입니다: ${id}`);
    return office;
  }

  agent(id: string) {
    const agent = this.state.agents.find((a) => a.id === id);
    if (!agent) throw new Error(`unknown agent ${id}`);
    return agent;
  }

  agentByRole(officeId: string, role: Role) {
    const agent = this.state.agents.find((a) => a.officeId === officeId && a.role === role);
    if (!agent) throw new Error(`no agent for role ${role} in ${officeId}`);
    return agent;
  }

  task(id: string) {
    const task = this.state.tasks.find((t) => t.id === id);
    if (!task) throw new Error(`unknown task ${id}`);
    return task;
  }

  addTask(task: Task) {
    this.state.tasks.unshift(task);
    this.state.tasks = this.state.tasks.slice(0, 200);
    this.changed();
  }

  updateAgent(id: string, patch: Partial<Agent>) {
    Object.assign(this.agent(id), patch);
    this.changed();
  }

  hireAgent(officeId: string, role: Role, name?: string) {
    const office = this.office(officeId);
    const staff = this.state.agents.filter((a) => a.officeId === officeId);
    if (staff.length >= MAX_STAFF_PER_OFFICE) throw new Error(`한 사무실에는 최대 ${MAX_STAFF_PER_OFFICE}명까지 일할 수 있어요.`);
    const used = new Set(this.state.agents.map((a) => a.name));
    const fallback = EXTRA_NAMES.find((n) => !used.has(n)) ?? `${TEAMS[office.team].roleTitles[role]} ${staff.length + 1}`;
    const agent = newAgent(office, role, `agent_${office.id}_${role}_${randomUUID().slice(0, 6)}`, name?.trim().slice(0, 20) || fallback);
    const last = this.state.agents.findLastIndex((a) => a.officeId === officeId);
    this.state.agents.splice(last + 1, 0, agent);
    this.changed();
    return agent;
  }

  fireAgent(id: string) {
    const agent = this.agent(id);
    const peer = this.state.agents.find((a) => a.officeId === agent.officeId && a.role === agent.role && a.id !== id);
    if (!peer) throw new Error('이 역할을 맡은 마지막 직원이라 내보낼 수 없어요. 같은 역할의 직원을 먼저 고용해 주세요.');
    const tasks = this.state.tasks.filter((t) => t.officeId === agent.officeId);
    const busy = tasks.some(
      (t) => !['queued', 'completed', 'failed'].includes(t.status) && t.plan.some((s) => s.agentId === id && s.status !== 'done'),
    );
    if (busy) throw new Error(`${agent.name} 님이 진행 중인 업무를 맡고 있어요. 업무가 끝난 뒤에 내보낼 수 있어요.`);
    for (const t of tasks) {
      if (t.status !== 'queued') continue;
      for (const s of t.plan) if (s.agentId === id) s.agentId = peer.id;
    }
    this.state.agents = this.state.agents.filter((a) => a.id !== id);
    this.changed();
    return agent;
  }

  addOffice(team: TeamId, name: string) {
    const office: Office = {
      id: `office_${team}_${randomUUID().slice(0, 6)}`,
      team,
      name,
      custom: true,
      autoRun: false,
      budgetKrw: null,
      spentKrw: 0,
      valueKrw: 0,
      milestones: defaultMilestones(team),
    };
    const used = new Set(this.state.agents.map((a) => a.name));
    const pool = EXTRA_NAMES.filter((n) => !used.has(n));
    this.state.offices.push(office);
    ROLES.forEach((role, i) => {
      const name = pool[i] ?? `${TEAMS[team].roleTitles[role]} ${this.state.agents.length + 1}`;
      this.state.agents.push(newAgent(office, role, `agent_${office.id}_${role}`, name));
    });
    this.changed();
    return office;
  }

  removeOffice(id: string) {
    const office = this.office(id);
    if (!office.custom) throw new Error('기본 사무실은 닫을 수 없어요.');
    this.state.offices = this.state.offices.filter((o) => o.id !== id);
    this.state.agents = this.state.agents.filter((a) => a.officeId !== id);
    this.state.tasks = this.state.tasks.filter((t) => t.officeId !== id);
    this.state.performance = this.state.performance.filter((r) => r.officeId !== id);
    this.state.improvements = this.state.improvements.filter((i) => i.officeId !== id);
    this.state.schedules = this.state.schedules.filter((s) => s.officeId !== id);
    this.state.mailbox = this.state.mailbox.filter((m) => m.officeId !== id);
    this.state.mailAccounts = this.state.mailAccounts.filter((a) => a.officeId !== id);
    this.changed();
  }

  updateOffice(id: string, mutate: (office: Office) => void) {
    mutate(this.office(id));
    this.changed();
  }

  updateTask(id: string, mutate: (task: Task) => void) {
    mutate(this.task(id));
    this.changed();
  }

  addPerf(record: PerfRecord) {
    this.state.performance.unshift(record);
    this.state.performance = this.state.performance.slice(0, MAX_PERF_RECORDS);
    this.changed();
  }

  updatePerf(taskId: string, mutate: (record: PerfRecord) => void) {
    for (const record of this.state.performance) if (record.taskId === taskId) mutate(record);
    this.changed();
  }

  updateBudget(mutate: (budget: Budget) => void) {
    mutate(this.state.budget);
    this.changed();
  }

  mutate(fn: (state: PersistedState) => void) {
    fn(this.state);
    this.changed();
  }

  emit(type: string, opts: { taskId?: string; agentId?: string; payload?: Record<string, unknown> } = {}) {
    this.rollPeriodIfNeeded();
    const event: OfficeEvent = {
      eventId: `evt_${randomUUID()}`,
      seq: ++this.seq,
      type,
      timestamp: new Date().toISOString(),
      projectId: PROJECT_ID,
      taskId: opts.taskId,
      agentId: opts.agentId,
      payload: opts.payload ?? {},
    };
    appendEvent(event);
    for (const listener of this.listeners) listener({ kind: 'event', data: event });
    this.changed();
    return event;
  }

  private rollPeriodIfNeeded() {
    const key = currentPeriodKey();
    if (this.state.periodKey === key) return;
    this.state.periodKey = key;
    Object.assign(this.state.budget, { spentKrw: 0, valueKrw: 0, warned80: false });
    for (const office of this.state.offices) Object.assign(office, { spentKrw: 0, valueKrw: 0 });
    for (const agent of this.state.agents) Object.assign(agent, { costKrw: 0, valueKrw: 0, tasksDone: 0 });
  }

  private changed() {
    setCatalog(this.state.companies, this.state.models);
    this.persist();
    this.announce();
  }

  /** Sends viewers a fresh snapshot; also for what the snapshot shows from outside the store (free-model requests). */
  announce() {
    if (this.snapshotScheduled) return;
    this.snapshotScheduled = true;
    setImmediate(() => {
      this.snapshotScheduled = false;
      const snap = this.snapshot();
      for (const listener of this.listeners) listener({ kind: 'snapshot', data: snap });
    });
  }

  private persist() {
    saveRelationalState(this.state as unknown as import('./db.ts').RelationalStateShape);
  }
}

export const store = new Store();
