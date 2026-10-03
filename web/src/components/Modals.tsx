import { useEffect, useState, type ReactNode } from 'react';
import { TEAM_ORDER, TEAMS } from '../../../shared/teams.ts';
import type { Agent, Office, PlanMode, Task, TeamId, WorkflowStepInput } from '../../../shared/types.ts';
import { loopTargetLabel, STEP_KIND, templatePlan, validatePlan } from '../../../shared/workflow.ts';
import { api } from '../api.ts';
import { krw, modelLabel, roi } from '../format.ts';
import { PlanEditor } from './PlanEditor.tsx';

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal pixel-box">
        <div className="modal-head">
          <span>{title}</span>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

interface ErrorProp {
  onError: (message: string) => void;
}

const TITLE_PLACEHOLDER: Record<TeamId, string> = {
  dev: '예: 사내 AI 코딩 도구 도입 검토',
  hr: '비워 두면 "메일함 정리와 일정 등록"',
  mgmt: '비워 두면 "이번 달 AI 예산 배분안"',
  support: '비워 두면 "고객 문의 답변 초안"',
  welfare: '비워 두면 "이번 주 휴식·문화생활 추천"',
};

const DESCRIPTION_PLACEHOLDER: Record<TeamId, string> = {
  dev: '수집할 자료, 분석 관점, 꼭 들어가야 할 내용을 적으면 직원이 덜 곤란해해요.',
  hr: '예: 면접 관련 메일은 우선 처리해 줘',
  mgmt: '예: 이번 달은 서포터팀에 여유를 더 줘',
  support: '예: 환불 문의는 정책 안내만 하고 확정하지 마',
  welfare: '예: 이번 주말은 집에서 쉬고 싶어',
};

export function NewOfficeModal({
  onCreated,
  onClose,
  onError,
}: { onCreated: (office: Office) => void; onClose: () => void } & ErrorProp) {
  const [team, setTeam] = useState<TeamId>('dev');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      onCreated(await api.createOffice({ team, name }));
      onClose();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="🏗️ 사무실 추가" onClose={onClose}>
      <p className="muted small">새 사무실에는 직원 4명과 휴게실이 함께 생겨요. 같은 종류의 팀을 여러 개 만들 수도 있어요.</p>
      <div className="team-pick">
        {TEAM_ORDER.map((id) => (
          <button key={id} type="button" className={`team-pick-option ${team === id ? 'selected' : ''}`} style={{ background: team === id ? TEAMS[id].wall : undefined }} onClick={() => setTeam(id)}>
            <b>
              {TEAMS[id].emoji} {TEAMS[id].name}
            </b>
            <span className="small muted">{TEAMS[id].description}</span>
          </button>
        ))}
      </div>
      {(team === 'hr' || team === 'support') && (
        <p className="small muted">
          {team === 'hr' ? '메일함' : '문의함'}은 같은 팀끼리 함께 써요. 동시에는 한 사무실만 처리할 수 있어요.
        </p>
      )}
      <label className="field">
        사무실 이름 (선택)
        <input value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder={`비워 두면 "${TEAMS[team].name} 2" 같은 이름`} />
      </label>
      <div className="row end">
        <button className="pixel-btn" onClick={onClose}>
          취소
        </button>
        <button className="pixel-btn primary" disabled={busy} onClick={submit}>
          사무실 열기
        </button>
      </div>
    </Modal>
  );
}

