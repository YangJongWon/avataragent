import { useEffect, useState, type ReactNode } from 'react';
import { TEAM_ORDER, TEAMS } from '../../../shared/teams.ts';
import type { Agent, Office, PlanMode, SavedFlow, Task, TeamId, WorkflowStepInput } from '../../../shared/types.ts';
import { loopTargetLabel, STEP_KIND, templatePlan, validatePlan } from '../../../shared/workflow.ts';
import { api } from '../api.ts';
import { FlowPicker, type PickedFlow } from './FlowPicker.tsx';
import { krw, modelLabel, roi } from '../format.ts';
import { themeApi } from '../themeApi.ts';
import { DEFAULT_THEME, type ThemeSummary } from '../../../shared/theme-pack.ts';
import { t, tpl } from '../../../shared/i18n.ts';
import { FlowTools } from './FlowTools.tsx';
import { PlanEditor } from './PlanEditor.tsx';
import { AgentPortrait } from './AgentPortrait.tsx';

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal pixel-box">
        <div className="modal-head">
          <span>{title}</span>
          <button className="icon-btn" onClick={onClose} aria-label={t('닫기')}>
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
  dev: t('예: 사내 AI 코딩 도구 도입 검토'),
  hr: t('비워 두면 "메일함 정리와 일정 등록"'),
  mgmt: t('비워 두면 "이번 달 AI 예산 배분안"'),
  support: t('비워 두면 "고객 문의 답변 초안"'),
  welfare: t('비워 두면 "이번 주 휴식·문화생활 추천"'),
};

const DESCRIPTION_PLACEHOLDER: Record<TeamId, string> = {
  dev: t('수집할 자료, 분석 관점, 꼭 들어가야 할 내용을 적으면 직원이 덜 곤란해해요.'),
  hr: t('예: 면접 관련 메일은 우선 처리해 줘'),
  mgmt: t('예: 이번 달은 서포터팀에 여유를 더 줘'),
  support: t('예: 환불 문의는 정책 안내만 하고 확정하지 마'),
  welfare: t('예: 이번 주말은 집에서 쉬고 싶어'),
};

