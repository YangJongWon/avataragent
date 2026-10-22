import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { t, tpl } from '../../../shared/i18n.ts';
import { TEAMS } from '../../../shared/teams.ts';
import type { McpServer } from '../../../shared/mcp.ts';
import type { Agent, StepKind, StepLoop, TeamId, WorkflowStepInput } from '../../../shared/types.ts';
import { PARALLEL_TEXT } from '../parallelText.ts';
import { StepExtras } from './StepExtras.tsx';
import { LOOP_PLACEHOLDER, LOOPABLE, loopTargets, MAX_LOOP, MAX_PLAN_STEPS, PARALLEL_KINDS, STEP_KIND, stepKindHint, stepKindTitle, validatePlan } from '../../../shared/workflow.ts';
import {
  addToStage,
  canMove as canMoveStep,
  canRemove,
  defaultLoop,
  insertIndex,
  insertStep,
  moveStep,
  removeFromStage,
  separateFromStage,
  stagesOf,
} from '../planOps.ts';

interface Props {
  team: TeamId;
  agents: Agent[];
  steps: WorkflowStepInput[];
  /** MCP servers the office may use, for steps that name their own; undefined when the viewer cannot see them. */
  servers?: McpServer[];
  onChange: (steps: WorkflowStepInput[]) => void;
}

/**
 * The journey as numbered stages. A research or review stage may hold several steps, each by its own staff member,
 * that run at the same time (research notes compared in the draft, reviews decided by majority). Such a stage shows
 * as one row of its steps side by side, and opens in a dialog of its own to edit.
 */