function PlanChain({ steps, agents }: { steps: WorkflowStepInput[]; agents: Agent[] }) {
  return (
    <ol className="plan-chain">
      {steps.map((s, i) => (
        <li key={i}>
          {STEP_KIND[s.kind].icon} {s.label}
          <span className="muted"> · {s.kind === 'approval' ? '나' : (agents.find((a) => a.id === s.agentId)?.name ?? '?')}</span>
          {s.loop && (
            <span className="plan-chain-loop">
              🔁 {s.loop.when} → {loopTargetLabel(steps, i, s.loop)} (최대 {s.loop.max}회)
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

const PLAN_MODES: { id: PlanMode; label: string }[] = [
  { id: 'template', label: '유형 기본' },
  { id: 'ai', label: '🧭 AI가 설계' },
  { id: 'custom', label: '✏️ 직접 설계' },
];

export function NewTaskModal({
  office,
  agents,
  busy: officeBusy,
  queuedCount,
  pendingCount,
  hourlyRateKrw,
  onClose,
  onError,
}: {
  office: Office;
  agents: Agent[];
  busy: boolean;
  queuedCount: number;
  pendingCount: number;
  hourlyRateKrw: number;
  onClose: () => void;
} & ErrorProp) {
  const willQueue = officeBusy || queuedCount > 0;
  const team = TEAMS[office.team];
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [taskType, setTaskType] = useState(team.taskTypes[0].id);
  const [planMode, setPlanMode] = useState<PlanMode>('template');
  const [steps, setSteps] = useState<WorkflowStepInput[]>(() => templatePlan(office.team, team.taskTypes[0].id, agents));
  const [planNote, setPlanNote] = useState('');
  const [designing, setDesigning] = useState(false);
  const [busy, setBusy] = useState(false);
  const titleRequired = office.team === 'dev';
  const noInput = team.inputLabel !== null && pendingCount === 0;
  const planError = planMode === 'custom' ? validatePlan(steps, agents) : null;

  const changeType = (id: string) => {
    setTaskType(id);
    if (planMode !== 'custom') setSteps(templatePlan(office.team, id, agents));
  };

  const changeMode = (mode: PlanMode) => {
    if (mode === 'template') setSteps(templatePlan(office.team, taskType, agents));
    setPlanMode(mode);
  };

  const preview = async () => {
    setDesigning(true);
    try {
      const result = await api.previewPlan(office.id, { title, description, taskType });
      setSteps(result.steps);
      setPlanNote(result.note);
      setPlanMode('custom');
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setDesigning(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      await api.createTask({
        officeId: office.id,
        title,
        description,
        taskType,
        planMode,
        steps: planMode === 'custom' ? steps : undefined,
        planNote: planMode === 'custom' ? planNote : undefined,
      });
      onClose();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`📌 ${team.emoji} ${team.name} 칠판에 업무 등록`} onClose={onClose}>
      <p className="muted small">{team.description}</p>
      {willQueue && (
        <p className="small">
          지금 진행 중인 업무가 있어서 대기열 {queuedCount + 1}번째로 들어가요. 앞 업무가 끝나면 자동으로 시작해요.
        </p>
      )}
      {team.inputLabel && (
        <p className={`small ${noInput ? 'neg' : ''}`}>
          {team.inputLabel}: {pendingCount}건{noInput ? ' — 팀 자료 탭에서 새 항목을 받아 오세요.' : ''}
        </p>
      )}
      <label className="field">
        업무 제목{titleRequired ? '' : ' (선택)'}
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={TITLE_PLACEHOLDER[office.team]} />
      </label>
      <label className="field">
        요청 내용 (선택)
        <textarea
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={DESCRIPTION_PLACEHOLDER[office.team]}
        />
      </label>
      <label className="field">
        업무 유형 (여정 바로가기)
        <select value={taskType} onChange={(e) => changeType(e.target.value)}>
          {team.taskTypes.map((entry) => {
            const hours = entry.standardHours + (entry.hoursPerItem ?? 0) * Math.max(1, pendingCount);
            return (
              <option key={entry.id} value={entry.id}>
                {entry.label} (사람 기준 {Math.round(hours * 10) / 10}시간 = {krw(hours * hourlyRateKrw)})
              </option>
            );
          })}
        </select>
      </label>
      <div className="field">
        업무 여정
        <div className="segmented" role="radiogroup" aria-label="업무 여정 정하는 방법">
          {PLAN_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={planMode === m.id}
              className={`segment ${planMode === m.id ? 'active' : ''}`}
              onClick={() => changeMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      {planMode === 'template' && <PlanChain steps={steps} agents={agents} />}
      {planMode === 'ai' && (
        <div className="callout plan-ai">
          <span>업무가 시작되면 팀장이 요청 내용을 보고 단계와 담당자를 정해요. 설계에도 AI 비용이 조금 들어요.</span>
          <button type="button" className="pixel-btn small" disabled={designing} onClick={preview}>
            {designing ? '설계 중…' : '지금 미리 설계 받기'}
          </button>
        </div>
      )}
      {planMode === 'custom' && (
        <>
          {planNote && <p className="plan-note small">🧭 팀장 의견: {planNote}</p>}
          <PlanEditor team={office.team} agents={agents} steps={steps} onChange={setSteps} />
          <button type="button" className="pixel-btn small" disabled={designing} onClick={preview}>
            {designing ? '설계 중…' : '🧭 AI 추천으로 다시 채우기'}
          </button>
        </>
      )}
      <div className="row end">
        <button className="pixel-btn" onClick={onClose}>
          취소
        </button>
        <button className="pixel-btn primary" disabled={busy || noInput || Boolean(planError) || (titleRequired && !title.trim())} onClick={submit}>
          {willQueue ? '대기열에 추가' : '칠판에 붙이기'}
        </button>
      </div>
    </Modal>
  );
}

export function PlanEditModal({ task, team, agents, onClose, onError }: { task: Task; team: TeamId; agents: Agent[]; onClose: () => void } & ErrorProp) {
  const [steps, setSteps] = useState<WorkflowStepInput[]>(() =>
    task.plan.map(({ kind, label, agentId, instructions }) => ({ kind, label, agentId, instructions })),
  );
  const [busy, setBusy] = useState(false);
  const error = validatePlan(steps, agents);

  const save = async () => {
    setBusy(true);
    try {
      await api.updatePlan(task.id, steps);
      onClose();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`✏️ 업무 여정 편집 · ${task.title}`} onClose={onClose}>
      <p className="muted small">대기 중인 업무라 시작 전에 단계와 담당자를 바꿀 수 있어요.</p>
      <PlanEditor team={team} agents={agents} steps={steps} onChange={setSteps} />
      <div className="row end">
        <button className="pixel-btn" onClick={onClose}>
          취소
        </button>
        <button className="pixel-btn primary" disabled={busy || Boolean(error)} onClick={save}>
          여정 저장
        </button>
      </div>
    </Modal>
  );
}

export function HelpDialog({
  task,
  agent,
  roleTitle,
  onClose,
  onError,
}: { task: Task; agent: Agent; roleTitle: string; onClose: () => void } & ErrorProp) {
  const help = task.help;
  const [answer, setAnswer] = useState('');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!help) return null;
  const remaining = Math.max(0, Math.round((help.deadline - now) / 1000));

  const send = async (value: string | null) => {
    try {
      await api.answerHelp(task.id, value);
      onClose();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Modal title={`🤝 ${agent.name}(${roleTitle}) 도와주기`} onClose={onClose}>
      <div className="help-question">
        <span className="help-face">(・_・;)</span>
        <p>{help.question}</p>
      </div>
      <div className="help-options">
        {help.options.map((option) => (
          <button key={option} className="pixel-btn primary" onClick={() => send(option)}>
            {option}
          </button>
        ))}
      </div>
      <label className="field">
        직접 답하기
        <input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="원하는 방향을 짧게 적어 주세요" />
      </label>
      <div className="row between">
        <button className="pixel-btn" onClick={() => send(null)}>
          알아서 진행 ("{help.assumption}")
        </button>
        <button className="pixel-btn primary" disabled={!answer.trim()} onClick={() => send(answer)}>
          이렇게 해줘
        </button>
      </div>
      <p className="muted small">
        {remaining}초 안에 답이 없으면 "{help.assumption}"(으)로 진행해요. 곤란 표정은 감정이 아니라 지시가 모호하다는 신호예요.
      </p>
    </Modal>
  );
}

export function RulesModal({
  agent,
  safetyRules,
  onClose,
  onError,
}: { agent: Agent; safetyRules: string[]; onClose: () => void } & ErrorProp) {
  const [rules, setRules] = useState(agent.rules);
  const [confirming, setConfirming] = useState(false);

  const save = async () => {
    try {
      await api.updateAgent(agent.id, { rules });
      onClose();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Modal title={`📜 ${agent.name}의 규칙`} onClose={onClose}>
      <div className="rule-block">
        <div className="rule-label">조직 안전 규칙 (덮어쓸 수 없음)</div>
        <ul className="plain-list small">
          {safetyRules.map((r) => (
            <li key={r}>🔒 {r}</li>
          ))}
        </ul>
      </div>
      <label className="field">
        개인 규칙
        <textarea rows={5} value={rules} onChange={(e) => setRules(e.target.value)} />
      </label>
      {confirming ? (
        <div className="diff">
          <div>
            <b>변경 전</b>
            <pre>{agent.rules || '(없음)'}</pre>
          </div>
          <div>
            <b>변경 후</b>
            <pre>{rules || '(없음)'}</pre>
          </div>
          <div className="row end">
            <button className="pixel-btn" onClick={() => setConfirming(false)}>
              다시 고치기
            </button>
            <button className="pixel-btn primary" onClick={save}>
              승인하고 반영
            </button>
          </div>
        </div>
      ) : (
        <div className="row end">
          <button className="pixel-btn" onClick={onClose}>
            닫기
          </button>
          <button className="pixel-btn primary" disabled={rules === agent.rules} onClick={() => setConfirming(true)}>
            변경 내용 확인
          </button>
        </div>
      )}
    </Modal>
  );
}

export function AgentCardModal({ agent, roleTitle, onClose }: { agent: Agent; roleTitle: string; onClose: () => void }) {
  const profit = agent.valueKrw - agent.costKrw;
  return (
    <Modal title={`💼 ${agent.name} 손익 카드`} onClose={onClose}>
      <table className="table">
        <tbody>
          <tr>
            <td>역할</td>
            <td className="num">{roleTitle}</td>
          </tr>
          <tr>
            <td>모델 (모자)</td>
            <td className="num">{modelLabel(agent.model)}</td>
          </tr>
          <tr>
            <td>이번 달 비용 (인건비)</td>
            <td className="num">{krw(agent.costKrw)}</td>
          </tr>
          <tr>
            <td>벌어 온 가치 (비용 비율로 배분)</td>
            <td className="num">{krw(agent.valueKrw)}</td>
          </tr>
          <tr className="total">
            <td>이익</td>
            <td className={`num ${profit < 0 ? 'neg' : 'pos'}`}>{krw(profit)}</td>
          </tr>
          <tr>
            <td>ROI</td>
            <td className="num">{roi(agent.valueKrw, agent.costKrw)}</td>
          </tr>
          <tr>
            <td>완료 업무</td>
            <td className="num">{agent.tasksDone}건</td>
          </tr>
        </tbody>
      </table>
    </Modal>
  );
}
