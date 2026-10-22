import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { TEAMS } from '../../../shared/teams.ts';
import type { Agent, StepLoop, TeamId, WorkflowStepInput } from '../../../shared/types.ts';
import { LOOP_PLACEHOLDER, LOOPABLE, loopTargets, MAX_LOOP, MAX_PLAN_STEPS, PARALLEL_KINDS, STEP_KIND, stepKindHint, stepKindTitle } from '../../../shared/workflow.ts';
import type { McpServer } from '../../../shared/mcp.ts';
import { useLanguage } from '../LanguageProvider.tsx';
import { StepExtras } from './StepExtras.tsx';
import { PARALLEL_TEXT } from '../parallelText.ts';
import { canMove, canRemove, changeKind, defaultLoop, insertIndex, insertStep, moveStep, removeStep, REMOVABLE } from '../planOps.ts';

interface Props {
  team: TeamId;
  agents: Agent[];
  steps: WorkflowStepInput[];
  index: number;
  /** Leading steps that already started and stay as they are. */
  locked: number;
  /** MCP servers the office may use, for the step's own; undefined when the viewer cannot see them. */
  servers?: McpServer[];
  /** A task whose journey can no longer change (finished, or past the point of editing): edits become a flow for the next task. */
  template?: 'completed' | 'locked';
  /** The task waits for the user's decision at this approval step; it can be given here too. */
  approval?: {
    estimatedKrw: number | null;
    onApprove: (valueKrw?: number) => Promise<void>;
    onRequestChanges: (comment: string) => Promise<void>;
    onError: (message: string) => void;
  };
  /** Footer save: the dialog always keeps edits as a draft until this is pressed. */
  saveLabel: string;
  showSave: boolean;
  saveDisabled: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onChange: (steps: WorkflowStepInput[], select?: number | null) => void;
  onClose: () => void;
}

/** The decision the report panel offers, for when the approval step's dialog is the one open. */
function ApprovalBox({ approval, onDone }: { approval: NonNullable<Props['approval']>; onDone: () => void }) {
  const { t } = useLanguage();
  const [value, setValue] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      onDone();
    } catch (e) {
      approval.onError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return (
    <div className="step-approval">
      <b>🙋 {t('승인을 기다리고 있어요')}</b>
      <div className="row wrap">
        <label className="field-inline">
          {t('인정할 가치(원)')}
          <input type="number" min={0} placeholder={approval.estimatedKrw === null ? '' : String(approval.estimatedKrw)} value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        <button type="button" className="pixel-btn primary" disabled={busy} onClick={() => void run(() => approval.onApprove(value === '' ? undefined : Number(value)))}>
          {t('승인하고 반영')}
        </button>
      </div>
      <textarea rows={2} placeholder={t('수정 요청 내용 (예: 결론에 실행 일정을 추가해 주세요)')} value={comment} onChange={(e) => setComment(e.target.value)} />
      <button type="button" className="pixel-btn" disabled={busy || !comment.trim()} onClick={() => void run(() => approval.onRequestChanges(comment.trim()))}>
        {t('수정 요청 (가치 70%로 감액)')}
      </button>
    </div>
  );
}

