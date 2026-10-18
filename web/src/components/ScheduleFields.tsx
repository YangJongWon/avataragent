import { useState } from 'react';
import { currentLanguage, localeOf, t, tpl } from '../../../shared/i18n.ts';
import { MAX_EVERY_HOURS, MIN_EVERY_HOURS } from '../../../shared/schedule.ts';
import type { ScheduleRepeat } from '../../../shared/types.ts';

export type When = 'now' | ScheduleRepeat['kind'];

/** Weekday names in the screen language (1 Jan 2023 was a Sunday). */
const dayName = (day: number) => new Intl.DateTimeFormat(localeOf(currentLanguage()), { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2023, 0, 1 + day)));
const DAYS = [0, 1, 2, 3, 4, 5, 6];

/** The browser's zone: wall-clock times in a schedule are read where the person making it is. */
export const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul';

const pad = (n: number) => String(n).padStart(2, '0');
/** `<input type="datetime-local">` value for an hour from now, on the hour. */
const soon = () => {
  const d = new Date(Date.now() + 3_600_000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
};

export interface ScheduleDraft {
  when: When;
  at: string;
  time: string;
  days: number[];
  every: number;
}

export const useScheduleDraft = () => useState<ScheduleDraft>({ when: 'now', at: soon(), time: '09:00', days: [1, 2, 3, 4, 5], every: 1 });

/** The repeat rule the draft describes; null runs it now. */
export function repeatOf(d: ScheduleDraft): ScheduleRepeat | null {
  if (d.when === 'now') return null;
  if (d.when === 'once') return { kind: 'once', at: new Date(d.at).toISOString() };
  if (d.when === 'daily') return { kind: 'daily', time: d.time };
  if (d.when === 'weekly') return { kind: 'weekly', days: d.days, time: d.time };
  return { kind: 'hourly', every: d.every };
}

/** "매일 09:00", "월·수·금 14:30", "3시간마다", or the one moment. */
export function describeRepeat(r: ScheduleRepeat): string {
  if (r.kind === 'once') return tpl('{at} 한 번', { at: new Date(r.at).toLocaleString(localeOf(currentLanguage()), { dateStyle: 'medium', timeStyle: 'short' }) });
  if (r.kind === 'daily') return tpl('매일 {time}', { time: r.time });
  if (r.kind === 'weekly') return tpl('매주 {days} {time}', { days: r.days.map(dayName).join('·'), time: r.time });
  return tpl('{n}시간마다', { n: r.every });
}

/** Picks when a new task runs: now, once later, or on a repeating schedule. */
export function ScheduleFields({ draft, onChange }: { draft: ScheduleDraft; onChange: (d: ScheduleDraft) => void }) {
  const set = (patch: Partial<ScheduleDraft>) => onChange({ ...draft, ...patch });
  const options: [When, string][] = [
    ['now', t('지금')],
    ['once', t('예약 (한 번)')],
    ['daily', t('매일')],
    ['weekly', t('매주')],
    ['hourly', t('N시간마다')],
  ];
  return (
    <div className="field schedule-fields">
      {t('언제 실행')}
      <div className="segmented" role="radiogroup">
        {options.map(([id, label]) => (
          <button key={id} type="button" role="radio" aria-checked={draft.when === id} className={`segment ${draft.when === id ? 'active' : ''}`} onClick={() => set({ when: id })}>
            {label}
          </button>
        ))}
      </div>
      {draft.when === 'once' && <input type="datetime-local" value={draft.at} onChange={(e) => set({ at: e.target.value })} />}
      {draft.when === 'weekly' && (
        <div className="row wrap schedule-days">
          {DAYS.map((day) => (
            <label key={day} className="check small">
              <input
                type="checkbox"
                checked={draft.days.includes(day)}
                onChange={(e) => set({ days: e.target.checked ? [...draft.days, day].sort() : draft.days.filter((d) => d !== day) })}
              />
              {dayName(day)}
            </label>
          ))}
        </div>
      )}
      {(draft.when === 'daily' || draft.when === 'weekly') && <input type="time" value={draft.time} onChange={(e) => set({ time: e.target.value })} />}
      {draft.when === 'hourly' && (
        <label className="field-inline">
          <input type="number" min={MIN_EVERY_HOURS} max={MAX_EVERY_HOURS} value={draft.every} onChange={(e) => set({ every: Number(e.target.value) })} />
          {t('시간마다')}
        </label>
      )}
      {draft.when !== 'now' && (
        <span className="small muted">
          {t('정한 시각에 이 업무를 칠판에 붙여요. 다른 업무가 진행 중이면 대기열로 가고, 근무 시간 밖이면 출근 후에 시작해요. 앱이 꺼져 있던 동안 놓친 반복은 몰아서 하지 않아요.')}
        </span>
      )}
    </div>
  );
}
