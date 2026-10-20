import { randomUUID } from 'node:crypto';
import { isTimeZone, MAX_SCHEDULES_PER_OFFICE, nextRunAfter, parseRepeat } from '../shared/schedule.ts';
import type { PlanMode, ScheduledTask, Task, WorkflowStepInput } from '../shared/types.ts';
import { agentAvailability } from '../shared/work-policy.ts';
import { importMail } from './mail-sync.ts';
import { store } from './store.ts';
import { V } from './text.ts';
import type { CreateTaskInput } from './workflow-runtime.ts';

/**
 * Tasks offices put on their board by themselves at set times. A due schedule creates an ordinary task (queued when the
 * office is busy; staff off duty pick it up when they are back), then moves on to its next time. Offices that work on
 * incoming items read them first (a mail office fetches its mail) and put nothing on the board when nothing is new.
 */
type Create = (input: CreateTaskInput) => Promise<Task>;

const PLAN_MODES: PlanMode[] = ['template', 'ai', 'custom'];

export function scheduleOf(id: string) {
  const schedule = store.data.schedules.find((s) => s.id === id);
  if (!schedule) throw new Error('알 수 없는 예약 업무예요.');
  return schedule;
}

const nextFrom = (s: Pick<ScheduledTask, 'repeat' | 'timeZone' | 'createdAt'>, after: Date) =>
  nextRunAfter(s.repeat, s.timeZone, after, new Date(s.createdAt))?.toISOString() ?? null;

function checkedFields(body: Record<string, unknown>) {
  const repeat = parseRepeat(body.repeat);
  if (typeof repeat === 'string') throw new Error(repeat);
  const timeZone = isTimeZone(body.timeZone) ? body.timeZone : 'Asia/Seoul';
  return { repeat, timeZone };
}

export function createSchedule(body: Record<string, unknown>): ScheduledTask {
  const office = store.office(String(body.officeId ?? ''));
  if (store.data.schedules.filter((s) => s.officeId === office.id).length >= MAX_SCHEDULES_PER_OFFICE) {
    throw new Error(`예약 업무는 사무실마다 ${MAX_SCHEDULES_PER_OFFICE}개까지 만들 수 있어요.`);
  }
  const { repeat, timeZone } = checkedFields(body);
  const now = new Date();
  const planMode = PLAN_MODES.includes(body.planMode as PlanMode) ? (body.planMode as PlanMode) : 'template';
  const schedule: ScheduledTask = {
    id: `sch_${randomUUID().slice(0, 8)}`,
    officeId: office.id,
    title: String(body.title ?? '').trim().slice(0, 60),
    description: String(body.description ?? '').trim().slice(0, 2000),
    taskType: String(body.taskType ?? ''),
    planMode,
    ...(planMode === 'custom' && Array.isArray(body.steps) ? { steps: body.steps as WorkflowStepInput[] } : {}),
    repeat,
    ...(body.workHoursOnly === true ? { workHoursOnly: true } : {}),
    timeZone,
    enabled: true,
    nextRunAt: null,
    lastRunAt: null,
    lastTaskId: null,
    lastError: null,
    createdAt: now.toISOString(),
  };
  schedule.nextRunAt = nextFrom(schedule, now);
  if (!schedule.nextRunAt) throw new Error('이미 지난 시각이에요. 앞으로의 시각을 골라 주세요.');
  store.mutate((s) => {
    s.schedules.push(schedule);
  });
  return schedule;
}

/** Turning a schedule on or changing when it runs counts from now; other edits keep its next time. */
export function updateSchedule(id: string, body: Record<string, unknown>): ScheduledTask {
  const before = scheduleOf(id);
  const next = structuredClone(before);
  if (typeof body.title === 'string') next.title = body.title.trim().slice(0, 60);
  if (typeof body.description === 'string') next.description = body.description.trim().slice(0, 2000);
  const retimed = body.repeat !== undefined;
  if (retimed) Object.assign(next, checkedFields({ repeat: body.repeat, timeZone: body.timeZone ?? before.timeZone }), { createdAt: new Date().toISOString() });
  if (typeof body.enabled === 'boolean') next.enabled = body.enabled;
  if (body.workHoursOnly === true) next.workHoursOnly = true;
  else if (body.workHoursOnly === false) delete next.workHoursOnly;
  if (retimed || (next.enabled && !before.enabled)) {
    next.nextRunAt = nextFrom(next, new Date());
    if (next.enabled && !next.nextRunAt) throw new Error('이미 지난 시각이에요. 앞으로의 시각을 골라 주세요.');
  }
  store.mutate((s) => {
    s.schedules = s.schedules.map((x) => (x.id === id ? next : x));
  });
  return next;
}