export function PlanEditor({ team, agents, steps, servers, onChange }: Props) {
  const roleTitles = TEAMS[team].roleTitles;
  const error = validatePlan(steps, agents);
  const full = steps.length >= MAX_PLAN_STEPS;
  const stages = stagesOf(steps);
  /** First step of the stage open in the dialog. */
  const [openStage, setOpenStage] = useState<number | null>(null);
  const shownStage = openStage === null ? null : stages.find((stage) => stage[0] === openStage && stage.length > 1);
  useEffect(() => {
    if (openStage !== null && !shownStage) setOpenStage(null);
  }, [openStage, shownStage]);

  const update = (index: number, patch: Partial<WorkflowStepInput>) =>
    onChange(steps.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  const updateLoop = (index: number, patch: Partial<StepLoop>) => update(index, { loop: { ...steps[index].loop!, ...patch } });

  const inStage = (index: number) => stages.find((stage) => stage.includes(index))!.length > 1;
  // A step moves alone; steps running together move as a stage only by taking them apart first.
  const canMove = (index: number, delta: -1 | 1) => !inStage(index) && steps[index + delta] !== undefined && !inStage(index + delta) && canMoveStep(steps, index, delta);
  const move = (index: number, delta: -1 | 1) => onChange(moveStep(steps, index, delta));
  const remove = (index: number) => onChange(removeFromStage(steps, index));
  const insert = (kind: 'research' | 'review') => {
    const at = insertIndex(steps, kind, null);
    if (at !== null) onChange(insertStep(steps, kind, agents, at, kind === 'research' ? t('추가 조사') : t('추가 검토')));
  };
  const addParallel = (index: number) => {
    const size = stages.find((stage) => stage.includes(index))!.length;
    onChange(addToStage(steps, index, agents, `${t(steps[index].label)} ${size + 1}`));
    setOpenStage(stages.find((stage) => stage.includes(index))![0]);
  };

  const owner = (step: WorkflowStepInput) => agents.find((a) => a.id === step.agentId)?.name ?? t('담당 없음');

  /** One step's fields: name, owner, instructions, loop. Inside a stage the stage handles order and the "together" switch. */
  const card = (i: number, inside: boolean) => {
    const step = steps[i];
    const meta = STEP_KIND[step.kind];
    const lead = inside && !step.parallel;
    return (
      <div className={`plan-step kind-${step.kind}`} key={i}>
        <div className="plan-step-row">
          <span className="plan-step-kind" title={stepKindHint(step.kind)}>
            {meta.icon} {stepKindTitle(step.kind)}
          </span>
          <input
            className="plan-step-label"
            value={t(step.label)}
            maxLength={20}
            onChange={(e) => update(i, { label: e.target.value })}
            aria-label={tpl('{v}단계 이름', { v: i + 1 })}
          />
        </div>
        <div className="plan-step-row">
          {step.kind === 'approval' ? (
            <span className="plan-step-owner muted small">{t('🙋 사용자(나) · 삭제하면 자동 승인돼요')}</span>
          ) : (
            <select className="plan-step-owner" value={step.agentId ?? ''} onChange={(e) => update(i, { agentId: e.target.value })} aria-label={tpl('{v}단계 담당자', { v: i + 1 })}>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({t(roleTitles[a.role])})
                </option>
              ))}
            </select>
          )}
          <span className="plan-step-tools">
            {!inside && (
              <>
                <button type="button" className="icon-btn" disabled={!canMove(i, -1)} onClick={() => move(i, -1)} title={t('위로')}>
                  ▲
                </button>
                <button type="button" className="icon-btn" disabled={!canMove(i, 1)} onClick={() => move(i, 1)} title={t('아래로')}>
                  ▼
                </button>
              </>
            )}
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
        {step.kind !== 'approval' && <StepExtras step={step} servers={servers} onChange={(patch) => update(i, patch)} />}
        {inside && step.parallel && (
          <button type="button" className="pixel-btn small" onClick={() => onChange(separateFromStage(steps, i))}>
            ↓ {t('따로 진행 (이 단계 다음에)')}
          </button>
        )}
        {!inside && PARALLEL_KINDS.includes(step.kind) && (
          <div className="row plan-step-together">
            <button type="button" className="pixel-btn small" disabled={full} onClick={() => addParallel(i)} title={t(PARALLEL_TEXT[step.kind]!.hint)}>
              ⇉ {t(PARALLEL_TEXT[step.kind]!.add)}
            </button>
            {steps[i - 1]?.kind === step.kind && (
              <label className="check small">
                <input type="checkbox" checked={false} onChange={() => update(i, { parallel: true, loop: null })} />
                {t('앞 단계와 합치기')}
              </label>
            )}
          </div>
        )}
        {LOOPABLE.includes(step.kind) && (!inside || lead) && (step.kind === 'review' || !inside) && (
          <div className={`plan-step-loop ${step.loop ? 'on' : ''}`}>
            <label className="check small">
              <input type="checkbox" checked={Boolean(step.loop)} onChange={(e) => update(i, { loop: e.target.checked ? defaultLoop(steps, i) : null })} />
              🔁 {step.kind === 'review' ? (inside ? t('과반이 반려하면 되돌리기') : t('반려되면 되돌리기')) : t('조건이 맞으면 되돌리기')}
            </label>
            {!step.loop && step.kind === 'review' && <span className="small muted">{t('끄면 의견만 남기고 넘어가요')}</span>}
            {step.loop && (
              <div className="plan-loop-fields">
                <input
                  value={step.loop.when}
                  maxLength={60}
                  placeholder={t(LOOP_PLACEHOLDER[step.kind] ?? '')}
                  onChange={(e) => updateLoop(i, { when: e.target.value })}
                  aria-label={tpl('{v}단계 반복 조건', { v: i + 1 })}
                />
                <select value={step.loop.to} onChange={(e) => updateLoop(i, { to: Number(e.target.value) })} aria-label={tpl('{v}단계 되돌아갈 단계', { v: i + 1 })}>
                  {loopTargets(steps, i).map((to) => (
                    <option key={to} value={to}>
                      {to === i ? t('이 단계 다시') : tpl('{n}. {label}(으)로', { n: to + 1, label: t(steps[to].label) })}
                    </option>
                  ))}
                </select>
                <input
                  className="plan-loop-max"
                  type="number"
                  min={1}
                  max={MAX_LOOP}
                  value={step.loop.max ?? ''}
                  placeholder={t('제한 없음')}
                  title={t('비우면 조건이 맞을 때까지 돌아가요')}
                  onChange={(e) => updateLoop(i, { max: e.target.value === '' ? null : Number(e.target.value) })}
                  aria-label={tpl('{v}단계 최대 반복', { v: i + 1 })}
                />
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="plan-editor">
      <ol className="plan-steps">
        {stages.map((stage, n) => {
          if (stage.length === 1) {
            return (
              <li key={stage[0]} className="plan-stage">
                <span className="plan-stage-no">{tpl('단계 {n}', { n: n + 1 })}</span>
                {card(stage[0], false)}
              </li>
            );
          }
          const kind = steps[stage[0]].kind;
          const lead = steps[stage[0]];
          return (
            <li key={stage[0]} className="plan-stage">
              <span className="plan-stage-no">
                {tpl('단계 {n}', { n: n + 1 })} · ⇉ {tpl(PARALLEL_TEXT[kind]!.stage, { n: stage.length })}
              </span>
              <button type="button" className={`plan-parallel-row kind-${kind}`} onClick={() => setOpenStage(stage[0])} title={t('눌러서 동시에 하는 단계를 고쳐요')}>
                {stage.map((i) => (
                  <span key={i} className="plan-parallel-chip">
                    <b>
                      {STEP_KIND[kind].icon} {t(steps[i].label)}
                    </b>
                    <span className="small muted">{owner(steps[i])}</span>
                  </span>
                ))}
                <span className="plan-parallel-edit small">✏️ {t('편집')}</span>
              </button>
              {kind === 'review' && lead.loop && (
                <span className="small muted">
                  🔁 {tpl('과반이 반려하면 {label}(으)로', { label: t(steps[lead.loop.to]?.label ?? '') })}
                </span>
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
      {shownStage && <StageDialog title={stageTitle(steps, shownStage, stages)} onClose={() => setOpenStage(null)} onAdd={full ? undefined : () => addParallel(shownStage[0])} kind={steps[shownStage[0]].kind}>
        {shownStage.map((i) => card(i, true))}
      </StageDialog>}
    </div>
  );
}

function stageTitle(steps: WorkflowStepInput[], stage: number[], stages: number[][]) {
  const n = stages.findIndex((s) => s[0] === stage[0]) + 1;
  return tpl(PARALLEL_TEXT[steps[stage[0]].kind]!.title, { n, count: stage.length });
}

/** The steps of one stage that run at the same time, each with all its fields. */
function StageDialog({ title, kind, onAdd, onClose, children }: { title: string; kind: StepKind; onAdd?: () => void; onClose: () => void; children: ReactNode }) {
  // Escape closes this dialog only, not the task dialog underneath.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return createPortal(
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal pixel-box plan-stage-modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <span>⇉ {title}</span>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('닫기')}>
            ✕
          </button>
        </div>
        <p className="small muted">{t(PARALLEL_TEXT[kind]!.hint)}</p>
        <div className="plan-stage-members">{children}</div>
        <div className="row step-inspector-foot">
          {onAdd && (
            <button type="button" className="pixel-btn small" onClick={onAdd}>
              ⇉ {t(PARALLEL_TEXT[kind]!.add)}
            </button>
          )}
          <button type="button" className="pixel-btn small primary" onClick={onClose}>
            {t('완료')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
