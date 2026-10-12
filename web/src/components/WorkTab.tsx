import { useEffect, useState, type ReactNode } from 'react';
import { reviewsOf } from '../../../shared/performance.ts';
import type { Agent, Snapshot, Task, WorkPolicy } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { krw, roi } from '../format.ts';
import { useLanguage } from '../LanguageProvider.tsx';

const DAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

const statusKey = (agent: Agent) =>
  agent.status === 'off_duty' ? '퇴근' : agent.status === 'capacity_exhausted' ? '일일 한도 종료' : agent.paused ? '일시정지' : '근무 가능';

export function WorkPolicyEditor({ agent, onError, onNotice, actions }: { agent: Agent; onError: (m: string) => void; onNotice: (m: string) => void; actions?: ReactNode }) {
  const { t, tpl } = useLanguage();
  const [policy, setPolicy] = useState(agent.workPolicy);
  const [saving, setSaving] = useState(false);
  useEffect(() => setPolicy(agent.workPolicy), [agent.workPolicy]);
  const patch = <K extends keyof WorkPolicy>(key: K, value: WorkPolicy[K]) => setPolicy((p) => ({ ...p, [key]: value }));
  const save = async () => {
    setSaving(true);
    try {
      await api.updateAgent(agent.id, { workPolicy: policy });
      onNotice(tpl('{name}의 근무 정책을 저장했어요.', { name: agent.name }));
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="work-policy-editor">
      <h3>{t('근무 정책')}</h3>
      <label className="check"><input type="checkbox" checked={policy.enabled} onChange={(e) => patch('enabled', e.target.checked)} /> {t('출퇴근 시간 사용')}</label>
      <div className="work-days">{DAYS.map((label, day) => <button type="button" key={label} className={policy.days.includes(day) ? 'selected' : ''} onClick={() => patch('days', policy.days.includes(day) ? policy.days.filter((d) => d !== day) : [...policy.days, day].sort())}>{t(label)}</button>)}</div>
      <div className="work-fields">
        <label>{t('출근')} <input type="time" value={policy.start} onChange={(e) => patch('start', e.target.value)} /></label>
        <label>{t('퇴근')} <input type="time" value={policy.end} onChange={(e) => patch('end', e.target.value)} /></label>
        <label>{t('시간대')} <input value={policy.timezone} onChange={(e) => patch('timezone', e.target.value)} /></label>
        <label>{t('일일 토큰 한도')} <input type="number" min="1" placeholder={t('제한 없음')} value={policy.maxTokens ?? ''} onChange={(e) => patch('maxTokens', e.target.value ? Number(e.target.value) : null)} /></label>
        <label>{t('일일 작업 시간(분)')} <input type="number" min="1" placeholder={t('제한 없음')} value={policy.maxWorkMinutes ?? ''} onChange={(e) => patch('maxWorkMinutes', e.target.value ? Number(e.target.value) : null)} /></label>
      </div>
      <div className="row end wrap"><button type="button" className="pixel-btn primary" disabled={saving || policy.days.length === 0} onClick={() => void save()}>{saving ? t('저장 중…') : t('근무 정책 저장')}</button>{actions}</div>
    </section>
  );
}

// ───────────────────────────── 근무·효율 대시보드 ─────────────────────────────

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 7;

type Area = 'uptime' | 'speed' | 'quality' | 'cost' | 'capacity';
const AREA_LABEL: Record<Area, string> = { uptime: '가동', speed: '처리 속도', quality: '품질', cost: '비용 효율', capacity: '한도·근무' };

/** Groups agent statuses into what the bar and the counts show. */
const STATUS_GROUPS: { key: string; label: string; color: string; match: (a: Agent) => boolean }[] = [
  { key: 'working', label: '일하는 중', color: 'var(--green)', match: (a) => !a.paused && (a.status === 'working' || a.status === 'collaborating') },
  { key: 'waiting', label: '대기·승인 대기', color: 'var(--yellow)', match: (a) => !a.paused && (a.status === 'waiting' || a.status === 'awaiting_approval' || a.status === 'help_requested') },
  { key: 'idle', label: '쉬는 중', color: 'var(--blue)', match: (a) => !a.paused && a.status === 'idle' },
  { key: 'off', label: '퇴근·한도 종료', color: 'var(--muted)', match: (a) => !a.paused && (a.status === 'off_duty' || a.status === 'capacity_exhausted') },
  { key: 'paused', label: '일시정지', color: 'var(--line)', match: (a) => a.paused },
  { key: 'error', label: '오류', color: 'var(--red)', match: (a) => !a.paused && a.status === 'error' },
];

const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);
const leadMs = (task: Task) => (task.completedAt ? new Date(task.completedAt).getTime() - new Date(task.createdAt).getTime() : null);
const firstPass = (task: Task) => (task.reviews.length ? task.reviews[0].approved : null);
const limitPct = (agent: Agent) => {
  const { maxTokens, maxWorkMinutes } = agent.workPolicy;
  const tokens = maxTokens ? (agent.dailyUsage.tokens / maxTokens) * 100 : 0;
  const minutes = maxWorkMinutes ? (agent.dailyUsage.workMs / 60_000 / maxWorkMinutes) * 100 : 0;
  return maxTokens || maxWorkMinutes ? Math.min(100, Math.round(Math.max(tokens, minutes))) : null;
};

