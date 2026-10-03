import { useState } from 'react';
import { TEAM_ORDER, TEAMS } from '../../../shared/teams.ts';
import type { Snapshot } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { krw, roi, roleTitle, TASK_STATUS_LABEL } from '../format.ts';

export function ProfitTab({ snapshot, onError, onNotice }: { snapshot: Snapshot; onError: (m: string) => void; onNotice: (m: string) => void }) {
  const { budget, agents, tasks, offices } = snapshot;
  const [monthly, setMonthly] = useState(String(budget.monthlyKrw));
  const [hourly, setHourly] = useState(String(budget.hourlyRateKrw));
  const profit = budget.valueKrw - budget.spentKrw;
  const used = budget.monthlyKrw > 0 ? Math.min(100, (budget.spentKrw / budget.monthlyKrw) * 100) : 0;

  const save = async () => {
    try {
      await api.updateBudget({ monthlyKrw: Number(monthly), hourlyRateKrw: Number(hourly) });
      onNotice('예산 설정을 저장했어요.');
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="page">
      <h2>손익·결산 (이번 달)</h2>
      <div className="stat-grid">
        <div className="stat pixel-box">
          <div className="stat-label">월 AI 예산</div>
          <div className="stat-value">{krw(budget.monthlyKrw)}</div>
        </div>
        <div className="stat pixel-box">
          <div className="stat-label">사용한 비용</div>
          <div className="stat-value">{krw(budget.spentKrw)}</div>
          <div className="meter">
            <div className={`meter-fill ${used >= 80 ? 'warn' : ''}`} style={{ width: `${used}%` }} />
          </div>
        </div>
        <div className="stat pixel-box">
          <div className="stat-label">인정 가치 (매출)</div>
          <div className="stat-value">{krw(budget.valueKrw)}</div>
        </div>
        <div className="stat pixel-box">
          <div className="stat-label">이익 · ROI</div>
          <div className={`stat-value ${profit < 0 ? 'neg' : 'pos'}`}>{krw(profit)}</div>
          <div className="muted small">ROI {roi(budget.valueKrw, budget.spentKrw)}</div>
        </div>
      </div>

      <section className="pixel-box section">
        <h3>사무실별 손익</h3>
        <table className="table">
          <thead>
            <tr>
              <th>사무실</th>
              <th className="num">비용</th>
              <th className="num">인정 가치</th>
              <th className="num">이익</th>
              <th className="num">ROI</th>
              <th className="num">예산 상한</th>
              <th className="num">완료</th>
            </tr>
          </thead>
          <tbody>
            {offices.map((o) => (
              <tr key={o.id}>
                <td>
                  {TEAMS[o.team].emoji} {o.name}
                </td>
                <td className="num">{krw(o.spentKrw)}</td>
                <td className="num">{krw(o.valueKrw)}</td>
                <td className={`num ${o.valueKrw - o.spentKrw < 0 ? 'neg' : 'pos'}`}>{krw(o.valueKrw - o.spentKrw)}</td>
                <td className="num">{roi(o.valueKrw, o.spentKrw)}</td>
                <td className="num">{o.budgetKrw === null ? '없음' : krw(o.budgetKrw)}</td>
                <td className="num">{tasks.filter((t) => t.officeId === o.id && t.status === 'completed').length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="two-col">
        <section className="pixel-box section">
          <h3>직원별 손익</h3>
          <table className="table">
            <thead>
              <tr>
                <th>직원</th>
                <th className="num">비용</th>
                <th className="num">가치</th>
                <th className="num">이익</th>
                <th className="num">완료</th>
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
        </section>

        <section className="pixel-box section">
          <h3>예산과 가치 기준</h3>
          <label className="field-inline">
            월 AI 예산(원)
            <input type="number" min={0} value={monthly} onChange={(e) => setMonthly(e.target.value)} />
          </label>
          <label className="field-inline">
            인건비 환산 시급(원)
            <input type="number" min={0} value={hourly} onChange={(e) => setHourly(e.target.value)} />
          </label>
          <button className="pixel-btn primary" onClick={save}>
            저장
          </button>
          <table className="table">
            <thead>
              <tr>
                <th>팀 · 업무 유형</th>
                <th className="num">표준 시간</th>
                <th className="num">기준 가치</th>
              </tr>
            </thead>
            <tbody>
              {TEAM_ORDER.flatMap((team) =>
                TEAMS[team].taskTypes.map((t) => (
                  <tr key={`${team}-${t.id}`}>
                    <td>
                      {TEAMS[team].emoji} {t.label}
                    </td>
                    <td className="num">
                      {t.standardHours}시간{t.hoursPerItem ? ` + 건당 ${t.hoursPerItem}` : ''}
                    </td>
                    <td className="num">{krw(t.standardHours * budget.hourlyRateKrw)}~</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
          <p className="muted small">
            인정 가치 = 기준 가치 × 품질 보정(검수 점수에 따라 0.7~1.2) × 사용자 평가(그대로 승인 100%, 수정 요청 후 승인 70%). 실제 회계
            수치가 아닌 참고 지표예요.
          </p>
        </section>
      </div>

      <section className="pixel-box section">
        <h3>업무별 손익</h3>
        <table className="table">
          <thead>
            <tr>
              <th>업무</th>
              <th>상태</th>
              <th className="num">비용</th>
              <th className="num">인정 가치</th>
              <th className="num">이익</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => {
              const value = t.value?.recognizedKrw ?? 0;
              return (
                <tr key={t.id}>
                  <td>
                    {TEAMS[offices.find((o) => o.id === t.officeId)?.team ?? 'dev'].emoji} {t.title}
                  </td>
                  <td>{TASK_STATUS_LABEL[t.status]}</td>
                  <td className="num">{krw(t.costKrw)}</td>
                  <td className="num">{value ? krw(value) : '-'}</td>
                  <td className={`num ${value - t.costKrw < 0 ? 'neg' : 'pos'}`}>{value ? krw(value - t.costKrw) : '-'}</td>
                </tr>
              );
            })}
            {!tasks.length && (
              <tr>
                <td colSpan={5} className="muted">
                  아직 업무가 없어요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
