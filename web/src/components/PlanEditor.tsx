import { t, tpl } from '../../../shared/i18n.ts';
import { TEAMS } from '../../../shared/teams.ts';
import type { Agent, StepLoop, TeamId, WorkflowStepInput } from '../../../shared/types.ts';
import { LOOP_PLACEHOLDER, LOOPABLE, loopTargets, MAX_LOOP, MAX_PLAN_STEPS, STEP_KIND, stepKindHint, stepKindTitle, validatePlan } from '../../../shared/workflow.ts';
import { canMove as canMoveStep, canRemove, defaultLoop, insertIndex, insertStep, moveStep, removeStep } from '../planOps.ts';

interface Props {
  team: TeamId;
  agents: Agent[];
  steps: WorkflowStepInput[];
  onChange: (steps: WorkflowStepInput[]) => void;
}

export function PlanEditor({ team, agents, steps, onChange }: Props) {
  const roleTitles = TEAMS[team].roleTitles;
  const error = validatePlan(steps, agents);
  const full = steps.length >= MAX_PLAN_STEPS;

  const update = (index: number, patch: Partial<WorkflowStepInput>) =>
    onChange(steps.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  const updateLoop = (index: number, patch: Partial<StepLoop>) => update(index, { loop: { ...steps[index].loop!, ...patch } });

  const move = (index: number, delta: -1 | 1) => onChange(moveStep(steps, index, delta));
  const canMove = (index: number, delta: -1 | 1) => canMoveStep(steps, index, delta);
  const remove = (index: number) => onChange(removeStep(steps, index));
  const insert = (kind: 'research' | 'review') => {
    const at = insertIndex(steps, kind, null);
    if (at !== null) onChange(insertStep(steps, kind, agents, at, kind === 'research' ? t('추가 조사') : t('추가 검토')));
  };

  return (
    <div className="plan-editor">
      <ol className="plan-steps">
        {steps.map((step, i) => {
          const meta = STEP_KIND[step.kind];
          return (
            <li key={i} className={`plan-step kind-${step.kind}`}>
              <div className="plan-step-row">
                <span className="plan-step-kind" title={stepKindHint(step.kind)}>
                  {meta.icon} {stepKindTitle(step.kind)}
                </span>
                <input
                  className="plan-step-label"
                  value={step.label}
                  maxLength={20}
                  onChange={(e) => update(i, { label: e.target.value })}
                  aria-label={tpl('{v}단계 이름', { v: i + 1 })}
                />
              </div>
              <div className="plan-step-row">
                {step.kind === 'approval' ? (
                  <span className="plan-step-owner muted small">{t('🙋 사용자(나) · 수정 요청하면 결과물 작성으로 돌아가요')}</span>
                ) : (
                  <select
                    className="plan-step-owner"
                    value={step.agentId ?? ''}
                    onChange={(e) => update(i, { agentId: e.target.value })}
                    aria-label={tpl('{v}단계 담당자', { v: i + 1 })}
                  >
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({t(roleTitles[a.role])})
                      </option>
                    ))}
                  </select>
                )}
                <span className="plan-step-tools">
                  <button type="button" className="icon-btn" disabled={!canMove(i, -1)} onClick={() => move(i, -1)} title={t('위로')}>
                    ▲
                  </button>
                  <button type="button" className="icon-btn" disabled={!canMove(i, 1)} onClick={() => move(i, 1)} title={t('아래로')}>
                    ▼
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    disabled={!canRemove(steps, i)}
                    onClick={() => remove(i)}
                    title={canRemove(steps, i) ? t('단계 빼기') : t('꼭 필요한 단계예요')}
                  >
                    ✕
                  </button>
                </span>
              </div>
              {step.kind !== 'approval' && (
                <input
                  className="plan-step-note"
                  value={step.instructions}
                  maxLength={300}
                  placeholder={t('이 단계에만 줄 지시 (선택)')}
                  onChange={(e) => update(i, { instructions: e.target.value })}
                />
              )}
              {(step.kind === 'research' || step.kind === 'review') && steps[i - 1]?.kind === step.kind && (
                <label className="check small" title={step.kind === 'review' ? t('검토자 여럿이 같은 초안을 동시에 평가하고, 과반이 통과시키면 통과예요.') : t('같은 역할 직원 여럿이 각자 조사하고, 결과물 작성 단계에서 한꺼번에 비교해요.')}>
                  <input type="checkbox" checked={Boolean(step.parallel)} onChange={(e) => update(i, e.target.checked ? { parallel: true, loop: null } : { parallel: undefined })} />
                  ⇉ {step.kind === 'review' ? t('앞 검토와 동시에 진행 (다수결)') : t('앞 조사와 동시에 진행')}
                </label>
              )}
              {LOOPABLE.includes(step.kind) && (
                <div className={`plan-step-loop ${step.loop ? 'on' : ''}`}>
                  <label className="check small">
                    <input
                      type="checkbox"
                      checked={Boolean(step.loop)}
                      onChange={(e) => update(i, { loop: e.target.checked ? defaultLoop(steps, i) : null })}
                    />
                    🔁 {step.kind === 'review' ? t('반려되면 되돌리기') : t('조건이 맞으면 되돌리기')}
                  </label>
                  {!step.loop && step.kind === 'review' && <span className="small muted">{t('끄면 의견만 남기고 넘어가요')}</span>}
                  {step.loop && (
                    <div className="plan-loop-fields">
                      <input
                        value={step.loop.when}
                        maxLength={60}
                        placeholder={LOOP_PLACEHOLDER[step.kind]}
                        onChange={(e) => updateLoop(i, { when: e.target.value })}
                        aria-label={tpl('{v}단계 반복 조건', { v: i + 1 })}
                      />
                      <select
                        value={step.loop.to}
                        onChange={(e) => updateLoop(i, { to: Number(e.target.value) })}
                        aria-label={tpl('{v}단계 되돌아갈 단계', { v: i + 1 })}
                      >
                        {loopTargets(steps, i).map((to) => (
                          <option key={to} value={to}>
                            {to === i ? t('이 단계 다시') : tpl('{n}. {label}(으)로', { n: to + 1, label: t(steps[to].label) })}
                          </option>
                        ))}
                      </select>
                      <select
                        value={step.loop.max}
                        onChange={(e) => updateLoop(i, { max: Number(e.target.value) })}
                        aria-label={tpl('{v}단계 최대 반복', { v: i + 1 })}
                      >
                        {Array.from({ length: MAX_LOOP }, (_, n) => n + 1).map((n) => (
                          <option key={n} value={n}>
                            {tpl('최대 {n}회', { n })}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <div className="row">
        <button type="button" className="pixel-btn small" disabled={full} onClick={() => insert('research')}>
          {t('+ 조사·분석 단계')}
        </button>
        <button type="button" className="pixel-btn small" disabled={full} onClick={() => insert('review')}>
          {t('+ 검토 단계')}
        </button>
      </div>
      {error && <p className="small neg">{error}</p>}
    </div>
  );
}
