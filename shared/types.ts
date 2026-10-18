import type { TaskDesigns } from './design.ts';
import type { McpServer, PlannedAction } from './mcp.ts';
import type { ImprovementLog, PerfRecord } from './performance.ts';
import type { Personality } from './personality.ts';
import type { Plan } from './plans.ts';
import type { BillingInfo } from './billing.ts';
import type { Company, ModelEntry } from './models.ts';
import type { AgentSkin, Skin } from './skins.ts';
import type { Language } from './i18n.ts';
import type { ThemeBooking } from './theme-pack.ts';
import type { FlowPack } from './flow-pack.ts';

/** 'env' follows AI_PROVIDER in .env; the others override it from the model settings page. */
export type AiMode = 'env' | 'mock' | 'agents';

/** How long one AI call may take, in seconds; free models get longer since they run slowly on shared hardware. */
export interface AiTimeouts {
  paidSec: number;
  freeSec: number;
  /** What each falls back to when the owner clears it (.env AI_TIMEOUT_MS, and at least 3 minutes for free models). */
  defaults: { paidSec: number; freeSec: number };
}

/** Bounds for both limits, in seconds. */
export const AI_TIMEOUT_RANGE = { min: 30, max: 1800 } as const;

export type Role = 'manager' | 'researcher' | 'writer' | 'reviewer';

export type TeamId = 'dev' | 'hr' | 'mgmt' | 'support' | 'welfare';

export type AgentStatus =
  | 'idle'
  | 'waiting'
  | 'working'
  | 'collaborating'
  | 'awaiting_approval'
  | 'help_requested'
  | 'paused'
  | 'off_duty'
  | 'capacity_exhausted'
  | 'error';

export type Expression = 'normal' | 'smile' | 'focus' | 'sweat' | 'troubled' | 'panic' | 'thanks' | 'celebrate';

export type { AgentSkin, Skin };

export interface Office {
  id: string;
  team: TeamId;
  name: string;
  custom?: boolean;
  /** Shown under the tabs instead of the team's standard description. */
  description?: string;
  autoRun: boolean;
  /** Applies safe improvement suggestions by itself after each completed task. */
  autoImprove?: boolean;
  budgetKrw: number | null;
  spentKrw: number;
  valueKrw: number;
  /** Fixed project scope used for a stable, meaningful completion percentage. */
  milestones?: ProjectMilestone[];
  /** A theme for this office only; missing follows the company theme (`Snapshot.theme`). */
  theme?: string;
  /** false turns off the theme's custom CSS here; its pictures and colors stay. */
  themeCss?: boolean;
}

export interface ProjectMilestone {
  id: string;
  label: string;
  /** Share of the whole project. Milestone weights are normalized when calculated. */
  weight: number;
}

export interface Agent {
  id: string;
  officeId: string;
  name: string;
  /** Web only: the stored name when `name` shows a default name translated for the viewer. */
  sourceName?: string;
  role: Role;
  model: string;
  rules: string;
  /** Default working style added to every prompt of this agent. */
  personality: Personality;
  skin: AgentSkin;
  /** Outfit id picked for the theme character; characters without that outfit wear their usual clothes. */
  outfit?: string;
  status: AgentStatus;
  expression: Expression;
  activity: string;
  paused: boolean;
  workPolicy: WorkPolicy;
  dailyUsage: DailyAgentUsage;
  costKrw: number;
  valueKrw: number;
  tasksDone: number;
}

export interface WorkPolicy {
  enabled: boolean;
  /** IANA time zone used for work days and resetting daily limits. */
  timezone: string;
  /** Sunday=0 ... Saturday=6. */
  days: number[];
  start: string;
  end: string;
  /** null disables the corresponding daily limit. */
  maxTokens: number | null;
  maxWorkMinutes: number | null;
}

export interface DailyAgentUsage {
  /** Calendar date in the policy time zone. */
  date: string;
  tokens: number;
  workMs: number;
}

/** Labels of a team's default journey; `done` names the archive the result lands in. */
export type StepId = 'intake' | 'research' | 'write' | 'review' | 'approval' | 'done';

export type StepStatus = 'pending' | 'running' | 'done' | 'error' | 'awaiting' | 'rejected' | 'looped';

export type StepKind = 'brief' | 'research' | 'draft' | 'review' | 'approval';

/** Go back to an earlier step (or repeat this one) while `when` holds, at most `max` times. */
export interface StepLoop {
  /** Index into the plan; must not be after the step that owns the loop. */
  to: number;
  when: string;
  max: number;
}

