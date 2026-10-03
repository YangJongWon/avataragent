import { TEAMS } from '../../../shared/teams.ts';
import type { Agent, StepKind, StepLoop, TeamId, WorkflowStepInput } from '../../../shared/types.ts';
import {
  LOOP_PLACEHOLDER,
  LOOPABLE,
  loopTargets,
  MAX_LOOP,
  MAX_PLAN_STEPS,
  remapLoops,
  reviewLoop,
  STEP_KIND,
  validatePlan,
} from '../../../shared/workflow.ts';

interface Props {
  team: TeamId;
  agents: Agent[];
  steps: WorkflowStepInput[];
  onChange: (steps: WorkflowStepInput[]) => void;
}

const REMOVABLE: StepKind[] = ['research', 'review'];

/** After a move, a loop may point past where it is allowed; pull it back to the nearest valid step. */
function clampLoops(steps: WorkflowStepInput[]) {
  return steps.map((s, i) => {
    if (!s.loop) return s;
    const targets = loopTargets(steps, i);
    if (targets.includes(s.loop.to)) return s;
    return { ...s, loop: { ...s.loop, to: targets.at(-1) ?? i } };
  });
}

function defaultLoop(steps: WorkflowStepInput[], index: number): StepLoop {
  if (steps[index].kind === 'review') return reviewLoop(steps);
  return { to: index, when: (LOOP_PLACEHOLDER[steps[index].kind] ?? '').replace(/^예:\s*/, ''), max: 1 };
}

export function PlanEditor({ team, agents, steps, onChange }: Props) {
  const roleTitles = TEAMS[team].roleTitles;
  const error = validatePlan(steps, agents);
  const full = steps.length >= MAX_PLAN_STEPS;

  const update = (index: number, patch: Partial<WorkflowStepInput>) =>
    onChange(steps.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  const updateLoop = (index: number, patch: Partial<StepLoop>) => update(index, { loop: { ...steps[index].loop!, ...patch } });

  const move = (index: number, delta: -1 | 1) => {
    const other = index + delta;
    const next = remapLoops(steps, (i) => (i === index ? other : i === other ? index : i));
    [next[index], next[other]] = [next[other], next[index]];
    onChange(clampLoops(next));
  };
  const canMove = (index: number, delta: -1 | 1) => {
    const other = steps[index + delta];
    return Boolean(other) && other.kind === steps[index].kind;
  };

  const remove = (index: number) =>
    onChange(remapLoops(steps, (i) => (i === index ? null : i > index ? i - 1 : i)).filter((_, j) => j !== index));

  const insert = (kind: 'research' | 'review') => {
    const at = kind === 'research' ? steps.findIndex((s) => s.kind === 'draft') : steps.length - 1;
    const meta = STEP_KIND[kind];
    const owner = agents.find((a) => a.role === meta.role)?.id ?? agents[0]?.id ?? null;
    const next = remapLoops(steps, (i) => (i >= at ? i + 1 : i));
    next.splice(at, 0, { kind, label: kind === 'research' ? '추가 조사' : '추가 검토', agentId: owner, instructions: '', loop: null });
    if (kind === 'review') next[at] = { ...next[at], loop: reviewLoop(next) };
    onChange(next);
  };

  return (
    <div className="plan-editor">
      <ol className="plan-steps">
        {steps.map((step, i) => {
          const meta = STEP_KIND[step.kind];
          return (
            <li key={i} className={`plan-step kind-${step.kind}`}>
              <div className="plan-step-row">
                <span className="plan-step-kind" title={meta.hint}>
                  {meta.icon} {meta.title}
                </span>
                <input
                  className="plan-step-label"
                  value={step.label}
                  maxLength={20}
                  onChange={(e) => update(i, { label: e.target.value })}
                  aria-label={`${i + 1}단계 이름`}
                />
              </div>
              <div className="plan-step-row">
                {step.kind === 'approval' ? (
                  <span className="plan-step-owner muted small">🙋 사용자(나) · 수정 요청하면 결과물 작성으로 돌아가요</span>
                ) : (
                  <select
                    className="plan-step-owner"
                    value={step.agentId ?? ''}
                    onChange={(e) => update(i, { agentId: e.target.value })}
                    aria-label={`${i + 1}단계 담당자`}
                  >
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({roleTitles[a.role]})
                      </option>
                    ))}
                  </select>
                )}
                <span className="plan-step-tools">
                  <button type="button" className="icon-btn" disabled={!canMove(i, -1)} onClick={() => move(i, -1)} title="위로">
                    ▲
                  </button>
                  <button type="button" className="icon-btn" disabled={!canMove(i, 1)} onClick={() => move(i, 1)} title="아래로">
                    ▼
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    disabled={!REMOVABLE.includes(step.kind)}
                    onClick={() => remove(i)}
                    title={REMOVABLE.includes(step.kind) ? '단계 빼기' : '꼭 필요한 단계예요'}
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
                  placeholder="이 단계에만 줄 지시 (선택)"
                  onChange={(e) => update(i, { instructions: e.target.value })}
                />
              )}
              {LOOPABLE.includes(step.kind) && (
                <div className={`plan-step-loop ${step.loop ? 'on' : ''}`}>
                  <label className="check small">
                    <input
                      type="checkbox"
                      checked={Boolean(step.loop)}
                      onChange={(e) => update(i, { loop: e.target.checked ? defaultLoop(steps, i) : null })}
                    />
                    🔁 {step.kind === 'review' ? '반려되면 되돌리기' : '조건이 맞으면 되돌리기'}
                  </label>
                  {!step.loop && step.kind === 'review' && <span className="small muted">끄면 의견만 남기고 넘어가요</span>}
                  {step.loop && (
                    <div className="plan-loop-fields">
                      <input
                        value={step.loop.when}
                        maxLength={60}
                        placeholder={LOOP_PLACEHOLDER[step.kind]}
                        onChange={(e) => updateLoop(i, { when: e.target.value })}
                        aria-label={`${i + 1}단계 반복 조건`}
                      />
                      <select
                        value={step.loop.to}
                        onChange={(e) => updateLoop(i, { to: Number(e.target.value) })}
                        aria-label={`${i + 1}단계 되돌아갈 단계`}
                      >
                        {loopTargets(steps, i).map((t) => (
                          <option key={t} value={t}>
                            {t === i ? '이 단계 다시' : `${t + 1}. ${steps[t].label}(으)로`}
                          </option>
                        ))}
                      </select>
                      <select
                        value={step.loop.max}
                        onChange={(e) => updateLoop(i, { max: Number(e.target.value) })}
                        aria-label={`${i + 1}단계 최대 반복`}
                      >
                        {Array.from({ length: MAX_LOOP }, (_, n) => n + 1).map((n) => (
                          <option key={n} value={n}>
                            최대 {n}회
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
          + 조사·분석 단계
        </button>
        <button type="button" className="pixel-btn small" disabled={full} onClick={() => insert('review')}>
          + 검토 단계
        </button>
      </div>
      {error && <p className="small neg">{error}</p>}
    </div>
  );
}
