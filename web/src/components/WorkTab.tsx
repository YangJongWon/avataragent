import { useEffect, useState } from 'react';
import type { Agent, Snapshot, WorkPolicy } from '../../../shared/types.ts';
import { api } from '../api.ts';

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

function PolicyCard({ agent, onError, onNotice }: { agent: Agent; onError: (m: string) => void; onNotice: (m: string) => void }) {
  const [policy, setPolicy] = useState(agent.workPolicy);
  const [saving, setSaving] = useState(false);
  useEffect(() => setPolicy(agent.workPolicy), [agent.workPolicy]);
  const patch = <K extends keyof WorkPolicy>(key: K, value: WorkPolicy[K]) => setPolicy((p) => ({ ...p, [key]: value }));
  const save = async () => {
    setSaving(true);
    try { await api.updateAgent(agent.id, { workPolicy: policy }); onNotice(`${agent.name}의 근무 정책을 저장했어요.`); }
    catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  };
  const status = agent.status === 'off_duty' ? '퇴근' : agent.status === 'capacity_exhausted' ? '일일 한도 종료' : agent.paused ? '일시정지' : '근무 가능';
  return <section className="pixel-box work-card">
    <div className="work-card-head"><div><strong>{agent.name}</strong><span>{status}</span></div><label><input type="checkbox" checked={policy.enabled} onChange={(e) => patch('enabled', e.target.checked)} /> 출퇴근 시간 사용</label></div>
    <div className="work-days">{DAYS.map((label, day) => <button type="button" key={label} className={policy.days.includes(day) ? 'selected' : ''} onClick={() => patch('days', policy.days.includes(day) ? policy.days.filter((d) => d !== day) : [...policy.days, day].sort())}>{label}</button>)}</div>
    <div className="work-fields">
      <label>출근 <input type="time" value={policy.start} onChange={(e) => patch('start', e.target.value)} /></label>
      <label>퇴근 <input type="time" value={policy.end} onChange={(e) => patch('end', e.target.value)} /></label>
      <label>시간대 <input value={policy.timezone} onChange={(e) => patch('timezone', e.target.value)} /></label>
      <label>일일 토큰 한도 <input type="number" min="1" placeholder="제한 없음" value={policy.maxTokens ?? ''} onChange={(e) => patch('maxTokens', e.target.value ? Number(e.target.value) : null)} /></label>
      <label>일일 작업 시간(분) <input type="number" min="1" placeholder="제한 없음" value={policy.maxWorkMinutes ?? ''} onChange={(e) => patch('maxWorkMinutes', e.target.value ? Number(e.target.value) : null)} /></label>
    </div>
    <div className="work-usage">오늘 사용: {agent.dailyUsage.tokens.toLocaleString()} 토큰 · AI 호출 {Math.ceil(agent.dailyUsage.workMs / 60_000)}분</div>
    <button type="button" className="primary" disabled={saving || policy.days.length === 0} onClick={() => void save()}>{saving ? '저장 중…' : '저장'}</button>
  </section>;
}

export function WorkTab({ snapshot, onError, onNotice }: { snapshot: Snapshot; onError: (m: string) => void; onNotice: (m: string) => void }) {
  return <main className="page"><h2>근무·효율</h2><p className="muted">근무 시간이 끝나거나 일일 한도에 도달하면 현재 호출을 마친 뒤 퇴근하고, 다음 근무일에 자동 복귀합니다.</p><div className="work-grid">{snapshot.agents.map((agent) => <PolicyCard key={agent.id} agent={agent} onError={onError} onNotice={onNotice} />)}</div></main>;
}
