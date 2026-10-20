import type { ScheduleRepeat } from './types.ts';

/** How often a scheduled task may repeat at most: every hour. */
export const MIN_EVERY_HOURS = 1;
export const MAX_EVERY_HOURS = 168;
export const MAX_SCHEDULES_PER_OFFICE = 20;
/** Every N minutes: no more often than a quarter of an hour, so a task can finish before the next one. */
export const MIN_EVERY_MINUTES = 15;
export const MAX_EVERY_MINUTES = 720;
/** How often a mail office with auto-check reads its accounts. */
export const MAIL_CHECK_MINUTES = [5, 15, 30, 60] as const;

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Wall-clock parts of `at` in `timeZone`. */
function zoned(at: Date, timeZone: string) {
  const v = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { y: Number(v.year), m: Number(v.month), d: Number(v.day), day: weekdays[v.weekday], hh: Number(v.hour), mm: Number(v.minute), ss: Number(v.second) };
}

/** The instant a wall-clock time in `timeZone` happens (the earlier one when clocks repeat an hour). */
function instant(y: number, m: number, d: number, hh: number, mm: number, timeZone: string) {
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  let at = wall;
  // Two passes settle the zone offset, daylight-saving edges included.
  for (let i = 0; i < 2; i++) {
    const p = zoned(new Date(at), timeZone);
    at += wall - Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
  }
  return new Date(at);
}

export const isTimeZone = (value: unknown): value is string => {
  if (typeof value !== 'string' || !value) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
};

/** A checked repeat rule from a request, or an error message. */
export function parseRepeat(raw: unknown): ScheduleRepeat | string {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (r.kind === 'once') {
    const at = new Date(String(r.at ?? ''));
    return Number.isNaN(at.getTime()) ? '실행할 날짜와 시각을 골라 주세요.' : { kind: 'once', at: at.toISOString() };
  }
  if (r.kind === 'daily' || r.kind === 'weekly') {
    const time = String(r.time ?? '');
    if (!TIME.test(time)) return '실행할 시각을 HH:MM 형식으로 골라 주세요.';
    if (r.kind === 'daily') return { kind: 'daily', time };
    const days = Array.isArray(r.days) ? [...new Set(r.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : [];
    return days.length ? { kind: 'weekly', days, time } : '실행할 요일을 하나 이상 골라 주세요.';
  }
  if (r.kind === 'minutes') {
    const every = Number(r.every);
    if (!Number.isInteger(every) || every < MIN_EVERY_MINUTES || every > MAX_EVERY_MINUTES) return `반복 간격은 ${MIN_EVERY_MINUTES}~${MAX_EVERY_MINUTES}분 사이로 정해 주세요.`;
    return { kind: 'minutes', every };
  }
  if (r.kind === 'hourly') {
    const every = Number(r.every);
    if (!Number.isInteger(every) || every < MIN_EVERY_HOURS || every > MAX_EVERY_HOURS) return `반복 간격은 ${MIN_EVERY_HOURS}~${MAX_EVERY_HOURS}시간 사이로 정해 주세요.`;
    return { kind: 'hourly', every };
  }
  return '반복 방식을 골라 주세요.';
}

/**
 * The first run strictly after `after`, or null when there is none (a one-off already past). Runs missed while the
 * app was off are not made up: the schedule simply continues from the next one.
 * `anchor` is when an hourly schedule started counting.
 */
export function nextRunAfter(repeat: ScheduleRepeat, timeZone: string, after: Date, anchor: Date = after): Date | null {
  if (repeat.kind === 'once') {
    const at = new Date(repeat.at);
    return at > after ? at : null;
  }
  if (repeat.kind === 'hourly' || repeat.kind === 'minutes') {
    const step = repeat.every * (repeat.kind === 'hourly' ? 3_600_000 : 60_000);
    const passed = Math.max(0, Math.floor((after.getTime() - anchor.getTime()) / step) + 1);
    return new Date(anchor.getTime() + passed * step);
  }
  const [hh, mm] = repeat.time.split(':').map(Number);
  const today = zoned(after, timeZone);
  for (let offset = 0; offset <= 8; offset++) {
    // Walk calendar days in the schedule's zone; Date.UTC rolls month and year over.
    const day = new Date(Date.UTC(today.y, today.m - 1, today.d + offset));
    if (repeat.kind === 'weekly' && !repeat.days.includes(day.getUTCDay())) continue;
    const at = instant(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), hh, mm, timeZone);
    if (at > after) return at;
  }
  return null;
}
