import { useState } from 'react';
import { TEAMS } from '../../../shared/teams.ts';
import type { Office, Recommendation, Snapshot } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { krw, timeOf } from '../format.ts';

interface Props {
  snapshot: Snapshot;
  office: Office;
  busy: boolean;
  canManage: boolean;
  onStart: () => void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}

const KIND_LABEL: Record<Recommendation['kind'], string> = { event: '🎟️ 행사', youtube: '▶️ 유튜브', activity: '🚶 활동', rest: '☕ 휴식' };

export function TeamDataPanel(props: Props) {
  const { office } = props;
  const team = TEAMS[office.team];
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      props.onError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <fieldset className="team-data" disabled={!props.canManage}>
      {!props.canManage && <p className="small muted">팀 자료를 바꾸려면 사무실 관리 권한이 필요해요.</p>}
      {team.autoRunLabel && (
        <label className="toggle">
          <input type="checkbox" checked={office.autoRun} onChange={(e) => run(() => api.updateOffice(office.id, { autoRun: e.target.checked }))} />
          {team.autoRunLabel} <span className="muted small">(새 항목이 있으면 팀이 알아서 업무를 시작해요. 반영은 항상 승인 후)</span>
        </label>
      )}
      {office.team === 'hr' && <HrData {...props} run={run} />}
      {office.team === 'support' && <SupportData {...props} run={run} />}
      {office.team === 'welfare' && <WelfareData {...props} run={run} />}
      {office.team === 'mgmt' && <MgmtData {...props} run={run} />}
      {office.team === 'dev' && (
        <p className="muted">
          개발팀은 칠판에 과제를 붙이면 업무 여정(기본: 자료 수집 → 분석·정리 → 검토)대로 보고서를 만들어요. 과제가 모호하면 곤란한 표정으로 도움을 요청해요.
        </p>
      )}
    </fieldset>
  );
}

type Run = { run: (fn: () => Promise<unknown>) => Promise<void> };

