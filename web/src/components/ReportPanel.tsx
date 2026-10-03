import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useMemo, useState, type ReactNode } from 'react';
import { splitDraft } from '../../../shared/draft.ts';
import { TEAMS } from '../../../shared/teams.ts';
import { currentStepLabel } from '../../../shared/workflow.ts';
import type { PlannedAction } from '../../../shared/mcp.ts';
import type { Agent, OfficeEvent, Task, TeamId } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { eventLabel, krw, TASK_STATUS_LABEL, timeOf } from '../format.ts';
import { ExportBox } from './ExportBox.tsx';

type Tab = 'team' | 'report' | 'artifacts' | 'reviews' | 'profit' | 'log';

interface Props {
  team: TeamId;
  teamData: ReactNode;
  task: Task | undefined;
  tasks: Task[];
  agents: Agent[];
  events: OfficeEvent[];
  canOperate: boolean;
  onSelectTask: (id: string) => void;
  onHelp: () => void;
  onError: (message: string) => void;
}

const renderMarkdown = (md: string) => DOMPurify.sanitize(marked.parse(md, { async: false }) as string);

const ACTION_STATUS: Record<PlannedAction['status'], string> = {
  proposed: '',
  running: '⏳ 실행 중',
  done: '✅ 완료',
  failed: '❌ 실패',
  unknown: '⚠️ 결과 확인 필요',
  skipped: '⏭️ 건너뜀',
};

