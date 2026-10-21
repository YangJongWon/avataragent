import { tpl } from '../../../shared/i18n.ts';
import { useState } from 'react';
import { categoryLabel, GENERAL_TASK_TYPES } from '../../../shared/task-types.ts';
import { TEAM_ORDER, TEAMS } from '../../../shared/teams.ts';
import type { Snapshot } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { krw, roi, roleTitle, statusLabel } from '../format.ts';
import { useLanguage } from '../LanguageProvider.tsx';

export function ProfitTab({ snapshot, onError, onNotice }: { snapshot: Snapshot; onError: (m: string) => void; onNotice: (m: string) => void }) {
  const { t } = useLanguage();
  const { budget, agents, tasks, offices } = snapshot;
  const [monthly, setMonthly] = useState(String(budget.monthlyKrw));
  const [hourly, setHourly] = useState(String(budget.hourlyRateKrw));
  const profit = budget.valueKrw - budget.spentKrw;
  const used = budget.monthlyKrw > 0 ? Math.min(100, (budget.spentKrw / budget.monthlyKrw) * 100) : 0;
  const taskTitle = (source: string) => {
    const exact = t(source);
    if (exact !== source) return exact;
    const counted = source.match(/^(.*) \((\d+)건\)$/);
    return counted ? `${t(counted[1])} (${counted[2]}${t('건')})` : source;
  };

  const save = async () => {
    try {
      await api.updateBudget({ monthlyKrw: Number(monthly), hourlyRateKrw: Number(hourly) });
      onNotice(t('예산 설정을 저장했어요.'));
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="page">
      <h2>{t('손익·결산 (이번 달)')}</h2>
      <div className="stat-grid">
        <div className="stat pixel-box">
          <div className="stat-label">{t('월 AI 예산')}</div>
          <div className="stat-value">{krw(budget.monthlyKrw)}</div>
        </div>
        <div className="stat pixel-box">
          <div className="stat-label">{t('사용한 비용')}</div>
          <div className="stat-value">{krw(budget.spentKrw)}</div>
          <div className="meter">
            <div className={`meter-fill ${used >= 80 ? 'warn' : ''}`} style={{ width: `${used}%` }} />
          </div>
        </div>
        <div className="stat pixel-box">
          <div className="stat-label">{t('인정 가치 (매출)')}</div>
          <div className="stat-value">{krw(budget.valueKrw)}</div>
        </div>
        <div className="stat pixel-box">
          <div className="stat-label">{t('이익 · ROI')}</div>
          <div className={`stat-value ${profit < 0 ? 'neg' : 'pos'}`}>{krw(profit)}</div>
          <div className="muted small">ROI {roi(budget.valueKrw, budget.spentKrw)}</div>
        </div>
      </div>

      <section className="pixel-box section">
        <h3>{t('사무실별 손익')}</h3>
        <div className="table-scroll">
        <table className="table scroll-table">
          <thead>
            <tr>
              <th>{t('사무실')}</th>
              <th className="num">{t('비용')}</th>
              <th className="num">{t('인정 가치')}</th>
              <th className="num">{t('이익')}</th>
              <th className="num">ROI</th>
              <th className="num">{t('예산 상한')}</th>
              <th className="num">{t('완료')}</th>
            </tr>
          </thead>
          <tbody>
            {offices.map((o) => (
              <tr key={o.id}>
                <td>
                  {TEAMS[o.team].emoji} {t(o.name)}
                </td>
                <td className="num">{krw(o.spentKrw)}</td>
                <td className="num">{krw(o.valueKrw)}</td>
                <td className={`num ${o.valueKrw - o.spentKrw < 0 ? 'neg' : 'pos'}`}>{krw(o.valueKrw - o.spentKrw)}</td>
                <td className="num">{roi(o.valueKrw, o.spentKrw)}</td>
                <td className="num">{o.budgetKrw === null ? t('없음') : krw(o.budgetKrw)}</td>
                <td className="num">{tasks.filter((t) => t.officeId === o.id && t.status === 'completed').length}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      <div className="two-col">
        <section className="pixel-box section">
          <h3>{t('직원별 손익')}</h3>
          <div className="table-scroll">
          <table className="table scroll-table">
            <thead>
              <tr>
                <th>{t('직원')}</th>
                <th className="num">{t('비용')}</th>
                <th className="num">{t('가치')}</th>
                <th className="num">{t('이익')}</th>
                <th className="num">{t('완료')}</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.id}>
                  <td>
                    {a.name} <span className="muted small">{roleTitle(a, offices)}</span>
                  </td>
                  <td className="num">{krw(a.costKrw)}</td>
                  <td className="num">{krw(a.valueKrw)}</td>
                  <td className={`num ${a.valueKrw - a.costKrw < 0 ? 'neg' : 'pos'}`}>{krw(a.valueKrw - a.costKrw)}</td>
                  <td className="num">{a.tasksDone}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </section>

        <section className="pixel-box section">
          <h3>{t('예산과 가치 기준')}</h3>
          <label className="field-inline">
            {t('월 AI 예산(KRW)')}
            <input type="number" min={0} value={monthly} onChange={(e) => setMonthly(e.target.value)} />
          </label>
          <label className="field-inline">
            {t('인건비 환산 시급(KRW)')}
            <input type="number" min={0} value={hourly} onChange={(e) => setHourly(e.target.value)} />
          </label>
          <button className="pixel-btn primary" onClick={save}>
            {t('저장')}
          </button>
          <table className="table">
            <thead>
              <tr>
                <th>{t('팀 · 업무 유형')}</th>
                <th className="num">{t('표준 시간')}</th>
                <th className="num">{t('기준 가치')}</th>
              </tr>
            </thead>
            <tbody>
              {TEAM_ORDER.flatMap((team) =>
                TEAMS[team].taskTypes.map((taskType) => (
                  <tr key={`${team}-${taskType.id}`}>
                    <td>
                      {TEAMS[team].emoji} {t(taskType.label)}
                    </td>
                    <td className="num">
                      {taskType.standardHours}{t('시간')}{taskType.hoursPerItem ? ` + ${t('건당')} ${taskType.hoursPerItem}` : ''}
                    </td>
                    <td className="num">{krw(taskType.standardHours * budget.hourlyRateKrw)}~</td>
                  </tr>
                )),
              )}
              {GENERAL_TASK_TYPES.map((taskType) => (
                <tr key={`general-${taskType.id}`}>
                  <td>
                    🗂 {t(categoryLabel(taskType.category))} · {t(taskType.label)}
                  </td>
                  <td className="num">
                    {taskType.standardHours}{t('시간')}
                  </td>
                  <td className="num">{krw(taskType.standardHours * budget.hourlyRateKrw)}~</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">{t('인정 가치 = 기준 가치 × 품질 보정(검수 점수에 따라 0.7~1.2) × 사용자 평가(그대로 승인 100%, 수정 요청 후 승인 70%). 실제 회계 수치가 아닌 참고 지표예요.')}</p>
        </section>
      </div>

      <section className="pixel-box section">
        <h3>{t('업무별 손익')}</h3>
        <div className="table-scroll">
        <table className="table scroll-table">
          <thead>
            <tr>
              <th>{t('업무')}</th>
              <th>{t('상태')}</th>
              <th className="num">{t('비용')}</th>
              <th className="num">{t('인정 가치')}</th>
              <th className="num">{t('이익')}</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => {
              const value = task.value?.recognizedKrw ?? 0;
              return (
                <tr key={task.id}>
                  <td>
                    {TEAMS[offices.find((o) => o.id === task.officeId)?.team ?? 'dev'].emoji} {taskTitle(task.title)}
                  </td>
                  <td>{statusLabel(task.status)}</td>
                  <td className="num">{krw(task.costKrw)}</td>
                  <td className="num">{value ? krw(value) : '-'}</td>
                  <td className={`num ${value - task.costKrw < 0 ? 'neg' : 'pos'}`}>{value ? krw(value - task.costKrw) : '-'}</td>
                </tr>
              );
            })}
            {!tasks.length && (
              <tr>
                <td colSpan={5} className="muted">
                  {t('아직 업무가 없어요.')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </section>
    </div>
  );
}
