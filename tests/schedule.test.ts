import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'avataragent-schedule-'));
process.env.AI_PROVIDER = 'mock';
process.env.MOCK_DELAY_MS = '5';

const { nextRunAfter, parseRepeat } = await import('../shared/schedule.ts');
const { store } = await import('../server/store.ts');
const { createSchedule, runScheduleNow, scheduleTick, updateSchedule } = await import('../server/schedules.ts');

// Scheduling is checked on its own: the created tasks are recorded instead of being run.
const made: { title?: string }[] = [];
const create = async (input: { title?: string }) => {
  made.push(input);
  return { id: `task_${made.length}` } as never;
};

const seoul = 'Asia/Seoul';
const iso = (d: Date | null) => d?.toISOString() ?? null;

test('next run times follow the wall clock of the schedule’s zone', () => {
  // 2026-10-19 (Mon) 08:00 in Seoul.
  const monday8 = new Date('2026-10-18T23:00:00Z');
  assert.equal(iso(nextRunAfter({ kind: 'daily', time: '09:00' }, seoul, monday8)), '2026-10-19T00:00:00.000Z');
  assert.equal(iso(nextRunAfter({ kind: 'daily', time: '07:30' }, seoul, monday8)), '2026-10-19T22:30:00.000Z', 'already past today: tomorrow');
  // Weekly on Wed and Fri: the coming Wednesday.
  assert.equal(iso(nextRunAfter({ kind: 'weekly', days: [3, 5], time: '14:00' }, seoul, monday8)), '2026-10-21T05:00:00.000Z');
  // Across the year end.
  assert.equal(iso(nextRunAfter({ kind: 'daily', time: '00:30' }, seoul, new Date('2026-12-31T16:00:00Z'))), '2026-12-31T15:30:00.000Z'.replace('2026-12-31T15', '2027-01-01T15'));
  // Every 3 hours counted from when it was made; missed ones are skipped, not made up.
  const anchor = new Date('2026-10-19T00:00:00Z');
  assert.equal(iso(nextRunAfter({ kind: 'hourly', every: 3 }, seoul, new Date('2026-10-19T07:10:00Z'), anchor)), '2026-10-19T09:00:00.000Z');
  // A one-off in the past has no next time.
  assert.equal(nextRunAfter({ kind: 'once', at: '2026-10-01T00:00:00Z' }, seoul, monday8), null);
  // Daylight saving: 09:00 in New York is 13:00Z in summer and 14:00Z in winter.
  assert.equal(iso(nextRunAfter({ kind: 'daily', time: '09:00' }, 'America/New_York', new Date('2026-07-01T00:00:00Z'))), '2026-07-01T13:00:00.000Z');
  assert.equal(iso(nextRunAfter({ kind: 'daily', time: '09:00' }, 'America/New_York', new Date('2026-12-01T00:00:00Z'))), '2026-12-01T14:00:00.000Z');

  assert.equal(typeof parseRepeat({ kind: 'weekly', days: [], time: '09:00' }), 'string');
  assert.equal(typeof parseRepeat({ kind: 'hourly', every: 0 }), 'string');
  assert.equal(typeof parseRepeat({ kind: 'daily', time: '25:00' }), 'string');
});

test('a due schedule puts its task on the board once and moves to its next time', async () => {
  await assert.rejects(async () => createSchedule({ officeId: 'office_dev', repeat: { kind: 'once', at: '2020-01-01T00:00:00Z' } }), /이미 지난 시각/);

  const schedule = createSchedule({ officeId: 'office_dev', title: '주간 보고', description: '이번 주 진행 상황', taskType: '', repeat: { kind: 'hourly', every: 2 }, timeZone: seoul });
  assert.ok(schedule.nextRunAt);
  const tasksOf = () => made.filter((t) => t.title === '주간 보고');

  // Not due yet: nothing happens.
  await scheduleTick(create, new Date());
  assert.equal(tasksOf().length, 0);

  // Its time has come.
  const due = new Date(new Date(schedule.nextRunAt!).getTime() + 1000);
  await scheduleTick(create, due);
  assert.equal(tasksOf().length, 1);
  const after = store.data.schedules.find((s) => s.id === schedule.id)!;
  assert.equal(after.lastTaskId, 'task_1');
  assert.ok(new Date(after.nextRunAt!) > due, 'moves on to the next time');

  // The same tick again does not run it twice.
  await scheduleTick(create, due);
  assert.equal(tasksOf().length, 1);

  // "Run once now" keeps the next time; a turned-off schedule does not run.
  const next = after.nextRunAt;
  await runScheduleNow(schedule.id, create);
  assert.equal(tasksOf().length, 2);
  assert.equal(store.data.schedules.find((s) => s.id === schedule.id)!.nextRunAt, next);
  updateSchedule(schedule.id, { enabled: false });
  await scheduleTick(create, new Date(new Date(next!).getTime() + 1000));
  assert.equal(tasksOf().length, 2);
});