function useDuration() {
  const { tpl } = useLanguage();
  return (ms: number | null) => {
    if (ms === null) return '—';
    const minutes = ms / 60_000;
    if (minutes < 1) return tpl('{n}초', { n: Math.max(1, Math.round(ms / 1000)) });
    if (minutes < 120) return tpl('{n}분', { n: Math.round(minutes) });
    if (minutes < 60 * 48) return tpl('{n}시간', { n: Math.round(minutes / 60) });
    return tpl('{n}일', { n: Math.round(minutes / 60 / 24) });
  };
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'warn' | 'bad' }) {
  return (
    <div className={`kpi ${tone ? `kpi-${tone}` : ''}`}>
      <span className="kpi-label">{label}</span>
      <b className="kpi-value">{value}</b>
      {sub && <span className="kpi-sub">{sub}</span>}
    </div>
  );
}

/** Seven daily columns: completed tasks as bars, cost as a line. */
function TrendChart({ days }: { days: { label: string; done: number; cost: number }[] }) {
  const { t } = useLanguage();
  const W = 560;
  const H = 180;
  const pad = { l: 28, r: 12, t: 14, b: 26 };
  const maxDone = Math.max(1, ...days.map((d) => d.done));
  const maxCost = Math.max(1, ...days.map((d) => d.cost));
  const step = (W - pad.l - pad.r) / days.length;
  const y = (v: number, max: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const line = days.map((d, i) => `${pad.l + step * i + step / 2},${y(d.cost, maxCost)}`).join(' ');
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('최근 7일 완료 업무와 비용')}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={y(maxDone * f, maxDone)} y2={y(maxDone * f, maxDone)} className="chart-grid" />
            <text x={pad.l - 6} y={y(maxDone * f, maxDone) + 4} textAnchor="end" className="chart-axis">
              {Math.round(maxDone * f)}
            </text>
          </g>
        ))}
        {days.map((d, i) => {
          const x = pad.l + step * i + step * 0.2;
          const top = y(d.done, maxDone);
          return (
            <g key={d.label}>
              <rect x={x} y={top} width={step * 0.6} height={H - pad.b - top} className="chart-bar">
                <title>{`${d.label}: ${d.done}`}</title>
              </rect>
              <text x={x + step * 0.3} y={H - 8} textAnchor="middle" className="chart-axis">
                {d.label}
              </text>
            </g>
          );
        })}
        <polyline points={line} className="chart-line" />
        {days.map((d, i) => (
          <circle key={d.label} cx={pad.l + step * i + step / 2} cy={y(d.cost, maxCost)} r={3} className="chart-dot" />
        ))}
      </svg>
      <figcaption className="chart-legend">
        <span>
          <i className="swatch swatch-bar" /> {t('완료 업무')}
        </span>
        <span>
          <i className="swatch swatch-line" /> {t('AI 비용')}
        </span>
      </figcaption>
    </figure>
  );
}

