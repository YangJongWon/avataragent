import { useState } from 'react';
import { t, tpl } from '../../../shared/i18n.ts';
import { modelOf } from '../../../shared/models.ts';
import { MIN_SAMPLES, officePerf, secondsLabel, suggestImprovements, type Improvement } from '../../../shared/performance.ts';
import { personalityLabel, personalityOf, type Personality } from '../../../shared/personality.ts';
import { taskTypeOf, TEAMS } from '../../../shared/teams.ts';
import type { Snapshot } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { roleTitle } from '../format.ts';
import { useLanguage } from '../LanguageProvider.tsx';
import { PlaybookPanel } from './PlaybookPanel.tsx';

const pct = (value: number | null) => (value === null ? '-' : `${Math.round(value * 100)}%`);
const points = (value: number | null) => (value === null ? '-' : tpl('{n}점', { n: Math.round(value) }));
const changeLabel = (field: Improvement['field'], value: string) =>
  field === 'personality' ? `${personalityOf(value as Personality).emoji} ${personalityLabel(value as Personality)}` : modelOf(value).label;

export function PerformanceTab(props: {
  snapshot: Snapshot;
  officeId: string;
  onError: (m: string) => void;
  onNotice: (m: string) => void;
}) {
  const { snapshot } = props;
  const { locale } = useLanguage();
  const [officeId, setOfficeId] = useState(props.officeId);
  const [busy, setBusy] = useState(false);
  const office = snapshot.offices.find((o) => o.id === officeId) ?? snapshot.offices[0];
  if (!office) return <div className="page">{t('사무실이 없어요.')}</div>;
  const agents = snapshot.agents.filter((a) => a.officeId === office.id);
  const agentName = (id: string) => snapshot.agents.find((a) => a.id === id)?.name ?? t('(내보낸 직원)');
  const perf = officePerf(office.id, agents, snapshot.performance);
  const suggestions = suggestImprovements(office.id, agents, snapshot.performance, snapshot.models, snapshot.improvements);
  const history = snapshot.improvements.filter((i) => i.officeId === office.id);

  const run = async (work: () => Promise<unknown>, notice: string) => {
    setBusy(true);
    try {
      await work();
      props.onNotice(notice);
    } catch (e) {
      props.onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <h2>{t('성과·개선')}</h2>
      <p className="muted small">
        {t('조사와 검수가 끝날 때마다 결과를 기록해요. 기록은 다음 업무의 지시(지난 반려 사유), 담당자 배정(성과 좋은 직원 우선), 개선 제안에 자동으로 쓰여요.')}
      </p>
      <div className="perf-offices">
        {snapshot.offices.map((o) => (
          <button key={o.id} className={`pixel-btn small ${o.id === office.id ? 'primary' : ''}`} onClick={() => setOfficeId(o.id)}>
            {TEAMS[o.team].emoji} {o.name}
          </button>
        ))}
      </div>

      <div className="stat-grid">
        <div className="stat pixel-box">
          <div className="stat-label">{t('검수 통과율')}</div>
          <div className="stat-value">{pct(perf.review.passRate)}</div>
          <div className="muted small">
            {perf.review.approved}/{perf.review.count}회 · {t('평균')} {points(perf.review.avgScore)}
          </div>
        </div>
        <div className="stat pixel-box">
          <div className="stat-label">{t('첫 시도 통과율')}</div>
          <div className="stat-value">{pct(perf.review.firstPassRate)}</div>
          <div className="muted small">{t('다시 쓰지 않고 바로 통과한 비율')}</div>
        </div>
        <div className="stat pixel-box">
          <div className="stat-label">{t('조사 정확도')}</div>
          <div className="stat-value">{points(perf.research.accuracy)}</div>
          <div className="muted small">
            {t('검수자가 매긴 점수')} · {perf.research.scored}회
          </div>
        </div>
        <div className="stat pixel-box">
          <div className="stat-label">{t('조사 속도')}</div>
          <div className="stat-value">{secondsLabel(perf.research.avgMs)}</div>
          <div className="muted small">
            {t('평균')} · {t('도구')} {perf.research.toolCalls}회
            {perf.research.toolFailures ? ` (${t('실패')} ${perf.research.toolFailures})` : ''}
          </div>
        </div>
        <div className="stat pixel-box">
          <div className="stat-label">{t('검수 판단 정확도')}</div>
          <div className="stat-value">{perf.review.falsePassRate === null ? '-' : pct(1 - perf.review.falsePassRate)}</div>
          <div className="muted small">
            {t('통과시킨 결과를 사용자도 승인한 비율')} · {perf.review.checked}회
          </div>
        </div>
      </div>

      <section className="pixel-box section">
        <h3>{t('개선 제안')}</h3>
        <label className="toggle">
          <input
            type="checkbox"
            checked={Boolean(office.autoImprove)}
            disabled={busy}
            onChange={(e) =>
              run(
                () => api.updateOffice(office.id, { autoImprove: e.target.checked }),
                e.target.checked
                  ? t('자율 개선을 켰어요. 비용이 늘지 않는 제안은 바로, 그리고 업무가 끝날 때마다 반영해요.')
                  : t('자율 개선을 껐어요.'),
              )
            }
          />
          {t('자율 개선')}{' '}
          <span className="muted small">
            ({t('성격 변경처럼 비용이 늘지 않는 제안을 알아서 반영해요. 모델 변경은 항상 직접 결정')})
          </span>
        </label>
        {suggestions.length === 0 ? (
          <p className="muted small">{tpl('지금은 제안이 없어요. 같은 설정(모델·성격)으로 {n}번 이상 기록이 쌓이면 문제가 보일 때 제안해요.', { n: MIN_SAMPLES })}</p>
        ) : (
          <ul className="perf-suggestions">
            {suggestions.map((s) => (
              <li key={s.id} className="perf-suggestion">
                <div>
                  <strong>{agentName(s.agentId)}</strong> {changeLabel(s.field, s.from)} → <strong>{changeLabel(s.field, s.to)}</strong>
                  {s.safe ? (
                    <span className="perf-tag ok">{t('자동 반영 가능')}</span>
                  ) : (
                    <span className="perf-tag">{t('직접 결정')}</span>
                  )}
                  <div className="muted small">{s.reason}</div>
                </div>
                <button
                  className="pixel-btn small primary"
                  disabled={busy}
                  onClick={() => run(() => api.applyImprovement(office.id, s.id), tpl('{who}에게 반영했어요.', { who: agentName(s.agentId) }))}
                >
                  {t('적용')}
                </button>
              </li>
            ))}
          </ul>
        )}
        {history.length > 0 && (
          <>
            <h4>{t('반영 기록')}</h4>
            <ul className="perf-history small">
              {history.slice(0, 8).map((h) => (
                <li key={`${h.id}_${h.appliedAt}`}>
                  {new Date(h.appliedAt).toLocaleString(locale)} · {agentName(h.agentId)} {changeLabel(h.field, h.from)} →{' '}
                  {changeLabel(h.field, h.to)} <span className="muted">({h.auto ? t('자율 개선') : t('직접 적용')})</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="pixel-box section">
        <h3>{t('직원별 기록')}</h3>
        <table className="table">
          <thead>
            <tr>
              <th>{t('직원')}</th>
              <th>{t('설정')}</th>
              <th className="num">{t('조사 정확도')}</th>
              <th className="num">{t('조사 속도')}</th>
              <th className="num">{t('작성물 검수 통과')}</th>
              <th className="num">{t('검수 판단 정확도')}</th>
            </tr>
          </thead>
          <tbody>
            {perf.agents.map((p) => {
              const agent = agents.find((a) => a.id === p.agentId)!;
              return (
                <tr key={p.agentId}>
                  <td>
                    {agent.name} <span className="muted small">{roleTitle(agent, snapshot.offices)}</span>
                  </td>
                  <td className="small">
                    {modelOf(agent.model).label} · {personalityLabel(agent.personality)}
                  </td>
                  <td className="num">{p.research.scored ? `${points(p.research.accuracy)} (${p.research.scored})` : '-'}</td>
                  <td className="num">{secondsLabel(p.research.avgMs)}</td>
                  <td className="num">{p.writing.count ? `${p.writing.approved}/${p.writing.count}` : '-'}</td>
                  <td className="num">
                    {p.reviewing.checked ? `${pct(1 - p.reviewing.falsePassRate!)} (${p.reviewing.checked})` : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <PlaybookPanel snapshot={snapshot} office={office} onError={props.onError} onNotice={props.onNotice} />

      <section className="pixel-box section">
        <h3>{t('최근 반려 사유')}</h3>
        {perf.recentRejections.length === 0 ? (
          <p className="muted small">{t('아직 반려된 적이 없어요.')}</p>
        ) : (
          <ul className="perf-history small">
            {perf.recentRejections.map((r) => (
              <li key={r.id}>
                <span className="muted">
                  {t(taskTypeOf(office.team, r.taskType).label)} · {agentName(r.agentId)} → {agentName(r.writerId)} ·{' '}
                  {points(r.score)}
                </span>
                <div>{r.reason}</div>
              </li>
            ))}
          </ul>
        )}
        <p className="muted small">{t('같은 유형의 다음 업무에서 작성자에게 "같은 실수를 피할 것"으로 함께 전달돼요.')}</p>
      </section>
    </div>
  );
}