export interface WorkflowStepInput {
  kind: StepKind;
  label: string;
  /** null only for the approval step, which belongs to the user. */
  agentId: string | null;
  instructions: string;
  /** A review without a loop only leaves its opinion and the journey moves on. */
  loop?: StepLoop | null;
}

export interface WorkflowStep extends WorkflowStepInput {
  id: string;
  status: StepStatus;
}

export type PlanMode = 'template' | 'ai' | 'custom';

export type TaskStatus = 'queued' | 'running' | 'awaiting_help' | 'awaiting_approval' | 'completed' | 'failed';

export interface FlowTemplateStep {
  kind: StepKind;
  label: string;
  role: Role | null;
  /** Reviews get a loop back to the draft by default; `null` turns that off. */
  loop?: StepLoop | null;
}

/** A work journey kept for reuse: one of mine, from a file, or installed from the community. */
export interface SavedFlow {
  id: string;
  source: 'mine' | 'file' | 'community';
  /** The community item it came from, so installing again replaces it. */
  itemId?: string;
  flow: FlowPack;
  savedAt: string;
}

export interface TaskTypeEntry {
  id: string;
  label: string;
  standardHours: number;
  hoursPerItem?: number;
  /** Journey shortcut for this type; falls back to the team's stepLabels. */
  flow?: FlowTemplateStep[];
}

export interface Artifact {
  id: string;
  agentId: string;
  stepId?: string;
  kind: 'brief' | 'research' | 'draft';
  title: string;
  content: string;
  version: number;
  createdAt: string;
}

export interface Review {
  agentId: string;
  approved: boolean;
  score: number;
  reason: string;
  at: string;
}

export interface HelpRequest {
  id: string;
  agentId: string;
  question: string;
  options: string[];
  assumption: string;
  deadline: number;
}

export interface ValueBreakdown {
  baseKrw: number;
  qualityMultiplier: number;
  userMultiplier: number;
  estimatedKrw: number;
  recognizedKrw: number;
  userEdited: boolean;
}

export interface Proposal {
  headline: string;
  lines: string[];
}

export interface Task {
  id: string;
  officeId: string;
  title: string;
  autoTitle?: boolean;
  description: string;
  taskType: string;
  /** Project milestone this task advances. Missing means explicitly unclassified. */
  milestoneId?: string | null;
  status: TaskStatus;
  plan: WorkflowStep[];
  planMode: PlanMode;
  planNote: string;
  currentStepId: string | null;
  /** How many times each step's loop has been taken in the current round. */
  loopCounts?: Record<string, number>;
  inputText: string;
  inputIds: string[];
  artifacts: Artifact[];
  reviews: Review[];
  help: HelpRequest | null;
  clarifications: string[];
  userChangeRequests: string[];
  /** Chat messages people chose to hand to the AI staff; later research and drafts take them into account. */
  chatNotes?: ChatNote[];
  proposal: Proposal | null;
  /** External tool calls proposed with the latest draft, run on approval. */
  actions?: PlannedAction[];
  /** MCP tool calls made for this task, research and approved actions together. */
  toolCalls?: number;
  /** The person in charge (business plan): 'owner' or a member id. */
  assigneeId?: string | null;
  costKrw: number;
  costByAgent: Record<string, number>;
  value: ValueBreakdown | null;
  failureReason: string | null;
  /** AI layouts for exports, each tied to the draft version it was made from. */
  designs?: TaskDesigns;
  createdAt: string;
  completedAt: string | null;
}

export interface Mail {
  id: string;
  from: string;
  subject: string;
  body: string;
  receivedAt: string;
  processed: boolean;
  mockEvent?: { title: string; date: string; start: string; end: string; location: string };
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  start: string;
  end: string;
  location: string;
  source: string;
}

export interface Inquiry {
  id: string;
  customer: string;
  subject: string;
  body: string;
  receivedAt: string;
  status: 'new' | 'reply_ready';
  mockCategory?: string;
}

export interface OutboxReply {
  id: string;
  inquiryId: string;
  to: string;
  subject: string;
  body: string;
  category: string;
  urgency: string;
  approvedAt: string;
}

export interface Interests {
  keywords: string[];
  region: string;
  note: string;
}

export interface Recommendation {
  id: string;
  kind: 'event' | 'youtube' | 'activity' | 'rest';
  title: string;
  reason: string;
  link: string;
  createdAt: string;
}