function StatusBar({ agents }: { agents: Agent[] }) {
  const { t } = useLanguage();
  const groups = STATUS_GROUPS.map((g) => ({ ...g, count: agents.filter(g.match).length })).filter((g) => g.count > 0);
  return (
    <div>
      <div className="stack-bar" role="img" aria-label={t('직원 상태 분포')}>
        {groups.map((g) => (
          <span key={g.key} style={{ flex: g.count, background: g.color }} title={`${t(g.label)} ${g.count}`} />
        ))}
      </div>
      <div className="chart-legend">
        {groups.map((g) => (
          <span key={g.key}>
            <i className="swatch" style={{ background: g.color }} /> {t(g.label)} {g.count}
          </span>
        ))}
      </div>
    </div>
  );
}

function HBars({ rows, format }: { rows: { label: string; value: number; note?: string; warn?: boolean }[]; format: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="hbars">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="hbar-label">{r.label}</span>
          <span className="hbar-track">
            <span className={`hbar-fill ${r.warn ? 'warn' : ''}`} style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="hbar-value">
            {format(r.value)}
            {r.note ? ` · ${r.note}` : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function WorkTab({ snapshot }: { snapshot: Snapshot; onError: (m: string) => void; onNotice: (m: string) => void }) {
  const { t, tpl } = useLanguage();
  const duration = useDuration();
  const { agents, tasks, offices, performance } = snapshot;
  const now = Date.now();
  const since = now - WINDOW_DAYS * DAY_MS;
  const officeName = (id: string) => t(offices.find((o) => o.id === id)?.name ?? id);

  // ── 가동 ──
  const working = agents.filter(STATUS_GROUPS[0].match).length;
  const unavailable = agents.filter((a) => a.paused || a.status === 'off_duty' || a.status === 'capacity_exhausted').length;
  const available = agents.length - unavailable;
  const uptimePct = pct(working, available);
  const todayMs = agents.reduce((sum, a) => sum + a.dailyUsage.workMs, 0);
  const todayTokens = agents.reduce((sum, a) => sum + a.dailyUsage.tokens, 0);

  // ── 처리 속도 ──
  const recentDone = tasks.filter((x) => x.status === 'completed' && x.completedAt && new Date(x.completedAt).getTime() >= since);
  const lead = median(recentDone.map(leadMs).filter((v): v is number => v !== null));
  const queued = tasks.filter((x) => x.status === 'queued').length;
  const waitingUser = tasks.filter((x) => x.status === 'awaiting_approval' || x.status === 'awaiting_help');
  const failed = tasks.filter((x) => x.status === 'failed' && new Date(x.createdAt).getTime() >= since).length;

  // ── 품질 ──
  const reviewed = recentDone.map(firstPass).filter((v): v is boolean => v !== null);
  const firstPassPct = pct(reviewed.filter(Boolean).length, reviewed.length);
  const reviewRecords = reviewsOf(performance).filter((r) => new Date(r.at).getTime() >= since);
  const reviewPassPct = pct(reviewRecords.filter((r) => r.approved).length, reviewRecords.length);

  // ── 비용 효율 ──
  const cost7 = recentDone.reduce((sum, x) => sum + x.costKrw, 0);
  const value7 = recentDone.reduce((sum, x) => sum + (x.value?.recognizedKrw ?? 0), 0);
  const costPerTask = recentDone.length ? cost7 / recentDone.length : null;

  // ── 추이 ──
  const days = Array.from({ length: WINDOW_DAYS }, (_, i) => {
    const start = new Date(now - (WINDOW_DAYS - 1 - i) * DAY_MS);
    start.setHours(0, 0, 0, 0);
    const end = start.getTime() + DAY_MS;
    const done = tasks.filter((x) => x.completedAt && new Date(x.completedAt).getTime() >= start.getTime() && new Date(x.completedAt).getTime() < end);
    return { label: `${start.getMonth() + 1}/${start.getDate()}`, done: done.length, cost: done.reduce((sum, x) => sum + x.costKrw, 0) };
  });

  // ── 단계별 소요 시간 (병목) ──
  const byStep = new Map<string, number[]>();
  for (const r of performance) if (new Date(r.at).getTime() >= since) byStep.set(r.stepLabel, [...(byStep.get(r.stepLabel) ?? []), r.durationMs]);
  const stepRows = [...byStep.entries()]
    .map(([label, list]) => ({ label: t(label), value: list.reduce((a, b) => a + b, 0) / list.length, count: list.length }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
  const overallStep = stepRows.length ? stepRows.reduce((a, r) => a + r.value * r.count, 0) / stepRows.reduce((a, r) => a + r.count, 0) : null;

  // ── 사무실별 ──
  const officeRows = offices.map((o) => {
    const staff = agents.filter((a) => a.officeId === o.id);
    const done = recentDone.filter((x) => x.officeId === o.id);
    const passes = done.map(firstPass).filter((v): v is boolean => v !== null);
    const cost = done.reduce((sum, x) => sum + x.costKrw, 0);
    const value = done.reduce((sum, x) => sum + (x.value?.recognizedKrw ?? 0), 0);
    return {
      office: o,
      staff: staff.length,
      busy: staff.filter(STATUS_GROUPS[0].match).length,
      done: done.length,
      lead: median(done.map(leadMs).filter((v): v is number => v !== null)),
      firstPass: pct(passes.filter(Boolean).length, passes.length),
      cost,
      value,
      queued: tasks.filter((x) => x.officeId === o.id && x.status === 'queued').length,
    };
  });

  // ── 직원별 ──
  const agentRows = agents
    .map((a) => {
      const steps = performance.filter((r) => r.agentId === a.id && new Date(r.at).getTime() >= since);
      const asWriter = reviewRecords.filter((r) => r.writerId === a.id);
      return {
        agent: a,
        minutes: Math.round(a.dailyUsage.workMs / 60_000),
        limit: limitPct(a),
        avgStep: steps.length ? steps.reduce((s, r) => s + r.durationMs, 0) / steps.length : null,
        pass: pct(asWriter.filter((r) => r.approved).length, asWriter.length),
        costPerTask: a.tasksDone ? a.costKrw / a.tasksDone : null,
      };
    })
    .sort((x, y) => y.minutes - x.minutes || y.agent.tasksDone - x.agent.tasksDone);

  // ── 개선 포인트 ──
  const insights: { area: Area; level: 'bad' | 'warn' | 'good'; text: string }[] = [];
  if (waitingUser.length) insights.push({ area: 'speed', level: 'warn', text: tpl('승인·도움 요청 {n}건이 사용자 응답을 기다리고 있어요. 지금 가장 큰 병목은 사용자 응답이에요.', { n: waitingUser.length }) });
  if (queued && available - working > 0) insights.push({ area: 'uptime', level: 'warn', text: tpl('대기 중인 업무가 {n}건인데 쉬는 직원이 {idle}명이에요. 사무실 자동 실행을 켜거나 업무를 다른 사무실로 나눠 보세요.', { n: queued, idle: available - working }) });
  if (!recentDone.length) insights.push({ area: 'uptime', level: 'warn', text: t('최근 7일 동안 끝난 업무가 없어요. 칠판에 업무를 등록하면 가동률과 효율이 여기에 쌓여요.') });
  const slow = stepRows[0];
  if (slow && overallStep && slow.value > overallStep * 1.5 && slow.count >= 2) insights.push({ area: 'speed', level: 'warn', text: tpl('"{step}" 단계가 평균 {time}로 가장 느려요(전체 평균 {avg}). 이 단계 담당의 모델이나 지시를 손보세요.', { step: slow.label, time: duration(slow.value), avg: duration(overallStep) }) });
  if (firstPassPct !== null && reviewed.length >= 3 && firstPassPct < 60) insights.push({ area: 'quality', level: 'bad', text: tpl('첫 검토 통과율이 {pct}%예요. 반려가 많아 재작업 비용이 커요. 성과·개선 탭에서 작성자 규칙이나 모델 등급을 올려 보세요.', { pct: firstPassPct }) });
  if (failed) insights.push({ area: 'quality', level: 'bad', text: tpl('최근 7일 동안 중단된 업무가 {n}건 있어요. 업무 실행 기록에서 원인을 확인하세요.', { n: failed }) });
  for (const row of officeRows) if (row.cost > 0 && row.value < row.cost) insights.push({ area: 'cost', level: 'bad', text: tpl('{office}는 최근 7일 비용 {cost}이 인정 가치 {value}보다 커요. 모델 등급을 낮추거나 단계를 줄여 보세요.', { office: t(row.office.name), cost: krw(row.cost), value: krw(row.value) }) });
  for (const row of agentRows) if (row.limit !== null && row.limit >= 80) insights.push({ area: 'capacity', level: row.limit >= 100 ? 'bad' : 'warn', text: tpl('{name}이(가) 일일 한도의 {pct}%를 썼어요. 한도를 늘리거나 같은 역할 직원을 더 두세요.', { name: row.agent.name, pct: row.limit }) });
  const offDuty = agents.filter((a) => a.status === 'off_duty').length;
  if (offDuty && queued) insights.push({ area: 'capacity', level: 'warn', text: tpl('퇴근한 직원이 {n}명이라 대기 업무가 늦어질 수 있어요. 근무 시간을 확인하세요.', { n: offDuty }) });
  if (!insights.length) insights.push({ area: 'uptime', level: 'good', text: t('눈에 띄는 문제가 없어요. 이 흐름을 유지하세요.') });

  const tone = (value: number | null, good: number, bad: number, higherIsBetter = true) =>
    value === null ? undefined : higherIsBetter ? (value >= good ? 'good' : value < bad ? 'bad' : 'warn') : value <= good ? 'good' : value > bad ? 'bad' : 'warn';
  const percentText = (v: number | null) => (v === null ? '—' : `${v}%`);

  return (
    <main className="page work-dashboard">
      <h2>{t('근무·효율')}</h2>
      <p className="muted">{t('회사 전체의 가동률과 효율을 분야별로 보고, 어디를 고치면 좋을지 짚어 줘요. 기간은 최근 7일이에요.')}</p>

      <section className="pixel-box dash-section">
        <h3>{t('개선 포인트')}</h3>
        <ul className="insights">
          {insights.map((item, i) => (
            <li key={i} className={`insight insight-${item.level}`}>
              <span className="insight-area">{t(AREA_LABEL[item.area])}</span>
              <span>{item.text}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="kpi-grid">
        <section className="pixel-box dash-section">
          <h3>⚙️ {t('가동')}</h3>
          <div className="kpis">
            <Kpi label={t('지금 가동률')} value={percentText(uptimePct)} sub={tpl('근무 가능 {n}명 중 {busy}명이 일하는 중', { n: available, busy: working })} tone={tone(uptimePct, 50, 20)} />
            <Kpi label={t('오늘 AI 작업 시간')} value={duration(todayMs)} sub={tpl('토큰 {n}', { n: todayTokens.toLocaleString() })} />
          </div>
          <StatusBar agents={agents} />
        </section>
        <section className="pixel-box dash-section">
          <h3>⏱️ {t('처리 속도')}</h3>
          <div className="kpis">
            <Kpi label={t('완료 업무')} value={String(recentDone.length)} sub={tpl('하루 평균 {n}건', { n: (recentDone.length / WINDOW_DAYS).toFixed(1) })} />
            <Kpi label={t('처리 시간(중앙값)')} value={duration(lead)} sub={t('등록부터 완료까지')} />
            <Kpi label={t('대기 업무')} value={String(queued)} tone={queued > 3 ? 'warn' : undefined} />
            <Kpi label={t('사용자 응답 대기')} value={String(waitingUser.length)} tone={waitingUser.length ? 'warn' : 'good'} />
          </div>
        </section>
        <section className="pixel-box dash-section">
          <h3>✅ {t('품질')}</h3>
          <div className="kpis">
            <Kpi label={t('첫 검토 통과율')} value={percentText(firstPassPct)} sub={tpl('검토한 업무 {n}건', { n: reviewed.length })} tone={tone(firstPassPct, 80, 60)} />
            <Kpi label={t('검토 통과율')} value={percentText(reviewPassPct)} sub={tpl('검토 {n}회', { n: reviewRecords.length })} tone={tone(reviewPassPct, 80, 60)} />
            <Kpi label={t('중단된 업무')} value={String(failed)} tone={failed ? 'bad' : 'good'} />
          </div>
        </section>
        <section className="pixel-box dash-section">
          <h3>💰 {t('비용 효율')}</h3>
          <div className="kpis">
            <Kpi label={t('AI 비용')} value={krw(cost7)} />
            <Kpi label={t('인정 가치')} value={krw(value7)} />
            <Kpi label={t('투자 대비 이익')} value={roi(value7, cost7)} tone={cost7 > 0 ? (value7 >= cost7 ? 'good' : 'bad') : undefined} />
            <Kpi label={t('업무당 비용')} value={costPerTask === null ? '—' : krw(costPerTask)} />
          </div>
        </section>
      </div>

      <div className="chart-grid-2">
        <section className="pixel-box dash-section">
          <h3>{t('최근 7일 추이')}</h3>
          <TrendChart days={days} />
        </section>
        <section className="pixel-box dash-section">
          <h3>{t('단계별 평균 소요 시간')}</h3>
          {stepRows.length ? (
            <HBars rows={stepRows.map((r, i) => ({ label: r.label, value: r.value, note: tpl('{n}회', { n: r.count }), warn: i === 0 && stepRows.length > 1 }))} format={duration} />
          ) : (
            <p className="muted small">{t('아직 단계 기록이 없어요.')}</p>
          )}
        </section>
      </div>

      <section className="pixel-box dash-section">
        <h3>{t('사무실별 효율')}</h3>
        <div className="table-scroll">
          <table className="table dash-table">
            <thead>
              <tr>
                <th>{t('사무실')}</th>
                <th>{t('가동')}</th>
                <th className="num">{t('완료')}</th>
                <th className="num">{t('처리 시간')}</th>
                <th className="num">{t('첫 통과')}</th>
                <th className="num">{t('비용')}</th>
                <th className="num">{t('인정 가치')}</th>
                <th className="num">{t('이익률')}</th>
                <th className="num">{t('대기')}</th>
              </tr>
            </thead>
            <tbody>
              {officeRows.map((r) => (
                <tr key={r.office.id}>
                  <td>{t(r.office.name)}</td>
                  <td>
                    <span className="mini-meter">
                      <span style={{ width: `${r.staff ? (r.busy / r.staff) * 100 : 0}%` }} />
                    </span>{' '}
                    {r.busy}/{r.staff}
                  </td>
                  <td className="num">{r.done}</td>
                  <td className="num">{duration(r.lead)}</td>
                  <td className={`num ${r.firstPass !== null && r.firstPass < 60 ? 'neg' : ''}`}>{percentText(r.firstPass)}</td>
                  <td className="num">{krw(r.cost)}</td>
                  <td className="num">{krw(r.value)}</td>
                  <td className={`num ${r.cost > 0 && r.value < r.cost ? 'neg' : 'pos'}`}>{roi(r.value, r.cost)}</td>
                  <td className="num">{r.queued}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="pixel-box dash-section">
        <h3>{t('직원별 효율')}</h3>
        <div className="table-scroll">
          <table className="table dash-table">
            <thead>
              <tr>
                <th>{t('직원')}</th>
                <th>{t('사무실')}</th>
                <th>{t('상태')}</th>
                <th className="num">{t('오늘 작업')}</th>
                <th>{t('한도 사용')}</th>
                <th className="num">{t('완료 업무')}</th>
                <th className="num">{t('평균 단계 시간')}</th>
                <th className="num">{t('검토 통과')}</th>
                <th className="num">{t('업무당 비용')}</th>
              </tr>
            </thead>
            <tbody>
              {agentRows.map((r) => (
                <tr key={r.agent.id}>
                  <td>{r.agent.name}</td>
                  <td className="muted">{officeName(r.agent.officeId)}</td>
                  <td>
                    <span className={`work-status status-${r.agent.status}`}>{t(STATUS_GROUPS.find((g) => g.match(r.agent))?.label ?? statusKey(r.agent))}</span>
                  </td>
                  <td className="num">{duration(r.agent.dailyUsage.workMs)}</td>
                  <td>
                    {r.limit === null ? (
                      <span className="muted small">{t('제한 없음')}</span>
                    ) : (
                      <>
                        <span className={`mini-meter ${r.limit >= 80 ? 'warn' : ''}`}>
                          <span style={{ width: `${r.limit}%` }} />
                        </span>{' '}
                        {r.limit}%
                      </>
                    )}
                  </td>
                  <td className="num">{r.agent.tasksDone}</td>
                  <td className="num">{duration(r.avgStep)}</td>
                  <td className={`num ${r.pass !== null && r.pass < 60 ? 'neg' : ''}`}>{percentText(r.pass)}</td>
                  <td className="num">{r.costPerTask === null ? '—' : krw(r.costPerTask)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">{t('근무일·출퇴근 시간·일일 한도는 직원 관리에서 정해요.')}</p>
      </section>
    </main>
  );
}