function HrData({ snapshot, busy, onStart, run }: Props & Run) {
  const pending = snapshot.mailbox.filter((m) => !m.processed);
  return (
    <>
      <div className="row">
        <button className="pixel-btn small" onClick={() => run(api.simulateMail)}>
          📨 새 메일 도착 (시뮬레이션)
        </button>
        <button className="pixel-btn small primary" disabled={busy || pending.length === 0} onClick={onStart}>
          메일함 정리 시작 ({pending.length})
        </button>
      </div>
      <h4>메일함</h4>
      <ul className="data-list">
        {snapshot.mailbox.map((m) => (
          <li key={m.id} className={m.processed ? 'done' : ''}>
            <span className="data-tag">{m.processed ? '정리됨' : '새 메일'}</span>
            <b>{m.subject}</b>
            <span className="muted small"> · {m.from.split('<')[0].trim()} · {timeOf(m.receivedAt)}</span>
          </li>
        ))}
      </ul>
      <h4>캘린더</h4>
      {snapshot.calendar.length ? (
        <ul className="data-list">
          {snapshot.calendar.map((c) => (
            <li key={c.id}>
              📅 <b>{c.date}</b> {c.start}~{c.end} {c.title}
              {c.location && <span className="muted small"> · {c.location}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">아직 등록된 일정이 없어요. 메일함을 정리하고 승인하면 여기에 들어와요.</p>
      )}
    </>
  );
}

function SupportData({ snapshot, busy, onStart, onNotice, run }: Props & Run) {
  const pending = snapshot.inquiries.filter((q) => q.status === 'new');
  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    onNotice('답변을 복사했어요. 직접 확인한 뒤 보내 주세요.');
  };
  return (
    <>
      <div className="row">
        <button className="pixel-btn small" onClick={() => run(api.simulateInquiry)}>
          🎧 새 문의 도착 (시뮬레이션)
        </button>
        <button className="pixel-btn small primary" disabled={busy || pending.length === 0} onClick={onStart}>
          답변 초안 시작 ({pending.length})
        </button>
      </div>
      <h4>문의함</h4>
      <ul className="data-list">
        {snapshot.inquiries.map((q) => (
          <li key={q.id} className={q.status === 'reply_ready' ? 'done' : ''}>
            <span className="data-tag">{q.status === 'new' ? '새 문의' : '답변 준비됨'}</span>
            <b>{q.subject}</b>
            <span className="muted small"> · {q.customer}</span>
          </li>
        ))}
      </ul>
      <h4>발송 대기함 <span className="muted small">(실제 발송은 하지 않아요)</span></h4>
      {snapshot.outbox.length ? (
        <ul className="data-list">
          {snapshot.outbox.map((o) => (
            <li key={o.id}>
              <details>
                <summary>
                  <span className={`data-tag urgency-${o.urgency}`}>{o.urgency}</span> [{o.category}] {o.to} · {o.subject}
                </summary>
                <pre className="reply-body">{o.body}</pre>
                <button className="pixel-btn small" onClick={() => void copy(o.body)}>
                  복사
                </button>
              </details>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">승인된 답변이 여기에 모여요.</p>
      )}
    </>
  );
}

function WelfareData({ snapshot, busy, onStart, onNotice, run }: Props & Run) {
  const { interests } = snapshot;
  const [keywords, setKeywords] = useState(interests.keywords.join(', '));
  const [region, setRegion] = useState(interests.region);
  const [note, setNote] = useState(interests.note);
  const save = () =>
    run(async () => {
      await api.updateInterests({ keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean), region, note });
      onNotice('관심사를 저장했어요.');
    });
  const busyDays = new Map<string, number>();
  for (const c of snapshot.calendar) busyDays.set(c.date, (busyDays.get(c.date) ?? 0) + 1);
  const packed = [...busyDays.entries()].filter(([, n]) => n >= 2);

  return (
    <>
      <h4>내 관심사</h4>
      <label className="field">
        관심 키워드 (쉼표로 구분)
        <input value={keywords} onChange={(e) => setKeywords(e.target.value)} />
      </label>
      <div className="row">
        <label className="field grow">
          지역
          <input value={region} onChange={(e) => setRegion(e.target.value)} />
        </label>
        <label className="field grow">
          메모
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      <div className="row">
        <button className="pixel-btn small" onClick={save}>
          관심사 저장
        </button>
        <button className="pixel-btn small primary" onClick={onStart}>
          🌿 추천 받기{busy ? ' (대기열)' : ''}
        </button>
      </div>
      {packed.length > 0 && (
        <p className="callout callout-help small">
          일정이 몰린 날: {packed.map(([d, n]) => `${d} (${n}개)`).join(', ')} — 복지팀이 휴식을 먼저 챙겨요.
        </p>
      )}
      <h4>추천 보관함</h4>
      {snapshot.recommendations.length ? (
        <ul className="data-list">
          {snapshot.recommendations.map((r) => (
            <li key={r.id}>
              <span className="data-tag">{KIND_LABEL[r.kind]}</span>
              {r.link ? (
                <a href={r.link} target="_blank" rel="noreferrer">
                  {r.title}
                </a>
              ) : (
                <b>{r.title}</b>
              )}
              <div className="muted small">{r.reason}</div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">추천을 받고 승인하면 여기에 모여요. 유튜브·행사 링크는 검색 결과로 열려요.</p>
      )}
    </>
  );
}

function MgmtData({ snapshot, busy, onStart, onNotice, run }: Props & Run) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const saveCap = (officeId: string) =>
    run(async () => {
      const raw = drafts[officeId]?.trim() ?? '';
      await api.updateOffice(officeId, { budgetKrw: raw === '' ? null : Number(raw) });
      setDrafts((d) => ({ ...d, [officeId]: '' }));
      onNotice('팀 예산 상한을 저장했어요.');
    });
  const capTotal = snapshot.offices.reduce((sum, o) => sum + (o.budgetKrw ?? 0), 0);

  return (
    <>
      <div className="row">
        <button className="pixel-btn small primary" onClick={onStart}>
          📊 예산 배분안 만들기{busy ? ' (대기열)' : ''}
        </button>
        <span className="muted small">
          회사 월 예산 {krw(snapshot.budget.monthlyKrw)} · 팀 상한 합계 {krw(capTotal)}
        </span>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>팀</th>
            <th className="num">비용</th>
            <th className="num">가치</th>
            <th className="num">상한</th>
            <th>직접 조정</th>
          </tr>
        </thead>
        <tbody>
          {snapshot.offices.map((o) => {
            const used = o.budgetKrw ? Math.min(100, (o.spentKrw / o.budgetKrw) * 100) : 0;
            return (
              <tr key={o.id}>
                <td>
                  {TEAMS[o.team].emoji} {o.name}
                </td>
                <td className="num">{krw(o.spentKrw)}</td>
                <td className="num">{krw(o.valueKrw)}</td>
                <td className="num">
                  {o.budgetKrw === null ? '없음' : krw(o.budgetKrw)}
                  {o.budgetKrw !== null && (
                    <div className="meter">
                      <div className={`meter-fill ${used >= 80 ? 'warn' : ''}`} style={{ width: `${used}%` }} />
                    </div>
                  )}
                </td>
                <td>
                  <span className="cap-edit">
                    <input
                      type="number"
                      min={0}
                      placeholder="비우면 없음"
                      value={drafts[o.id] ?? ''}
                      onChange={(e) => setDrafts((d) => ({ ...d, [o.id]: e.target.value }))}
                    />
                    <button className="pixel-btn small" onClick={() => saveCap(o.id)}>
                      저장
                    </button>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted small">상한에 닿은 팀은 이번 달 남은 기간 동안 AI 호출을 멈춰요. 경영팀 배분안을 승인하면 상한이 한꺼번에 바뀌어요.</p>
    </>
  );
}