export interface Budget {
  monthlyKrw: number;
  hourlyRateKrw: number;
  spentKrw: number;
  valueKrw: number;
  warned80: boolean;
}

export interface OfficeEvent {
  eventId: string;
  seq: number;
  type: string;
  timestamp: string;
  projectId: string;
  taskId?: string;
  agentId?: string;
  payload: Record<string, unknown>;
}

export type ShareRole = 'viewer' | 'operator' | 'manager';

export interface ShareLink {
  id: string;
  token: string;
  name: string;
  role: ShareRole;
  officeIds: string[] | 'all';
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
}

/** A person with their own login. Permissions reuse the share roles and office scopes. */
export interface Member {
  id: string;
  loginId: string;
  name: string;
  role: ShareRole;
  officeIds: string[] | 'all';
  disabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface Person {
  /** 'owner' or a member id. */
  id: string;
  name: string;
  officeIds: string[] | 'all';
}

export type Viewer =
  | { kind: 'owner' }
  | { kind: 'share'; shareId: string; name: string; role: ShareRole; officeIds: string[] | 'all' }
  | { kind: 'member'; memberId: string; name: string; role: ShareRole; officeIds: string[] | 'all' };

export interface ChatMessage {
  id: string;
  /** 'company', 'office:<id>' or 'task:<id>'. */
  channel: string;
  author: { kind: 'owner' | 'member' | 'system'; id: string; name: string };
  text: string;
  /** Shows the task as a card under the text. */
  taskId?: string;
  at: string;
  /** Set once the message was handed to the AI staff of a task. */
  forwarded?: { mode: ForwardMode; taskId: string; by: string; at: string };
}

/** note: reference for the remaining steps, answer: reply to a help request, changes: change request on an awaiting draft. */
export type ForwardMode = 'note' | 'answer' | 'changes';

export interface ChatNote {
  messageId: string;
  author: string;
  text: string;
  at: string;
}

/** Today's requests to OpenRouter's free models against the account's daily allowance. */
export interface FreeQuota {
  used: number;
  limit: number;
  /** When the count starts over (00:00 UTC). */
  resetsAt: string;
  /** When OpenRouter last reported the count; null while it is the office's own estimate. */
  checkedAt: string | null;
}

export interface Snapshot {
  viewer: Viewer;
  /** Owner only. */
  shares?: ShareLink[];
  plan: Plan;
  /** Owner only. */
  billing?: BillingInfo;
  /** Owner only. */
  members?: Member[];
  /** Everyone who can be named as a task's person in charge: 'owner' and active members, with the offices they see. */
  people: Person[];
  /** Messages this viewer may read. */
  chat: ChatMessage[];
  /** Owner only: base address to put in share links. */
  publicUrl?: string;
  /** The project site (SITE_URL): community and plan sales. */
  siteUrl?: string;
  companyName: string;
  /** The theme every office shows unless it picked its own. */
  theme: string;
  /** Company themes booked for seasons, shown instead of `theme` on those dates. */
  themeBookings: ThemeBooking[];
  /** The theme for the page around the offices; null follows the office being viewed. */
  siteTheme: string | null;
  /** The company's own logo (data URL) shown in the top bar on the business plan; null shows the product's. */
  companyLogo: string | null;
  /** Work journeys saved for reuse when making a task. */
  flows: SavedFlow[];
  provider: string;
  model: string;
  /** Owner only. */
  aiMode?: AiMode;
  /** Owner only. */
  aiTimeouts?: AiTimeouts;
  /** Owner only: AI_PROVIDER from .env. */
  envProvider?: string;
  companies: Company[];
  models: ModelEntry[];
  freeQuota: FreeQuota;
  /** Owner only. */
  mcpServers?: McpServer[];
  /** Owner only: MCP_ALLOW_STDIO is on. */
  mcpStdioAllowed?: boolean;
  offices: Office[];
  agents: Agent[];
  tasks: Task[];
  budget: Budget;
  mailbox: Mail[];
  calendar: CalendarEvent[];
  inquiries: Inquiry[];
  outbox: OutboxReply[];
  interests: Interests;
  recommendations: Recommendation[];
  performance: PerfRecord[];
  improvements: ImprovementLog[];
  safetyRules: string[];
  helpTimeoutSec: number;
  /** Display language for the web UI. Tenant-wide, so shared viewers see it too. */
  language?: Language;
  seq: number;
}

export type ServerMessage =
  | { kind: 'snapshot'; data: Snapshot }
  | { kind: 'event'; data: OfficeEvent; replay: boolean };
