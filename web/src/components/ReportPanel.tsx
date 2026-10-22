import { localize, t, tpl } from '../../../shared/i18n.ts';
import { TaskFiles } from './TaskFiles.tsx';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useMemo, useState, type ReactNode } from 'react';
import { splitDraft } from '../../../shared/draft.ts';
import { TEAMS } from '../../../shared/teams.ts';
import { currentStepLabel } from '../../../shared/workflow.ts';
import type { PlannedAction } from '../../../shared/mcp.ts';
import type { Agent, OfficeEvent, Person, Task, TeamId } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { eventLabel, krw, statusLabel, timeOf } from '../format.ts';
import { ExportBox } from './ExportBox.tsx';
import { useLanguage } from '../LanguageProvider.tsx';

type Tab = 'team' | 'report' | 'files' | 'artifacts' | 'reviews' | 'profit' | 'log';

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
  /** Opens this task's conversation; absent when chat is not available to the viewer. */
  onDiscuss?: (taskId: string) => void;
  /** People who can be put in charge of tasks here; absent when the plan has no assignees. */
  people?: Person[];
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
  const { t } = useLanguage();
  const pending = actions.every((a) => a.status === 'proposed');
  return (
    <div className="actions-box">
      <b>{pending ? t('승인하면 실행할 외부 작업') : t('외부 작업 결과')}</b>
      {pending && <div className="small muted">{t('체크를 끄면 그 작업은 실행하지 않아요. 같은 작업은 한 번만 실행돼요.')}</div>}
      <ul>
        {actions.map((a) => (
          <li key={a.id} className={pending && !a.enabled ? 'off' : ''}>
            <label className="check">
              {pending && <input type="checkbox" checked={a.enabled} disabled={!editable} onChange={(e) => onToggle?.(a.id, e.target.checked)} />}
              <span>
                {a.icon} <b>{t(a.serverName)}</b> · <code>{a.tool}</code> {ACTION_STATUS[a.status] && t(ACTION_STATUS[a.status])}
              </span>
            </label>
            <div>{a.summary}</div>
            <details>
              <summary className="small muted">{t('보낼 내용')}{a.result ? ` · ${t('결과')}` : ''}</summary>
              <pre>{JSON.stringify(a.arguments, null, 2)}</pre>
              {a.result && <pre>{a.result}</pre>}
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ReportPanel({ team, teamData, task, tasks, agents, events, canOperate, onSelectTask, onHelp, onError, onDiscuss, people }: Props) {
  const { t, tpl } = useLanguage();
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
          <h3>{TEAMS[team].emoji} {t(TEAMS[team].name)}</h3>
          <p>{t('아직 업무가 없어요. 사무실 칠판을 눌러 첫 업무를 등록해 보세요.')}</p>
        </div>
        <div className="report-body">{teamData}</div>
      </aside>
    );
  }

  const draft = task.artifacts.filter((a) => a.kind === 'draft').at(-1);
  const report = draft ? splitDraft(draft.content).body : '';
  const localizedTitle = t(task.title);
  const localizedReport = localizedTitle === task.title ? report : report.replaceAll(task.title, localizedTitle);
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
          {tasks.map((item) => (
            <option key={item.id} value={item.id}>
              [{statusLabel(item.status)}] {t(item.title)}
            </option>
          ))}
        </select>
        <div className="report-meta">
          <span className={`badge badge-${task.status}`}>{statusLabel(task.status)}</span>
          <span>{t('현재 단계')}: {t(currentStepLabel(task))}</span>
          <span>{t('비용')} {krw(task.costKrw)}</span>
          {Boolean(task.toolCalls) && <span>🧩 {t('도구')} {tpl('{n}회', { n: task.toolCalls })}</span>}
          {people && (
            <label className="assignee">
              👤
              <select
                value={task.assigneeId ?? ''}
                disabled={!canOperate || busy}
                title={t('업무 담당자')}
                onChange={(e) => run(() => api.setAssignee(task.id, e.target.value || null))}
              >
                <option value="">{t('담당자 없음')}</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                {task.assigneeId && !people.some((p) => p.id === task.assigneeId) && <option value={task.assigneeId}>{t('(지금은 볼 수 없는 사람)')}</option>}
              </select>
            </label>
          )}
          {onDiscuss && (
            <button className="pixel-btn small" onClick={() => onDiscuss(task.id)}>
              💬 {t('업무 대화')}
            </button>
          )}
        </div>
        {queue.length > 0 && (
          <ol className="queue-list">
            {queue.map((q, i) => (
              <li key={q.id} className={q.id === task.id ? 'selected' : ''}>
                <button className="queue-title" onClick={() => onSelectTask(q.id)}>
                  {i + 1}. {t(q.title)}
                </button>
                {canOperate && (
                  <button className="icon-btn" title={t('대기 취소')} disabled={busy} onClick={() => run(() => api.cancelTask(q.id))}>
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
          {tpl('대기 {n}번째예요. 앞 업무가 끝나면 직원들이 자동으로 시작해요.', { n: queue.findIndex((q) => q.id === task.id) + 1 })}
        </div>
      )}

      {task.status === 'awaiting_help' && task.help && (
        <div className="callout callout-help">
          <span>
            {tpl('{name}가 도움을 요청했어요: {question}', { name: agentMap.get(task.help.agentId)?.name ?? '', question: t(task.help.question) })}
          </span>
          {canOperate && (
            <button className="pixel-btn small primary" onClick={onHelp}>
              {t('도와주기')}
            </button>
          )}
        </div>
      )}

      {task.status === 'failed' && (
        <div className="callout callout-error callout-retry">
          <span>
            {t('중단됨')}: {task.failureReason}
          </span>
          {canOperate && (
            <button className="pixel-btn small primary" disabled={busy} onClick={() => run(() => api.retryTask(task.id))} title={t('끝난 단계는 그대로 두고, 멈춘 단계부터 다시 해요.')}>
              {t('▶ 이어서 하기')}
            </button>
          )}
        </div>
      )}

      {task.status === 'completed' && task.actions?.some((a) => a.status !== 'proposed') && <ActionList actions={task.actions} editable={false} />}

      {task.status === 'awaiting_approval' && task.value && (
        <div className="approval">
          <div className="approval-title">🙋 {t('사용자 승인')}</div>
          <ReviewWarning task={task} />
          {task.proposal && (
            <div className="proposal">
              <b>{t(localize(task.proposal.headline))}</b>
              {task.proposal.lines.length > 0 && (
                <ul>
                  {task.proposal.lines.map((line, i) => (
                    <li key={i}>{localize(line)}</li>
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
            {t('기준 가치')} {krw(task.value.baseKrw)} × {t('품질')} {task.value.qualityMultiplier} × {t('사용자 평가')} {task.value.userMultiplier}
            <br />= {t('추정 가치')} <b>{krw(task.value.estimatedKrw)}</b> · {t('지금까지 비용')} {krw(task.costKrw)}
          </div>
          {!canOperate && <p className="small muted">{t('승인과 수정 요청은 업무 처리 권한이 있는 사람만 할 수 있어요.')}</p>}
          {canOperate && (
            <>
              <label className="field-inline">
                {t('인정할 가치(원)')}
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
                  {t('승인하고 반영')}
                </button>
              </div>
              <textarea
                placeholder={t('수정 요청 내용 (예: 결론에 실행 일정을 추가해 주세요)')}
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
                {t('수정 요청 (가치 70%로 감액)')}
              </button>
            </>
          )}
        </div>
      )}

      <div className="tabs">
        {(
          [
            ['team', t('팀 자료')],
            ['report', t('보고서')],
            ['files', task.files?.length ? `${t('결과 파일')} ${task.files.length}` : t('결과 파일')],
            ['artifacts', t('중간 산출물')],
            ['reviews', t('검수 의견')],
            ['profit', t('손익')],
            ['log', t('실행 기록')],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            {t(label)}
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
                  {agentMap.get(draft.agentId)?.name} {t('작성')} · v{draft.version}
                </span>
                <button className="pixel-btn small" onClick={() => setExportOpen((v) => !v)}>
                  {t('파일로 내보내기')} {exportOpen ? '▴' : '▾'}
                </button>
              </div>
              {exportOpen && <ExportBox task={task} draftVersion={draft.version} markdown={localizedReport} canOperate={canOperate} onError={onError} />}
              <div className="markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(localizedReport) }} />
            </>
          ) : (
            <p className="muted">{t('아직 보고서 초안이 없어요. 작성자가 쓰는 중입니다.')}</p>
          ))}

        {tab === 'files' && <TaskFiles task={task} agents={agents} canOperate={canOperate} onError={onError} />}
        {tab === 'artifacts' &&
          (task.artifacts.length ? (
            task.artifacts
              .slice()
              .reverse()
              .map((a) => (
                <details key={a.id} className="artifact">
                  <summary>
                    {t(a.title)} v{a.version} · {agentMap.get(a.agentId)?.name} · {timeOf(a.createdAt)}
                  </summary>
                  <div className="markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(a.content) }} />
                </details>
              ))
          ) : (
            <p className="muted">{t('아직 산출물이 없어요.')}</p>
          ))}

        {tab === 'reviews' &&
          (task.reviews.length || task.clarifications.length || task.userChangeRequests.length || task.chatNotes?.length ? (
            <ul className="plain-list">
              {task.clarifications.map((c, i) => (
                <li key={`c${i}`}>🤝 {t('사용자가 정한 방향')}: {t(c)}</li>
              ))}
              {(task.chatNotes ?? []).map((n) => (
                <li key={n.messageId}>
                  💬 {t('대화에서 전달된 메모')} · {n.author}: {n.text}
                </li>
              ))}
              {task.reviews.map((r, i) => (
                <li key={`r${i}`} className={r.approved ? 'ok' : 'ng'}>
                  {r.approved ? tpl('✅ {v}', { v: t('통과') }) : tpl('❌ {v}', { v: t('반려') })} ({tpl('{n}점', { n: r.score })}) · {agentMap.get(r.agentId)?.name}: {t(r.reason)}
                </li>
              ))}
              {task.userChangeRequests.map((c, i) => (
                <li key={`u${i}`}>✏️ {t('사용자가 남긴 수정 요청')}: {c}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">{t('아직 검수 의견이 없어요.')}</p>
          ))}

        {tab === 'profit' && (
          <table className="table">
            <tbody>
              {Object.entries(task.costByAgent).map(([id, cost]) => (
                <tr key={id}>
                  <td>{tpl('{name} 비용', { name: agentMap.get(id)?.name ?? '' })}</td>
                  <td className="num">{krw(cost)}</td>
                </tr>
              ))}
              <tr className="total">
                <td>{t('총비용')}</td>
                <td className="num">{krw(task.costKrw)}</td>
              </tr>
              <tr>
                <td>{t('추정 가치')}</td>
                <td className="num">{task.value ? krw(task.value.estimatedKrw) : '-'}</td>
              </tr>
              <tr>
                <td>{t('인정 가치')}{task.value?.userEdited ? ` (${t('사용자 수정')})` : ''}</td>
                <td className="num">{task.value?.recognizedKrw ? krw(task.value.recognizedKrw) : t('승인 전')}</td>
              </tr>
              <tr className="total">
                <td>{t('업무 이익')}</td>
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

/**
 * When the last review before approval rejected the draft (its loop ran out, or it had none), the approver is told
 * before deciding: the score and the reason, so "approve as is" is a choice and not an oversight.
 */
function ReviewWarning({ task }: { task: Task }) {
  const last = task.reviews.at(-1);
  if (!last || last.approved) return null;
  return (
    <div className="callout callout-error review-warning">
      ⚠ {tpl('검토에서 반려된 채로 올라왔어요 ({score}점). 그대로 승인하거나 수정 요청을 보내 주세요.', { score: last.score })}
      <div className="small">{last.reason}</div>
    </div>
  );
}
