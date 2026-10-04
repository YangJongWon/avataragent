import { useState } from 'react';
import { buildPlaybook, changeText, parsePlaybook, playbookChanges, playbookStats, type Playbook, type PlaybookStats } from '../../../shared/playbook.ts';
import { TEAMS } from '../../../shared/teams.ts';
import type { Office, Snapshot } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { krw, roleTitle } from '../format.ts';

const pct = (v: number | null) => (v === null ? '-' : `${Math.round(v * 100)}%`);
const pts = (v: number | null) => (v === null ? '-' : `${Math.round(v)}점`);
const secs = (v: number | null) => (v === null ? '-' : `${Math.round(v / 1000)}초`);
const won = (v: number | null) => (v === null ? '-' : krw(v));

const ROWS: [string, (s: PlaybookStats) => string][] = [
  ['완료 업무', (s) => `${s.completedTasks}건`],
  ['검수 통과율', (s) => `${pct(s.reviewPassRate)} (${s.reviews}회)`],
  ['첫 시도 통과율', (s) => pct(s.firstPassRate)],
  ['평균 검수 점수', (s) => pts(s.avgReviewScore)],
  ['조사 정확도', (s) => `${pts(s.researchAccuracy)} (${s.researchRuns}회)`],
  ['조사 속도', (s) => secs(s.researchAvgMs)],
  ['검수 판단 정확도', (s) => pct(s.reviewerAgreement)],
  ['업무당 비용', (s) => won(s.costPerTaskKrw)],
  ['업무당 인정 가치', (s) => won(s.valuePerTaskKrw)],
];

function download(playbook: Playbook) {
  const blob = new Blob([JSON.stringify(playbook, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `playbook-${playbook.team}-${playbook.exportedAt.slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function PlaybookPanel(props: { snapshot: Snapshot; office: Office; onError: (m: string) => void; onNotice: (m: string) => void }) {
  const { snapshot, office } = props;
  const [name, setName] = useState('');
  const [loaded, setLoaded] = useState<Playbook | null>(null);
  const [includeModel, setIncludeModel] = useState(false);
  const [acceptWarnings, setAcceptWarnings] = useState(false);
  const [busy, setBusy] = useState(false);
  const agentOf = (id: string) => snapshot.agents.find((a) => a.id === id);
  const current = playbookStats(office, snapshot.agents, snapshot.performance, snapshot.tasks);

  let changes: ReturnType<typeof playbookChanges> = [];
  let mismatch = '';
  if (loaded) {
    try {
      changes = playbookChanges(loaded, office, snapshot.agents, snapshot.models, includeModel);
    } catch (e) {
      mismatch = e instanceof Error ? e.message : String(e);
    }
  }
  const warned = changes.some((c) => c.warnings.length);

  const open = async (file: File | undefined) => {
    if (!file) return;
    try {
      setLoaded(parsePlaybook(JSON.parse(await file.text())));
      setAcceptWarnings(false);
    } catch (e) {
      props.onError(e instanceof SyntaxError ? 'JSON 파일을 읽지 못했어요.' : e instanceof Error ? e.message : String(e));
    }
  };

  const apply = async () => {
    if (!loaded) return;
    setBusy(true);
    try {
      const result = await api.applyPlaybook(office.id, { playbook: loaded, includeModel, acceptWarnings });
      props.onNotice(`"${loaded.name}"을(를) ${office.name}에 적용했어요. (${result.changes.length}건 변경)`);
      setLoaded(null);
    } catch (e) {
      props.onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="pixel-box section">
      <h3>플레이북 공유</h3>
      <p className="muted small">
        이 사무실의 역할별 성격·개인 규칙·모델 등급과 성과표를 파일로 내보내 다른 회사와 주고받을 수 있어요. 직원 이름, 업무 자료, 결과물, 반려 사유, 키는 담기지 않아요.
      </p>
      <div className="row">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`${TEAMS[office.team].name} 플레이북`} maxLength={60} />
        <button className="pixel-btn small" onClick={() => download(buildPlaybook(office, snapshot.agents, snapshot.performance, snapshot.tasks, snapshot.models, name))}>
          내보내기
        </button>
        <label className="pixel-btn small">
          가져오기…
          <input type="file" accept="application/json,.json" hidden onChange={(e) => void open(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
        </label>
      </div>

      {loaded && (
        <div className="playbook-preview">
          <h4>
            {loaded.name} <span className="muted small">({TEAMS[loaded.team].name} · {loaded.exportedAt.slice(0, 10)})</span>
          </h4>
          <table className="table">
            <thead>
              <tr>
                <th>지표</th>
                <th className="num">가져온 플레이북</th>
                <th className="num">이 사무실</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map(([label, show]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td className="num">{show(loaded.stats)}</td>
                  <td className="num">{show(current)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">성과는 보낸 쪽이 직접 기록한 값이에요. 표본이 적으면 참고만 하세요.</p>

          {mismatch ? (
            <p className="neg small">{mismatch}</p>
          ) : (
            <>
              <label className="toggle">
                <input type="checkbox" checked={includeModel} onChange={(e) => setIncludeModel(e.target.checked)} />
                모델 등급도 맞추기 <span className="muted small">(비용이 달라질 수 있어요)</span>
              </label>
              {changes.length === 0 ? (
                <p className="muted small">바뀌는 것이 없어요.</p>
              ) : (
                <ul className="perf-history small">
                  {changes.map((c) => {
                    const agent = agentOf(c.agentId);
                    const text = changeText(c, snapshot.models);
                    return (
                      <li key={`${c.agentId}:${c.field}`} className={c.warnings.length ? 'playbook-warn' : ''}>
                        <b>{agent?.name}</b> <span className="muted">{agent ? roleTitle(agent, snapshot.offices) : c.role}</span> ·{' '}
                        {c.field === 'personality' ? '성격' : c.field === 'model' ? '모델' : '개인 규칙'}
                        {c.field === 'rules' ? (
                          <pre className="playbook-rules">{text.to || '(없음)'}</pre>
                        ) : (
                          <>
                            {' '}
                            {text.from} → <b>{text.to}</b>
                          </>
                        )}
                        {c.warnings.length > 0 && <div className="neg">⚠ 주의: {c.warnings.join(', ')}</div>}
                      </li>
                    );
                  })}
                </ul>
              )}
              {warned && (
                <label className="toggle">
                  <input type="checkbox" checked={acceptWarnings} onChange={(e) => setAcceptWarnings(e.target.checked)} />
                  주의 표시된 규칙을 읽어 봤고 그대로 적용할게요 <span className="muted small">(조직 안전 규칙은 항상 우선해요)</span>
                </label>
              )}
              <div className="row">
                <button className="pixel-btn small primary" disabled={busy || changes.length === 0 || (warned && !acceptWarnings)} onClick={apply}>
                  {office.name}에 적용
                </button>
                <button className="pixel-btn small" onClick={() => setLoaded(null)}>
                  닫기
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
