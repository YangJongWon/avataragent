import {
  Handle,
  NodeResizer,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { t, tpl } from '../../../shared/i18n.ts';
import { TEAMS } from '../../../shared/teams.ts';
import type { Agent, SavedFlow, StepKind, StepLoop, StepStatus, Task, TeamId, WorkflowStepInput } from '../../../shared/types.ts';
import { lockedStepCount, loopTargetLabel, PLAN_EDITABLE_STATUSES, planModeLabel, STEP_KIND, validatePlan } from '../../../shared/workflow.ts';
import { flowFromPlan, type FlowPack } from '../../../shared/flow-pack.ts';
import { FlowPicker } from './FlowPicker.tsx';
import { StepInspector } from './StepInspector.tsx';

/** `text` holds the Korean catalogue key, so it must be read through `t()` at render. */
const STATUS_VIEW: Record<StepStatus, { icon: string; text: string; cls: string }> = {
  pending: { icon: '○', text: t('대기'), cls: 'st-pending' },
  running: { icon: '●', text: t('작업 중'), cls: 'st-running' },
  done: { icon: '✓', text: t('완료'), cls: 'st-done' },
  error: { icon: '✕', text: t('오류'), cls: 'st-error' },
  awaiting: { icon: '!', text: t('사용자 대기'), cls: 'st-awaiting' },
  rejected: { icon: '↩', text: t('반려'), cls: 'st-rejected' },
  looped: { icon: '🔁', text: t('되돌아감'), cls: 'st-rejected' },
};

const NODE_W = 124;
const NODE_H = 80;
const GAP_X = 24;
const GAP_Y = 52;
const PAD = 8;

type StepData = { icon: string; label: string; status: StepStatus; owner: string; loop?: string; editing?: boolean; selected?: boolean; changed?: boolean };

const SIDES: [Position, string][] = [
  [Position.Left, 'l'],
  [Position.Right, 'r'],
  [Position.Top, 't'],
  [Position.Bottom, 'b'],
];

function StepNode({ data }: NodeProps<Node<StepData>>) {
  const view = STATUS_VIEW[data.status];
  return (
    <>
      <NodeResizer isVisible={Boolean(data.editing)} minWidth={96} minHeight={60} lineClassName="flow-resize-line" handleClassName="flow-resize-handle" />
      <div className={`flow-node ${view.cls} ${data.selected ? 'selected' : ''} ${data.changed ? 'changed' : ''}`}>
        <div className="flow-title">
          {data.icon} {data.label}
        </div>
        <div className="flow-owner">{data.owner}</div>
        <div className="flow-status">
          {view.icon} {t(view.text)}
        </div>
        {data.loop && (
          <div className="flow-loop" title={data.loop}>
            🔁 {data.loop}
          </div>
        )}
      </div>
      {SIDES.map(([position, side]) => (
        <span key={side}>
          <Handle type="target" position={position} id={`${side}-in`} />
          <Handle type="source" position={position} id={`${side}-out`} />
        </span>
      ))}
    </>
  );
}

const nodeTypes = { step: StepNode };

/** Present when the viewer may change this task's journey. */
export interface WorkflowEditing {
  officeId: string;
  flows: SavedFlow[];
  canManageFlows: boolean;
  /** Only the owner keeps the saved-flow list, so only they can keep a journey for next time. */
  canSaveFlows: boolean;
  onSave: (steps: WorkflowStepInput[]) => Promise<void>;
  onSaveFlow: (flow: FlowPack) => Promise<void>;
  onApprove: (valueKrw?: number) => Promise<void>;
  onRequestChanges: (comment: string) => Promise<void>;
  onError: (message: string) => void;
}

type Props = { task: Task | undefined; agents: Agent[]; team: TeamId; edit?: WorkflowEditing; dense?: boolean; maxRows?: number };

export function WorkflowView(props: Props) {
  return (
    <ReactFlowProvider>
      <WorkflowInner {...props} />
    </ReactFlowProvider>
  );
}

type FlowItem = { id: string; kind: StepKind | 'done'; data: StepData };
type Box = { x: number; y: number; w?: number; h?: number };
type Layout = Record<string, Box>;
/** A step as drawn: the saved plan, or the draft being edited on top of it. */
type ShownStep = WorkflowStepInput & { id: string; status: StepStatus; loop: StepLoop | null };

const inputsOf = (task: Task): WorkflowStepInput[] =>
  task.plan.map(({ kind, label, agentId, instructions, loop }) => ({ kind, label, agentId, instructions, loop: loop ?? null }));

function shownSteps(task: Task, draft: WorkflowStepInput[] | null, locked: number): ShownStep[] {
  if (!draft) return task.plan.map((s) => ({ ...s, loop: s.loop ?? null }));
  return draft.map((s, i) => ({
    ...s,
    loop: s.loop ?? null,
    id: i < locked ? task.plan[i].id : `draft-${i}`,
    status: i < locked ? task.plan[i].status : 'pending',
  }));
}

function flowItems(task: Task | undefined, steps: ShownStep[], agents: Agent[], team: TeamId, selected: number | null, changed: Set<number>): FlowItem[] {
  if (!task) return [];
  const items: FlowItem[] = steps.map((s, i) => ({
    id: s.id,
    kind: s.kind,
    data: {
      icon: STEP_KIND[s.kind].icon,
      label: t(s.label),
      status: s.status,
      owner: s.kind === 'approval' ? t('사용자') : (agents.find((a) => a.id === s.agentId)?.name ?? t('담당 없음')),
      loop: s.loop ? `${t(s.loop.when)} → ${t(loopTargetLabel(steps, i, s.loop))} (${task.loopCounts?.[s.id] ?? 0}/${s.loop.max})` : undefined,
      selected: selected === i,
      changed: changed.has(i),
    },
  }));
  items.push({
    id: `${task.id}-done`,
    kind: 'done',
    data: { icon: '✅', label: t(TEAMS[team].stepLabels.done), status: task.status === 'completed' ? 'done' : 'pending', owner: t('결과 보관') },
  });
  return items;
}

/** Fills rows left to right and wraps like text, so the journey stays readable at full size on narrow screens. */
function autoLayout(count: number, width: number, w = NODE_W, h = NODE_H, gx = GAP_X, gy = GAP_Y, maxRows = Infinity): Layout[string][] {
  const capacity = Math.max(1, Math.min(count, Math.floor((width - 2 * PAD + gx) / (w + gx))));
  // With a row limit, use as few columns as fit the rows (6 nodes in 3 rows stay 2 wide).
  const perRow = maxRows === Infinity ? capacity : Math.min(capacity, Math.max(Math.min(2, count), Math.ceil(count / maxRows)));
  const rowWidth = perRow * w + (perRow - 1) * gx;
  const left = Math.max(PAD, (width - rowWidth) / 2);
  return Array.from({ length: count }, (_, i) => ({
    x: left + (i % perRow) * (w + gx),
    y: PAD + 18 + Math.floor(i / perRow) * (h + gy),
  }));
}

const layoutKey = (taskId: string) => `workflow-layout:${taskId}`;
function loadLayout(taskId: string | undefined): Layout | null {
  if (!taskId) return null;
  try {
    return JSON.parse(localStorage.getItem(layoutKey(taskId)) ?? 'null');
  } catch {
    return null;
  }
}

const sizeOf = (node: Node, h = NODE_H) => ({
  w: node.measured?.width ?? node.width ?? NODE_W,
  h: node.measured?.height ?? node.height ?? h,
});

/** Picks the facing sides of two nodes so arrows stay short whatever the layout. */
function sides(a: Node, b: Node, h = NODE_H): [string, string] {
  const sa = sizeOf(a, h);
  const sb = sizeOf(b, h);
  const dx = b.position.x + sb.w / 2 - (a.position.x + sa.w / 2);
  const dy = b.position.y + sb.h / 2 - (a.position.y + sa.h / 2);
  if (Math.abs(dy) > (sa.h + sb.h) / 2) return dy > 0 ? ['b', 't'] : ['t', 'b'];
  return dx >= 0 ? ['r', 'l'] : ['l', 'r'];
}

function WorkflowInner({ task, agents, team, edit, dense, maxRows }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [editing, setEditing] = useState(false);
  const [layout, setLayout] = useState<Layout | null>(() => loadLayout(task?.id));
  const [draft, setDraft] = useState<WorkflowStepInput[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [saving, setSaving] = useState(false);
  const dirty = useRef(false);

  useEffect(() => {
    setLayout(loadLayout(task?.id));
    setEditing(false);
    setDraft(null);
    setSelected(null);
    setPicking(false);
    setChoosing(false);
  }, [task?.id]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const canEdit = Boolean(edit && task && PLAN_EDITABLE_STATUSES.includes(task.status));
  /** Anyone running the office may open a step; only an editable task applies changes to itself. */
  const canView = Boolean(edit && task);
  /** Stacked phone view: shorter rows so the whole journey fits without scrolling. */
  const nodeW = dense ? 104 : NODE_W;
  const nodeH = dense ? 82 : NODE_H;
  const gapX = dense ? 16 : GAP_X;
  const gapY = dense ? 32 : GAP_Y;
  const locked = task ? lockedStepCount(task) : 0;
  const canPickFromMode = Boolean(edit && task && (!canEdit || locked === 0));
  const saved = task ? inputsOf(task) : [];
  const steps = task ? shownSteps(task, draft, locked) : [];
  const inputs = draft ?? saved;
  const changed = new Set(draft ? draft.flatMap((s, i) => (JSON.stringify(s) === JSON.stringify(saved[i]) ? [] : [i])) : []);
  const draftError = draft ? validatePlan(draft, agents) : null;

  const items = flowItems(task, steps, agents, team, selected, changed);
  const structureKey = items.map((i) => i.id).join('|');
  const dataKey = JSON.stringify(items.map((i) => i.data));

  // React Flow keeps a node visible only while its `measured` size survives on the node object,
  // so rebuilt nodes are merged into the previous ones instead of replacing them.
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<StepData>>([]);
  useEffect(() => {
    if (!width) return;
    const auto = autoLayout(items.length, width, nodeW, nodeH, gapX, gapY, maxRows);
    setNodes((prev) =>
      items.map((item, i) => {
        const savedBox = draft || dense ? undefined : layout?.[item.id];
        const old = prev.find((n) => n.id === item.id);
        const box = savedBox ?? auto[i];
        return {
          ...old,
          id: item.id,
          type: 'step',
          position: { x: box.x, y: box.y },
          width: savedBox?.w ?? nodeW,
          height: savedBox?.h ?? (dense ? nodeH : undefined),
          data: { ...item.data, editing },
          draggable: editing,
        };
      }),
    );
    // `items` is rebuilt every render; the two keys track its content.
  }, [structureKey, dataKey, width, layout, editing, setNodes, Boolean(draft), dense, maxRows]);

  const handleNodesChange = useCallback(
    (changes: NodeChange<Node<StepData>>[]) => {
      onNodesChange(changes);
      if (changes.some((c) => (c.type === 'position' && c.dragging === false) || (c.type === 'dimensions' && c.resizing === false))) {
        dirty.current = true;
      }
    },
    [onNodesChange],
  );

  useEffect(() => {
    if (!dirty.current || !task || draft) return;
    dirty.current = false;
    const next: Layout = {};
    for (const node of nodes) {
      const { w, h } = sizeOf(node, nodeH);
      next[node.id] = { x: Math.round(node.position.x), y: Math.round(node.position.y), w: Math.round(w), h: node.height ? Math.round(h) : undefined };
    }
    localStorage.setItem(layoutKey(task.id), JSON.stringify(next));
    setLayout(next);
  }, [nodes, task, draft]);

  const resetLayout = () => {
    if (task) localStorage.removeItem(layoutKey(task.id));
    setLayout(null);
  };

  const change = (next: WorkflowStepInput[], select?: number | null) => {
    setDraft(next);
    if (select !== undefined) setSelected(select);
  };
  const revert = () => {
    setDraft(null);
    setSelected(null);
  };
  const save = async () => {
    if (!edit || !draft || draftError) return;
    setSaving(true);
    try {
      await edit.onSave(draft);
      setDraft(null);
      setSelected(null);
      setChoosing(false);
    } catch (e) {
      edit.onError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };
  const saveAsFlow = async () => {
    if (!edit || !task || !draft || draftError) return;
    const name = window.prompt(t('흐름 이름'), t(task.title))?.trim();
    if (!name) return;
    setSaving(true);
    try {
      await edit.onSaveFlow(flowFromPlan(draft, agents, { name, team }));
      setDraft(null);
      setSelected(null);
      setChoosing(false);
    } catch (e) {
      edit.onError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };
  /** A running task with unfinished repeat cycles: saving asks whether to switch now or after the cycles. */
  const pendingLoops = task?.plan.some((s) => s.loop && (task.loopCounts?.[s.id] ?? 0) < s.loop.max) ?? false;
  const needsChoice = canEdit && (task?.status === 'running' || task?.status === 'awaiting_help') && pendingLoops;
  const requestSave = () => {
    if (!draft || draftError || saving) return;
    if (needsChoice) {
      setSelected(null);
      setChoosing(true);
    } else {
      void save();
    }
  };
  useEffect(() => {
    if (!choosing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setChoosing(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [choosing]);

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges: Edge[] = [];
  items.slice(0, -1).forEach((item, i) => {
    const next = items[i + 1];
    const a = byId.get(item.id);
    const b = byId.get(next.id);
    const [out, inn] = a && b ? sides(a, b, nodeH) : ['r', 'l'];
    edges.push({
      id: `${item.id}->${next.id}`,
      source: item.id,
      sourceHandle: `${out}-out`,
      target: next.id,
      targetHandle: `${inn}-in`,
      type: out === 'r' || out === 'l' ? 'default' : 'smoothstep',
      animated: item.data.status === 'done' && (next.data.status === 'running' || next.data.status === 'awaiting'),
    });
  });
  steps.forEach((step, i) => {
    if (!step.loop || step.loop.to === i || !steps[step.loop.to]) return;
    const review = step.kind === 'review';
    const color = review ? '#c0392b' : '#8e44ad';
    edges.push({
      id: `${step.id}->loop`,
      source: step.id,
      sourceHandle: review ? 't-out' : 'b-out',
      target: steps[step.loop.to].id,
      targetHandle: review ? 't-in' : 'b-in',
      type: 'smoothstep',
      label: tpl(review ? '반려 {n}/{max}' : '조건 {n}/{max}', { n: task?.loopCounts?.[step.id] ?? 0, max: step.loop.max }),
      animated: step.status === 'rejected' || step.status === 'looped',
      style: { stroke: color, strokeDasharray: '6 4' },
      labelStyle: { fill: color, fontWeight: 700 },
    });
  });
  const draftStep = steps.find((s) => s.kind === 'draft');
  const approval = steps.at(-1);
  if (task && draftStep && approval) {
    edges.push({
      id: `${approval.id}->changes`,
      source: approval.id,
      sourceHandle: 'b-out',
      target: draftStep.id,
      targetHandle: 'b-in',
      type: 'smoothstep',
      label: tpl('수정 요청 {n}회', { n: task.userChangeRequests.length }),
      animated: approval.status === 'rejected',
      style: { stroke: '#7f8c8d', strokeDasharray: '2 4' },
      labelStyle: { fill: '#7f8c8d', fontWeight: 700 },
    });
  }

  let contentW = width;
  let contentH = 0;
  for (const node of nodes) {
    const { w, h } = sizeOf(node, nodeH);
    contentW = Math.max(contentW, node.position.x + w + PAD);
    contentH = Math.max(contentH, node.position.y + h + gapY / 2 + PAD);
  }

  return (
    <div className="workflow">
      <div className="workflow-head">
        <span>
          {t('업무 여정')} {task ? `· ${t(task.title)}` : ''}
        </span>
        {task && canPickFromMode ? (
          <button
            type="button"
            className={`pixel-btn small plan-mode plan-${task.planMode}`}
            title={canEdit ? t('클릭해서 업무 흐름을 변경해요.') : t('클릭해서 다음 업무에 사용할 흐름을 골라요.')}
            onClick={() => setPicking((value) => !value)}
          >
            {planModeLabel(task.planMode)} ▾
          </button>
        ) : task ? (
          <span className={`plan-mode plan-${task.planMode}`} title={task.planNote || undefined}>
            {planModeLabel(task.planMode)}
          </span>
        ) : null}
        {task && !draft && (
          <button
            className={`pixel-btn small ${editing ? 'primary' : ''}`}
            onClick={() => setEditing((v) => !v)}
            title={t('단계 상자를 끌어서 옮기고, 모서리를 끌어서 크기를 바꿔요')}
          >
            {editing ? t('✓ 배치 완료') : t('✋ 배치 조정')}
          </button>
        )}
        {task && layout && !draft && (
          <button className="pixel-btn small" onClick={resetLayout} title={t('화면 너비에 맞춰 자동으로 줄바꿈해요')}>
            {t('↺ 자동 배치')}
          </button>
        )}
        {canEdit && (
          <button
            className={`pixel-btn small ${picking ? 'primary' : ''}`}
            disabled={locked > 0}
            title={locked > 0 ? t('이미 시작한 업무라 흐름 전체를 바꿀 수는 없어요. 단계를 눌러 뒤의 단계를 고치세요.') : t('저장한 흐름·유형 기본·커뮤니티 흐름을 찾아서 바꿔요')}
            onClick={() => setPicking((v) => !v)}
          >
            📚 {t('흐름 고르기')}
          </button>
        )}
        {draft && canEdit && (
          <>
            <button className="pixel-btn small primary" disabled={saving || Boolean(draftError)} onClick={requestSave}>
              {saving ? t('저장 중…') : t('💾 변경 저장')}
            </button>
            <button className="pixel-btn small" disabled={saving} onClick={revert}>
              {t('↺ 되돌리기')}
            </button>
          </>
        )}
        {draft && edit && !canEdit && (
          <>
            {edit.canSaveFlows && (
              <button className="pixel-btn small primary" disabled={saving || Boolean(draftError)} onClick={() => void saveAsFlow()}>
                {saving ? t('저장 중…') : t('💾 다음 업무용 흐름으로 저장')}
              </button>
            )}
            <button className="pixel-btn small" disabled={saving} onClick={revert}>
              {t('↺ 되돌리기')}
            </button>
          </>
        )}
      </div>
      {task?.planNote && <div className="plan-note">🧭 {task.planNote}</div>}
      {edit && task && !draft && selected === null && (
        <div className="plan-note small muted">
          ✏️ {canEdit ? t('단계 상자를 누르면 담당 직원·역할·지시를 바꾸고, 단계를 더하거나 뺄 수 있어요.') : t('완료된 여정도 눌러서 보고, 다음 업무에서 쓸 흐름으로 저장할 수 있어요.')}
        </div>
      )}
      {draftError && <div className="plan-note small neg">⚠️ {draftError}</div>}
      <div className={`workflow-canvas ${editing ? 'editing' : 'locked'} ${canView ? 'clickable' : ''}${dense ? ' dense' : ''}`} ref={containerRef}>
        <div className="workflow-stage" style={{ width: contentW || '100%', height: Math.max(contentH, 100) }}>
          <ReactFlow
            nodes={nodes}
            onNodesChange={handleNodesChange}
            onNodeClick={(_, node) => {
              if (!canView) return;
              const index = steps.findIndex((s) => s.id === node.id);
              if (index >= 0) setSelected((current) => (current === index ? null : index));
            }}
            edges={edges}
            nodeTypes={nodeTypes}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            nodesDraggable={editing}
            nodesConnectable={false}
            elementsSelectable={editing}
            panOnDrag={false}
            zoomOnScroll={false}
            zoomOnPinch={false}
            zoomOnDoubleClick={false}
            preventScrolling={false}
            autoPanOnNodeDrag={false}
            proOptions={{ hideAttribution: true }}
          />
        </div>
      </div>
      {edit && task && selected !== null && (
        <StepInspector
          team={team}
          agents={agents}
          steps={inputs}
          index={selected}
          locked={canEdit ? locked : 0}
          template={canEdit ? undefined : task.status === 'completed' ? 'completed' : 'locked'}
          approval={
            task.status === 'awaiting_approval' && inputs[selected]?.kind === 'approval'
              ? { estimatedKrw: task.value?.estimatedKrw ?? null, onApprove: edit.onApprove, onRequestChanges: edit.onRequestChanges, onError: edit.onError }
              : undefined
          }
          saveLabel={canEdit ? t('💾 변경 저장') : t('💾 다음 업무용 흐름으로 저장')}
          showSave={canEdit || edit.canSaveFlows}
          saveDisabled={!draft || Boolean(draftError)}
          saving={saving}
          onSave={requestSave}
          onDiscard={revert}
          onChange={change}
          onClose={() => setSelected(null)}
        />
      )}
      {edit && task && choosing && draft &&
        createPortal(
          <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setChoosing(false)}>
            <div className="modal pixel-box" role="dialog" aria-modal="true">
              <div className="modal-head">
                <span>{t('🔁 실행 중인 업무에 저장')}</span>
                <button type="button" className="icon-btn" onClick={() => setChoosing(false)} aria-label={t('닫기')}>
                  ✕
                </button>
              </div>
              <p className="small muted">{t('아직 남은 반복이 있어요. 지금 바꾸면 다음 사이클부터 바로 바뀌고, 미뤄 두면 이번 실행은 그대로 두고 다음 업무부터 바꿔요.')}</p>
              <div className="row step-inspector-foot">
                <button type="button" className="pixel-btn small primary" disabled={saving} onClick={() => void save()}>
                  {t('▶ 즉시 다음 사이클부터 적용')}
                </button>
                {edit.canSaveFlows && (
                  <button type="button" className="pixel-btn small" disabled={saving} onClick={() => void saveAsFlow()}>
                    {t('⏳ 사이클이 끝난 뒤 다음 업무부터 적용')}
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
      {canPickFromMode && task && edit && picking && (
        <FlowPicker
          officeId={edit.officeId}
          team={team}
          agents={agents}
          flows={edit.flows}
          request={{ title: task.title, description: task.description, taskType: task.taskType }}
          canManage={edit.canManageFlows}
          onPick={(flow) => {
            change(flow.steps, null);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
          onError={edit.onError}
        />
      )}
    </div>
  );
}