function ActionList({ actions, editable, onToggle }: { actions: PlannedAction[]; editable: boolean; onToggle?: (id: string, enabled: boolean) => void }) {
  const pending = actions.every((a) => a.status === 'proposed');
  return (
    <div className="actions-box">
      <b>{pending ? '승인하면 실행할 외부 작업' : '외부 작업 결과'}</b>
      {pending && <div className="small muted">체크를 끄면 그 작업은 실행하지 않아요. 같은 작업은 한 번만 실행돼요.</div>}
      <ul>
        {actions.map((a) => (
          <li key={a.id} className={pending && !a.enabled ? 'off' : ''}>
            <label className="check">
              {pending && <input type="checkbox" checked={a.enabled} disabled={!editable} onChange={(e) => onToggle?.(a.id, e.target.checked)} />}
              <span>
                {a.icon} <b>{a.serverName}</b> · <code>{a.tool}</code> {ACTION_STATUS[a.status]}
              </span>
            </label>
            <div>{a.summary}</div>
            <details>
              <summary className="small muted">보낼 내용{a.result ? ' · 결과' : ''}</summary>
              <pre>{JSON.stringify(a.arguments, null, 2)}</pre>
              {a.result && <pre>{a.result}</pre>}
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ReportPanel({ team, teamData, task, tasks, agents, events, canOperate, onSelectTask, onHelp, onError }: Props) {
  const [tab, setTab] = useState<Tab>(TEAMS[team].inputLabel || team === 'welfare' || team === 'mgmt' ? 'team' : 'report');
  const [valueInput, setValueInput] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const agentMap = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

  if (!task) {
    return (
      <aside className="report">
        <div className="report-empty">
          <h3>{TEAMS[team].emoji} {TEAMS[team].name}</h3>
          <p>아직 업무가 없어요. 사무실 칠판을 눌러 첫 업무를 등록해 보세요.</p>
        </div>
        <div className="report-body">{teamData}</div>
      </aside>
    );
  }

  const draft = task.artifacts.filter((a) => a.kind === 'draft').at(-1);
  const report = draft ? splitDraft(draft.content).body : '';
  const taskEvents = events.filter((e) => e.taskId === task.id || !e.taskId);
  const profit = task.value?.recognizedKrw ? task.value.recognizedKrw - task.costKrw : null;
  const queue = tasks.filter((t) => t.status === 'queued').reverse();

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="report">
      <div className="report-head">
        <select className="task-select" value={task.id} onChange={(e) => onSelectTask(e.target.value)}>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              [{TASK_STATUS_LABEL[t.status]}] {t.title}
            </option>
          ))}
        </select>
        <div className="report-meta">
          <span className={`badge badge-${task.status}`}>{TASK_STATUS_LABEL[task.status]}</span>
          <span>현재 단계: {currentStepLabel(task)}</span>
          <span>비용 {krw(task.costKrw)}</span>
          {Boolean(task.toolCalls) && <span>🧩 도구 {task.toolCalls}회</span>}
        </div>
        {queue.length > 0 && (
          <ol className="queue-list">
            {queue.map((q, i) => (
              <li key={q.id} className={q.id === task.id ? 'selected' : ''}>
                <button className="queue-title" onClick={() => onSelectTask(q.id)}>
                  {i + 1}. {q.title}
                </button>
                {canOperate && (
                  <button className="icon-btn" title="대기 취소" disabled={busy} onClick={() => run(() => api.cancelTask(q.id))}>
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      {task.status === 'queued' && (
        <div className="callout">
          대기 {queue.findIndex((q) => q.id === task.id) + 1}번째예요. 앞 업무가 끝나면 직원들이 자동으로 시작해요.
        </div>
      )}

      {task.status === 'awaiting_help' && task.help && (
        <div className="callout callout-help">
          <span>
            <b>{agentMap.get(task.help.agentId)?.name}</b>가 도움을 요청했어요: {task.help.question}
          </span>
          {canOperate && (
            <button className="pixel-btn small primary" onClick={onHelp}>
              도와주기
            </button>
          )}
        </div>
      )}

      {task.status === 'failed' && <div className="callout callout-error">중단됨: {task.failureReason}</div>}

      {task.status === 'completed' && task.actions?.some((a) => a.status !== 'proposed') && <ActionList actions={task.actions} editable={false} />}

      {task.status === 'awaiting_approval' && task.value && (
        <div className="approval">
          <div className="approval-title">🙋 사용자 승인</div>
          {task.proposal && (
            <div className="proposal">
              <b>{task.proposal.headline}</b>
              {task.proposal.lines.length > 0 && (
                <ul>
                  {task.proposal.lines.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {task.actions && task.actions.length > 0 && (
            <ActionList
              actions={task.actions}
              editable={canOperate && !busy}
              onToggle={(id, enabled) => run(() => api.setActionEnabled(task.id, id, enabled))}
            />
          )}
          <div className="value-breakdown">
            기준 가치 {krw(task.value.baseKrw)} × 품질 {task.value.qualityMultiplier} × 사용자 평가 {task.value.userMultiplier}
            <br />= 추정 가치 <b>{krw(task.value.estimatedKrw)}</b> · 지금까지 비용 {krw(task.costKrw)}
          </div>
          {!canOperate && <p className="small muted">승인과 수정 요청은 업무 처리 권한이 있는 사람만 할 수 있어요.</p>}
          {canOperate && (
            <>
              <label className="field-inline">
                인정할 가치(원)
                <input
                  type="number"
                  min={0}
                  placeholder={String(task.value.estimatedKrw)}
                  value={valueInput}
                  onChange={(e) => setValueInput(e.target.value)}
                />
              </label>
              <div className="row">
                <button
                  className="pixel-btn primary"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await api.approve(task.id, valueInput === '' ? undefined : Number(valueInput));
                      setValueInput('');
                    })
                  }
                >
                  승인하고 반영
                </button>
              </div>
              <textarea
                placeholder="수정 요청 내용 (예: 결론에 실행 일정을 추가해 주세요)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
              />
              <button
                className="pixel-btn"
                disabled={busy || !comment.trim()}
                onClick={() =>
                  run(async () => {
                    await api.requestChanges(task.id, comment);
                    setComment('');
                  })
                }
              >
                수정 요청 (가치 70%로 감액)
              </button>
            </>
          )}
        </div>
      )}

      <div className="tabs">
        {(
          [
            ['team', '팀 자료'],
            ['report', '보고서'],
            ['artifacts', '중간 산출물'],
            ['reviews', '검수 의견'],
            ['profit', '손익'],
            ['log', '실행 기록'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      <div className="report-body">
        {tab === 'team' && teamData}
        {tab === 'report' &&
          (draft ? (
            <>
              <div className="row between">
                <span className="muted">
                  {agentMap.get(draft.agentId)?.name} 작성 · v{draft.version}
                </span>
                <button className="pixel-btn small" onClick={() => setExportOpen((v) => !v)}>
                  내보내기 {exportOpen ? '▴' : '▾'}
                </button>
              </div>
              {exportOpen && <ExportBox task={task} draftVersion={draft.version} markdown={report} canOperate={canOperate} onError={onError} />}
              <div className="markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(report) }} />
            </>
          ) : (
            <p className="muted">아직 보고서 초안이 없어요. 작성자가 쓰는 중입니다.</p>
          ))}

        {tab === 'artifacts' &&
          (task.artifacts.length ? (
            task.artifacts
              .slice()
              .reverse()
              .map((a) => (
                <details key={a.id} className="artifact">
                  <summary>
                    {a.title} v{a.version} · {agentMap.get(a.agentId)?.name} · {timeOf(a.createdAt)}
                  </summary>
                  <div className="markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(a.content) }} />
                </details>
              ))
          ) : (
            <p className="muted">아직 산출물이 없어요.</p>
          ))}

        {tab === 'reviews' &&
          (task.reviews.length || task.clarifications.length || task.userChangeRequests.length ? (
            <ul className="plain-list">
              {task.clarifications.map((c, i) => (
                <li key={`c${i}`}>🤝 사용자가 정한 방향: {c}</li>
              ))}
              {task.reviews.map((r, i) => (
                <li key={`r${i}`} className={r.approved ? 'ok' : 'ng'}>
                  {r.approved ? '✅ 통과' : '❌ 반려'} ({r.score}점) · {agentMap.get(r.agentId)?.name}: {r.reason}
                </li>
              ))}
              {task.userChangeRequests.map((c, i) => (
                <li key={`u${i}`}>✏️ 사용자 수정 요청: {c}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">아직 검수 의견이 없어요.</p>
          ))}

        {tab === 'profit' && (
          <table className="table">
            <tbody>
              {Object.entries(task.costByAgent).map(([id, cost]) => (
                <tr key={id}>
                  <td>{agentMap.get(id)?.name} 비용</td>
                  <td className="num">{krw(cost)}</td>
                </tr>
              ))}
              <tr className="total">
                <td>총비용</td>
                <td className="num">{krw(task.costKrw)}</td>
              </tr>
              <tr>
                <td>추정 가치</td>
                <td className="num">{task.value ? krw(task.value.estimatedKrw) : '-'}</td>
              </tr>
              <tr>
                <td>인정 가치{task.value?.userEdited ? ' (사용자 수정)' : ''}</td>
                <td className="num">{task.value?.recognizedKrw ? krw(task.value.recognizedKrw) : '승인 전'}</td>
              </tr>
              <tr className="total">
                <td>업무 이익</td>
                <td className={`num ${profit !== null && profit < 0 ? 'neg' : 'pos'}`}>{profit !== null ? krw(profit) : '-'}</td>
              </tr>
            </tbody>
          </table>
        )}

        {tab === 'log' && (
          <ul className="log">
            {taskEvents
              .slice()
              .reverse()
              .map((e) => (
                <li key={e.eventId}>
                  <span className="log-time">{timeOf(e.timestamp)}</span> {eventLabel(e, agentMap)}
                </li>
              ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
