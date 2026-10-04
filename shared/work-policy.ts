import type { Agent, DailyAgentUsage, WorkPolicy } from './types.ts';

export const DEFAULT_WORK_POLICY: WorkPolicy = {
  enabled: false,
  timezone: 'Asia/Seoul',
  days: [1, 2, 3, 4, 5],
  start: '09:00',
  end: '18:00',
  maxTokens: null,
  maxWorkMinutes: null,
};

function parts(now: Date, timezone: string) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now).map((p) => [p.type, p.value]),
  );
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { date: `${values.year}-${values.month}-${values.day}`, day: weekdays[values.weekday], minute: Number(values.hour) * 60 + Number(values.minute) };
}

const minuteOf = (value: string) => {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
};

export function usageDate(policy: WorkPolicy, now = new Date()) {
  return parts(now, policy.timezone).date;
}

export function freshDailyUsage(policy: WorkPolicy, now = new Date()): DailyAgentUsage {
  return { date: usageDate(policy, now), tokens: 0, workMs: 0 };
}

export type Availability = { available: true } | { available: false; reason: 'schedule' | 'tokens' | 'work_time' };

export function agentAvailability(agent: Agent, now = new Date()): Availability {
  const policy = agent.workPolicy;
  const current = parts(now, policy.timezone);
  const usage = agent.dailyUsage.date === current.date ? agent.dailyUsage : { date: current.date, tokens: 0, workMs: 0 };
  if (policy.maxTokens !== null && usage.tokens >= policy.maxTokens) return { available: false, reason: 'tokens' };
  if (policy.maxWorkMinutes !== null && usage.workMs >= policy.maxWorkMinutes * 60_000) return { available: false, reason: 'work_time' };
  if (!policy.enabled) return { available: true };
  const start = minuteOf(policy.start);
  const end = minuteOf(policy.end);
  const inHours = start <= end ? current.minute >= start && current.minute < end : current.minute >= start || current.minute < end;
  if (!policy.days.includes(current.day) || !inHours) return { available: false, reason: 'schedule' };
  return { available: true };
}

export function normalizeWorkPolicy(value?: Partial<WorkPolicy>): WorkPolicy {
  const merged = { ...DEFAULT_WORK_POLICY, ...value };
  try { new Intl.DateTimeFormat('en', { timeZone: merged.timezone }).format(); } catch { merged.timezone = DEFAULT_WORK_POLICY.timezone; }
  merged.days = [...new Set(merged.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))];
  return merged;
}
