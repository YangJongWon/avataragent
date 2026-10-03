import type { Skin } from './skins.ts';

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
  | 'error';

export type Expression = 'normal' | 'smile' | 'focus' | 'sweat' | 'troubled' | 'panic' | 'thanks' | 'celebrate';

export type { Skin };

export interface Office {
  id: string;
  team: TeamId;
  name: string;
  custom?: boolean;
  autoRun: boolean;
  budgetKrw: number | null;
  spentKrw: number;
  valueKrw: number;
}

export interface Agent {
  id: string;
  officeId: string;
  name: string;
  role: Role;
  model: string;
  rules: string;
  skin: Skin;
  status: AgentStatus;
  expression: Expression;
  activity: string;
  paused: boolean;
  costKrw: number;
  valueKrw: number;
  tasksDone: number;
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
  proposal: Proposal | null;
  costKrw: number;
  costByAgent: Record<string, number>;
  value: ValueBreakdown | null;
  failureReason: string | null;
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

export type Viewer =
  | { kind: 'owner' }
  | { kind: 'share'; shareId: string; name: string; role: ShareRole; officeIds: string[] | 'all' };

export interface Snapshot {
  viewer: Viewer;
  /** Owner only. */
  shares?: ShareLink[];
  /** Owner only: base address to put in share links. */
  publicUrl?: string;
  companyName: string;
  provider: string;
  model: string;
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
  safetyRules: string[];
  helpTimeoutSec: number;
  seq: number;
}

export type ServerMessage =
  | { kind: 'snapshot'; data: Snapshot }
  | { kind: 'event'; data: OfficeEvent; replay: boolean };