export function NewOfficeModal({
  onCreated,
  onClose,
  onError,
}: { onCreated: (office: Office) => void; onClose: () => void } & ErrorProp) {
  const [team, setTeam] = useState<TeamId>('dev');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [themes, setThemes] = useState<ThemeSummary[]>([]);
  /** Empty follows the company theme. */
  const [theme, setTheme] = useState('');

  useEffect(() => {
    themeApi.list().then(setThemes, () => setThemes([]));
  }, []);

  const submit = async () => {
    setBusy(true);
    try {
      onCreated(await api.createOffice({ team, name, theme: theme || undefined }));
      onClose();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t('🏗️ 사무실 추가')} onClose={onClose}>
      <p className="muted small">{t('새 사무실에는 직원 4명과 휴게실이 함께 생겨요. 같은 종류의 팀을 여러 개 만들 수도 있어요.')}</p>
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
          {tpl('{box}은 같은 팀끼리 함께 써요. 동시에는 한 사무실만 처리할 수 있어요.', { box: team === 'hr' ? t('메일함') : t('문의함') })}
        </p>
      )}
      <label className="field">
        {t('사무실 이름 (선택)')}
        <input value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder={tpl('비워 두면 "{v} 2" 같은 이름', { v: TEAMS[team].name })} />
      </label>
      {themes.length > 0 && (
        <label className="field">
          {t('테마')}
          <select value={theme} onChange={(e) => setTheme(e.target.value)}>
            <option value="">{t('공통 테마 따르기')}</option>
            <option value={DEFAULT_THEME}>{t('기본 픽셀')}</option>
            {themes.map((th) => (
              <option key={th.id} value={th.id}>
                {th.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="row end">
        <button className="pixel-btn" onClick={onClose}>
          {t('취소')}
        </button>
        <button className="pixel-btn primary" disabled={busy} onClick={submit}>
          {t('사무실 열기')}
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
          <span className="muted"> · {s.kind === 'approval' ? t('나') : (agents.find((a) => a.id === s.agentId)?.name ?? '?')}</span>
          {s.loop && (
            <span className="plan-chain-loop">
              🔁 {t(s.loop.when)} → {t(loopTargetLabel(steps, i, s.loop))} ({tpl('최대 {n}회', { n: s.loop.max })})
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
  flows = [],
  canSaveFlows = false,
  onClose,
  onError,
}: {
  office: Office;
  agents: Agent[];
  busy: boolean;
  queuedCount: number;
  pendingCount: number;
  hourlyRateKrw: number;
  flows?: SavedFlow[];
  canSaveFlows?: boolean;
  onClose: () => void;
} & ErrorProp) {
  const willQueue = officeBusy || queuedCount > 0;
  const team = TEAMS[office.team];
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [taskType, setTaskType] = useState(team.taskTypes[0].id);
  const [milestoneId, setMilestoneId] = useState(office.milestones?.[0]?.id ?? '');
  const [planMode, setPlanMode] = useState<PlanMode>('template');
  const [steps, setSteps] = useState<WorkflowStepInput[]>(() => templatePlan(office.team, team.taskTypes[0].id, agents));
  const [planNote, setPlanNote] = useState('');
  const [designing, setDesigning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [helping, setHelping] = useState<'prompt' | 'steps' | null>(null);
  const [promptIdea, setPromptIdea] = useState<{ title: string; description: string; tips: string[] } | null>(null);
  const [picking, setPicking] = useState(false);
  const titleRequired = office.team === 'dev';
  const request = { title, description, taskType };
  const help = async (kind: 'prompt' | 'steps', work: () => Promise<void>) => {
    setHelping(kind);
    try {
      await work();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setHelping(null);
    }
  };
  const usePicked = (flow: PickedFlow) => {
    if (flow.taskType) {
      setTaskType(flow.taskType);
      setPlanMode('template');
    } else {
      setPlanMode('custom');
    }
    setSteps(flow.steps);
    setPlanNote(flow.note);
    setPicking(false);
  };
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
        milestoneId: milestoneId || undefined,
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
    <Modal title={tpl('📌 {emoji} {name} 칠판에 업무 등록', { emoji: team.emoji, name: team.name })} onClose={onClose}>
      <p className="muted small">{team.description}</p>
      {willQueue && (
        <p className="small">
          {tpl('지금 진행 중인 업무가 있어서 대기열 {v}번째로 들어가요. 앞 업무가 끝나면 자동으로 시작해요.', { v: queuedCount + 1 })}
        </p>
      )}
      {team.inputLabel && (
        <p className={`small ${noInput ? 'neg' : ''}`}>
          {tpl('{label}: {n}건', { label: t(team.inputLabel ?? ''), n: pendingCount })}{noInput ? t(' — 팀 자료 탭에서 새 항목을 받아 오세요.') : ''}
        </p>
      )}
      <label className="field">
        {t('업무 제목')}{titleRequired ? '' : t(' (선택)')}
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={TITLE_PLACEHOLDER[office.team]} />
      </label>
      <label className="field">
        {t('요청 내용 (선택)')}
        <textarea
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={DESCRIPTION_PLACEHOLDER[office.team]}
        />
      </label>
      <div className="row assist-row">
        <button
          type="button"
          className="pixel-btn small"
          disabled={helping !== null || (!title.trim() && !description.trim())}
          title={t('팀장이 목표·배경·결과물·주의할 점으로 요청을 다듬어 줘요. AI 비용이 조금 들어요.')}
          onClick={() => void help('prompt', async () => setPromptIdea(await api.suggestPrompt(office.id, request)))}
        >
          {helping === 'prompt' ? t('다듬는 중…') : t('✨ 요청 다듬기')}
        </button>
      </div>
      {promptIdea && (
        <div className="callout assist-box">
          <b className="small">{t('이렇게 써 보면 어때요?')}</b>
          {promptIdea.title && <div className="small">{promptIdea.title}</div>}
          <pre className="assist-text">{promptIdea.description}</pre>
          {promptIdea.tips.length > 0 && (
            <ul className="small muted">
              {promptIdea.tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          )}
          <div className="row end">
            <button type="button" className="pixel-btn small" onClick={() => setPromptIdea(null)}>
              {t('닫기')}
            </button>
            <button
              type="button"
              className="pixel-btn small primary"
              onClick={() => {
                if (promptIdea.title && !title.trim()) setTitle(promptIdea.title);
                setDescription(promptIdea.description);
                setPromptIdea(null);
              }}
            >
              {t('적용')}
            </button>
          </div>
        </div>
      )}
      <label className="field">
        {t('프로젝트 마일스톤')}
        <select value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)}>
          <option value="">{t('진행률에 포함하지 않음')}</option>
          {(office.milestones ?? []).map((milestone) => (
            <option key={milestone.id} value={milestone.id}>{milestone.label} · {tpl('전체의 {n}%', { n: milestone.weight })}</option>
          ))}
        </select>
      </label>
      <label className="field">
        {t('업무 유형 (여정 바로가기)')}
        <select value={taskType} onChange={(e) => changeType(e.target.value)}>
          {team.taskTypes.map((entry) => {
            const hours = entry.standardHours + (entry.hoursPerItem ?? 0) * Math.max(1, pendingCount);
            return (
              <option key={entry.id} value={entry.id}>
                {t(entry.label)} ({tpl('사람 기준 {hours}시간 = {money}', { hours: Math.round(hours * 10) / 10, money: krw(hours * hourlyRateKrw) })})
              </option>
            );
          })}
        </select>
      </label>
      <div className="field">
        {t('업무 여정')}
        <div className="segmented" role="radiogroup" aria-label={t('업무 여정 정하는 방법')}>
          {PLAN_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={planMode === m.id}
              className={`segment ${planMode === m.id ? 'active' : ''}`}
              onClick={() => changeMode(m.id)}
            >
              {t(m.label)}
            </button>
          ))}
        </div>
      </div>
      <div className="row assist-row">
        <button
          type="button"
          className={`pixel-btn small ${picking ? 'primary' : ''}`}
          title={t('저장한 흐름·유형 기본·커뮤니티 흐름을 찾아서 바꿔요')}
          onClick={() => setPicking((v) => !v)}
        >
          📚 {t('흐름 고르기 (검색·추천)')}
        </button>
      </div>
      {picking && (
        <FlowPicker
          officeId={office.id}
          team={office.team}
          agents={agents}
          flows={flows}
          request={request}
          canManage={canSaveFlows}
          onPick={usePicked}
          onClose={() => setPicking(false)}
          onError={onError}
        />
      )}
      <div className="plan-scroll">
      {planMode === 'template' && <PlanChain steps={steps} agents={agents} />}
      {planMode === 'ai' && (
        <div className="callout plan-ai">
          <span>{t('업무가 시작되면 팀장이 요청 내용을 보고 단계와 담당자를 정해요. 설계에도 AI 비용이 조금 들어요.')}</span>
          <button type="button" className="pixel-btn small" disabled={designing} onClick={preview}>
            {designing ? t('설계 중…') : t('지금 미리 설계 받기')}
          </button>
        </div>
      )}
      {planMode === 'custom' && (
        <>
          {planNote && <p className="plan-note small">🧭 {t('팀장 의견')}: {planNote}</p>}
          <FlowTools officeId={office.id} team={office.team} agents={agents} steps={steps} flows={flows} canSave={canSaveFlows} onLoad={setSteps} onError={onError} />
          <PlanEditor team={office.team} agents={agents} steps={steps} onChange={setSteps} />
          <button
            type="button"
            className="pixel-btn small"
            disabled={helping !== null}
            title={t('비어 있는 단계 지시만 채워요. 직접 쓴 지시는 그대로 둬요.')}
            onClick={() => void help('steps', async () => setSteps((await api.suggestInstructions(office.id, { ...request, steps })).steps))}
          >
            {helping === 'steps' ? t('채우는 중…') : t('✨ 단계별 지시 추천')}
          </button>
          <button type="button" className="pixel-btn small" disabled={designing} onClick={preview}>
            {designing ? t('설계 중…') : t('🧭 AI 추천으로 다시 채우기')}
          </button>
        </>
      )}
      </div>
      <div className="row end">
        <button className="pixel-btn" onClick={onClose}>
          {t('취소')}
        </button>
        <button className="pixel-btn primary" disabled={busy || noInput || Boolean(planError) || (titleRequired && !title.trim())} onClick={submit}>
          {willQueue ? t('대기열에 추가') : t('칠판에 붙이기')}
        </button>
      </div>
    </Modal>
  );
}

export function HelpDialog({
  task,
  agent,
  roleTitle,
  themeId,
  onClose,
  onError,
}: { task: Task; agent: Agent; roleTitle: string; themeId?: string; onClose: () => void } & ErrorProp) {
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
    <Modal title={tpl('🤝 {name}({roleTitle}) 도와주기', { name: agent.name, roleTitle })} onClose={onClose}>
      <div className="help-question">
        <span className="help-portrait">
          <AgentPortrait agent={agent} themeId={themeId} expression="troubled" />
        </span>
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
        {t('직접 답하기')}
        <span className="help-answer">
          <input
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && answer.trim() && void send(answer)}
            placeholder={t('원하는 방향을 짧게 적어 주세요')}
          />
          <button type="button" className="pixel-btn primary" disabled={!answer.trim()} onClick={() => send(answer)}>
            {t('이렇게 해줘')}
          </button>
        </span>
      </label>
      {/* The assumption can be a long sentence, so it reads under the button's name instead of squeezing the row. */}
      <button className="pixel-btn help-default" onClick={() => send(null)}>
        <b>{t('알아서 진행')}</b>
        <span className="small muted">{help.assumption}</span>
      </button>
      <p className="muted small">
        {tpl('{n}초 안에 답이 없으면 "{assumption}"(으)로 진행해요. 곤란 표정은 감정이 아니라 지시가 모호하다는 신호예요.', { n: remaining, assumption: help.assumption })}
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
    <Modal title={tpl('📜 {name}의 규칙', { name: agent.name })} onClose={onClose}>
      <div className="rule-block">
        <div className="rule-label">{t('조직 안전 규칙 (덮어쓸 수 없음)')}</div>
        <ul className="plain-list small">
          {safetyRules.map((r) => (
            <li key={r}>🔒 {r}</li>
          ))}
        </ul>
      </div>
      <label className="field">
        {t('개인 규칙')}
        <textarea rows={5} value={rules} onChange={(e) => setRules(e.target.value)} />
      </label>
      {confirming ? (
        <div className="diff">
          <div>
            <b>{t('변경 전')}</b>
            <pre>{agent.rules || t('(없음)')}</pre>
          </div>
          <div>
            <b>{t('변경 후')}</b>
            <pre>{rules || t('(없음)')}</pre>
          </div>
          <div className="row end">
            <button className="pixel-btn" onClick={() => setConfirming(false)}>
              {t('다시 고치기')}
            </button>
            <button className="pixel-btn primary" onClick={save}>
              {t('승인하고 반영')}
            </button>
          </div>
        </div>
      ) : (
        <div className="row end">
          <button className="pixel-btn" onClick={onClose}>
            {t('닫기')}
          </button>
          <button className="pixel-btn primary" disabled={rules === agent.rules} onClick={() => setConfirming(true)}>
            {t('변경 내용 확인')}
          </button>
        </div>
      )}
    </Modal>
  );
}

export function AgentCardModal({ agent, roleTitle, themeId, onClose }: { agent: Agent; roleTitle: string; themeId?: string; onClose: () => void }) {
  const profit = agent.valueKrw - agent.costKrw;
  return (
    <Modal title={tpl('💼 {name} 손익 카드', { name: agent.name })} onClose={onClose}>
      <div className="agent-card-portrait">
        <AgentPortrait agent={agent} themeId={themeId} expression={profit < 0 ? 'sweat' : 'smile'} />
      </div>
      <table className="table">
        <tbody>
          <tr>
            <td>{t('역할')}</td>
            <td className="num">{roleTitle}</td>
          </tr>
          <tr>
            <td>{t('모델 (모자)')}</td>
            <td className="num">{modelLabel(agent.model)}</td>
          </tr>
          <tr>
            <td>{t('이번 달 비용 (인건비)')}</td>
            <td className="num">{krw(agent.costKrw)}</td>
          </tr>
          <tr>
            <td>{t('벌어 온 가치 (비용 비율로 배분)')}</td>
            <td className="num">{krw(agent.valueKrw)}</td>
          </tr>
          <tr className="total">
            <td>{t('이익')}</td>
            <td className={`num ${profit < 0 ? 'neg' : 'pos'}`}>{krw(profit)}</td>
          </tr>
          <tr>
            <td>ROI</td>
            <td className="num">{roi(agent.valueKrw, agent.costKrw)}</td>
          </tr>
          <tr>
            <td>{t('완료 업무')}</td>
            <td className="num">{tpl('{n}건', { n: agent.tasksDone })}</td>
          </tr>
        </tbody>
      </table>
    </Modal>
  );
}