/** Edits one step of a task's journey in place: name, kind, who does it, instructions, loop, and its neighbours. */
export function StepInspector({ team, agents, steps, index, locked, template, approval, saveLabel, showSave, saveDisabled, saving, onSave, onDiscard, onChange, onClose, servers }: Props) {
  const { t, tpl } = useLanguage();
  const step = steps[index];
  // A dialog of its own (portaled to the body so the bottom drawer on mobile never traps it).
  // Escape is caught in the capture phase so an outer dialog underneath stays open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  if (!step) return null;
  const meta = STEP_KIND[step.kind];
  const roleTitles = TEAMS[team].roleTitles;
  const readOnly = index < locked;
  const full = steps.length >= MAX_PLAN_STEPS;

  const update = (patch: Partial<WorkflowStepInput>) => onChange(steps.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  const updateLoop = (patch: Partial<StepLoop>) => update({ loop: { ...step.loop!, ...patch } });
  const add = (kind: 'research' | 'review') => {
    const at = insertIndex(steps, kind, index, locked);
    if (at !== null) onChange(insertStep(steps, kind, agents, at, kind === 'research' ? t('추가 조사') : t('추가 검토')), at);
  };
  const addable = (kind: 'research' | 'review') => !full && insertIndex(steps, kind, index, locked) !== null;
  // Staff whose role matches the step come first, so the usual choice is at the top.
  const ordered = [...agents].sort((a, b) => Number(b.role === meta.role) - Number(a.role === meta.role));

  return createPortal(
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal pixel-box step-inspector-modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <span className="step-head-title">
            <span className="step-head-text">
              {meta.icon} {tpl('{n}단계', { n: String(index + 1) })} · {stepKindTitle(step.kind)}
            </span>
            <button
              type="button"
              className="pixel-btn small danger"
              disabled={!canRemove(steps, index, locked)}
              title={canRemove(steps, index, locked) ? t('단계 빼기') : t('꼭 필요한 단계이거나 이미 시작한 단계예요')}
              onClick={() => onChange(removeStep(steps, index), Math.min(index, steps.length - 2))}
            >
              🗑 {t('단계 빼기')}
            </button>
          </span>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('닫기')}>
            ✕
          </button>
        </div>
        <div className="step-inspector">
          <p className="small muted">{stepKindHint(step.kind)}</p>
          {approval && <ApprovalBox approval={approval} onDone={onClose} />}
          {template === 'completed' && <p className="small callout">✅ {t('완료된 업무라 이번 여정은 바뀌지 않아요. 저장하면 다음 업무에서 쓸 흐름이 돼요.')}</p>}
          {template === 'locked' && <p className="small callout">{t('지금은 이번 여정을 바꿀 수 없어요. 저장하면 다음 업무에서 쓸 흐름이 돼요.')}</p>}
      {readOnly && <p className="small callout">{t('이미 시작한 단계라 바꿀 수 없어요. 뒤의 단계는 고칠 수 있어요.')}</p>}

      <label className="field">
        {t('단계 이름')}
        <input value={step.label} maxLength={20} disabled={readOnly} onChange={(e) => update({ label: e.target.value })} />
      </label>

      {REMOVABLE.includes(step.kind) && (
        <div className="field">
          {t('단계 종류 (역할)')}
          <div className="segmented" role="radiogroup">
            {(['research', 'review'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={step.kind === kind}
                className={`segment ${step.kind === kind ? 'active' : ''}`}
                disabled={readOnly}
                title={stepKindHint(kind)}
                onClick={() => {
                  const changed = changeKind(steps, index, kind, agents, locked);
                  onChange(changed.steps, changed.index);
                }}
              >
                {STEP_KIND[kind].icon} {stepKindTitle(kind)}
              </button>
            ))}
          </div>
          <span className="small muted">{t('조사·분석은 결과물 작성 앞, 검토는 뒤에 자동으로 자리 잡아요.')}</span>
        </div>
      )}

      {step.kind === 'approval' ? (
        <p className="small muted">🙋 {t('사용자(나) · 수정 요청하면 결과물 작성으로 돌아가요')}</p>
      ) : (
        <label className="field">
          {t('담당 직원')}
          <select value={step.agentId ?? ''} disabled={readOnly} onChange={(e) => update({ agentId: e.target.value })}>
            {ordered.map((a) => (
              <option key={a.id} value={a.id}>
                {a.role === meta.role ? '★ ' : ''}
                {a.name} ({t(roleTitles[a.role])})
              </option>
            ))}
          </select>
          {meta.role && <span className="small muted">{tpl('★ 표시는 이 단계에 맞는 역할({role})이에요.', { role: t(roleTitles[meta.role]) })}</span>}
        </label>
      )}

      {step.kind !== 'approval' && (
        <label className="field">
          {t('이 단계에만 줄 지시 (선택)')}
          <textarea rows={2} value={step.instructions} maxLength={300} disabled={readOnly} onChange={(e) => update({ instructions: e.target.value })} />
        </label>
      )}
      {step.kind !== 'approval' && <StepExtras step={step} servers={servers} readOnly={readOnly} onChange={update} />}

      {PARALLEL_KINDS.includes(step.kind) && steps[index - 1]?.kind === step.kind && (
        <label className="check small" title={t(PARALLEL_TEXT[step.kind]!.hint)}>
          <input type="checkbox" checked={Boolean(step.parallel)} disabled={readOnly} onChange={(e) => update(e.target.checked ? { parallel: true, loop: null } : { parallel: undefined })} />
          ⇉ {t(PARALLEL_TEXT[step.kind]!.join)}
        </label>
      )}

      {LOOPABLE.includes(step.kind) && (
        <div className={`plan-step-loop ${step.loop ? 'on' : ''}`}>
          <label className="check small">
            <input type="checkbox" checked={Boolean(step.loop)} disabled={readOnly} onChange={(e) => update({ loop: e.target.checked ? defaultLoop(steps, index) : null })} />
            🔁 {step.kind === 'review' ? t('반려되면 되돌리기') : t('조건이 맞으면 되돌리기')}
          </label>
          {step.loop && (
            <div className="plan-loop-fields">
              <input value={step.loop.when} maxLength={60} disabled={readOnly} placeholder={t(LOOP_PLACEHOLDER[step.kind] ?? '')} onChange={(e) => updateLoop({ when: e.target.value })} aria-label={t('반복 조건')} />
              <select value={step.loop.to} disabled={readOnly} onChange={(e) => updateLoop({ to: Number(e.target.value) })} aria-label={t('되돌아갈 단계')}>
                {loopTargets(steps, index).map((to) => (
                  <option key={to} value={to}>
                    {to === index ? t('이 단계 다시') : tpl('{n}. {label}(으)로', { n: String(to + 1), label: t(steps[to].label) })}
                  </option>
                ))}
              </select>
              <input
                className="plan-loop-max"
                type="number"
                min={1}
                max={MAX_LOOP}
                disabled={readOnly}
                value={step.loop.max ?? ''}
                placeholder={t('제한 없음')}
                title={t('비우면 조건이 맞을 때까지 돌아가요')}
                onChange={(e) => updateLoop({ max: e.target.value === '' ? null : Number(e.target.value) })}
                aria-label={t('최대 반복')}
              />
            </div>
          )}
        </div>
      )}

      <div className="row step-inspector-actions">
        <button type="button" className="pixel-btn small" disabled={!canMove(steps, index, -1, locked)} onClick={() => onChange(moveStep(steps, index, -1), index - 1)}>
          ◀ {t('앞으로')}
        </button>
        <button type="button" className="pixel-btn small" disabled={!canMove(steps, index, 1, locked)} onClick={() => onChange(moveStep(steps, index, 1), index + 1)}>
          {t('뒤로')} ▶
        </button>
        <button type="button" className="pixel-btn small" disabled={!addable('research')} onClick={() => add('research')}>
          + {t('조사·분석 단계')}
        </button>
        <button type="button" className="pixel-btn small" disabled={!addable('review')} onClick={() => add('review')}>
          + {t('검토 단계')}
        </button>
      </div>
      <div className="row step-inspector-foot">
        {showSave && (
          <button type="button" className="pixel-btn small primary" disabled={saveDisabled || saving} onClick={onSave}>
            {saving ? t('저장 중…') : saveLabel}
          </button>
        )}
        <button type="button" className="pixel-btn small" disabled={saving} onClick={onDiscard}>
          {t('↺ 되돌리기')}
        </button>
      </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