export function deleteSchedule(id: string) {
  scheduleOf(id);
  store.mutate((s) => {
    s.schedules = s.schedules.filter((x) => x.id !== id);
  });
}

/**
 * Why a due time puts nothing on the board, or null to go ahead: staff off duty (when the schedule keeps to work
 * hours), or no new item for a team that works on incoming ones. A mail office reads its mail accounts first.
 */
async function skipReason(schedule: ScheduledTask, now: Date, due: boolean): Promise<string | null> {
  const office = store.office(schedule.officeId);
  if (due && schedule.workHoursOnly) {
    const manager = store.data.agents.find((a) => a.officeId === office.id && a.role === 'manager');
    const availability = manager && agentAvailability(manager, now);
    if (availability && !availability.available && availability.reason === 'schedule') return V('근무 시간이 아니라 건너뛰었어요.');
  }
  if (office.team === 'hr') {
    const sources = office.gmailServerId || store.data.mailAccounts.some((a) => a.officeId === office.id);
    if (sources) await importMail(office.id).catch((e) => console.error(`[schedule] ${office.name}:`, e instanceof Error ? e.message : e));
    if (!store.data.mailbox.some((m) => m.officeId === office.id && !m.processed)) return V('새 메일이 없어 건너뛰었어요.');
  }
  if (office.team === 'support' && !store.data.inquiries.some((q) => q.status === 'new')) return V('새 문의가 없어 건너뛰었어요.');
  return null;
}

/** Puts the schedule's task on the board now; `due` is false for a manual "run now", which keeps its next time. */
async function runSchedule(schedule: ScheduledTask, create: Create, due: boolean, now = new Date()) {
  let taskId: string | null = null;
  let error: string | null = null;
  const note = await skipReason(schedule, now, due);
  if (note) {
    store.mutate((s) => {
      const target = s.schedules.find((x) => x.id === schedule.id);
      if (!target) return;
      target.lastRunAt = now.toISOString();
      target.lastNote = note;
      target.lastError = null;
      if (due) {
        target.nextRunAt = nextFrom(target, now);
        if (!target.nextRunAt) target.enabled = false;
      }
    });
    return { taskId, error, note };
  }
  try {
    const task = await create({
      officeId: schedule.officeId,
      title: schedule.title || undefined,
      description: schedule.description,
      taskType: schedule.taskType,
      planMode: schedule.planMode,
      ...(schedule.planMode === 'custom' && schedule.steps ? { steps: schedule.steps } : {}),
    });
    taskId = task.id;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  store.mutate((s) => {
    const target = s.schedules.find((x) => x.id === schedule.id);
    if (!target) return;
    target.lastRunAt = now.toISOString();
    target.lastTaskId = taskId;
    target.lastError = error;
    target.lastNote = null;
    if (due) {
      target.nextRunAt = nextFrom(target, now);
      if (!target.nextRunAt) target.enabled = false;
    }
  });
  store.emit('schedule.ran', { taskId: taskId ?? undefined, payload: { officeId: schedule.officeId, title: schedule.title, error } });
  return { taskId, error, note: null };
}

export async function runScheduleNow(id: string, create: Create) {
  const result = await runSchedule(scheduleOf(id), create, false);
  if (result.error) throw new Error(result.error);
  return result;
}

/** Starts every schedule whose time has come. Called on the auto-run interval. */
export async function scheduleTick(create: Create, now = new Date()) {
  for (const schedule of [...store.data.schedules]) {
    if (!schedule.enabled || !schedule.nextRunAt || new Date(schedule.nextRunAt) > now) continue;
    await runSchedule(schedule, create, true, now);
  }
}
