import { currentLanguage, localeOf, localize, t, tpl } from '../../../shared/i18n.ts';
import type { Office, Snapshot } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { describeRepeat } from './ScheduleFields.tsx';

const when = (iso: string) => new Date(iso).toLocaleString(localeOf(currentLanguage()), { month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' });

/** The office's scheduled tasks: when each runs next, how its last run went, and controls to pause, try or remove it. */
export function SchedulesPanel({
  snapshot,
  office,
  run,
  onNotice,
}: {
  snapshot: Snapshot;
  office: Office;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  onNotice: (message: string) => void;
}) {
  const schedules = snapshot.schedules.filter((s) => s.officeId === office.id);
  return (
    <section className="schedules">
      <h4>⏰ {t('예약 업무')}</h4>
      {schedules.length === 0 ? (
        <p className="muted small">{t('업무 등록 창의 "언제 실행"에서 매일·매주·N시간마다 같은 업무를 예약할 수 있어요.')}</p>
      ) : (
        <ul className="data-list">
          {schedules.map((s) => (
            <li key={s.id} className={s.enabled ? '' : 'done'}>
              <div className="schedule-head">
                <b>{s.title || t('(제목 없음)')}</b>
                <span className="data-tag">{describeRepeat(s.repeat)}</span>
                {s.workHoursOnly && <span className="data-tag">{t('근무 시간에만')}</span>}
              </div>
              <div className="muted small">
                {s.enabled && s.nextRunAt ? tpl('다음 실행: {at}', { at: when(s.nextRunAt) }) : t('꺼져 있어요')}
                {s.lastRunAt && ` · ${tpl('마지막 실행: {at}', { at: when(s.lastRunAt) })}`}
              </div>
              {s.lastError && <div className="small warn-line">⚠ {s.lastError}</div>}
              {s.lastNote && <div className="small muted">↷ {localize(s.lastNote)}</div>}
              <div className="row">
                <button
                  className="pixel-btn small primary"
                  onClick={() =>
                    run(async () => {
                      const { note } = await api.runSchedule(s.id);
                      onNotice(note ? localize(note) : tpl('"{title}"을(를) 칠판에 붙였어요.', { title: s.title || t('(제목 없음)') }));
                    })
                  }
                >
                  ▶ {t('지금 한 번 실행')}
                </button>
                <button className="pixel-btn small" onClick={() => run(() => api.updateSchedule(s.id, { enabled: !s.enabled }))}>
                  {s.enabled ? t('끄기') : t('켜기')}
                </button>
                <button
                  className="pixel-btn small danger"
                  onClick={() => window.confirm(tpl('예약 업무 "{title}"을(를) 지울까요?', { title: s.title || t('(제목 없음)') })) && run(() => api.deleteSchedule(s.id))}
                >
                  {t('삭제')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
