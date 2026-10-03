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
import { TEAMS } from '../../../shared/teams.ts';
import type { Agent, StepKind, StepStatus, Task, TeamId } from '../../../shared/types.ts';
import { loopTargetLabel, PLAN_MODE_LABEL, STEP_KIND } from '../../../shared/workflow.ts';

const STATUS_VIEW: Record<StepStatus, { icon: string; text: string; cls: string }> = {
  pending: { icon: '○', text: '대기', cls: 'st-pending' },
  running: { icon: '●', text: '작업 중', cls: 'st-running' },
  done: { icon: '✓', text: '완료', cls: 'st-done' },
  error: { icon: '✕', text: '오류', cls: 'st-error' },
  awaiting: { icon: '!', text: '사용자 대기', cls: 'st-awaiting' },
  rejected: { icon: '↩', text: '반려', cls: 'st-rejected' },
  looped: { icon: '🔁', text: '되돌아감', cls: 'st-rejected' },
};

const NODE_W = 124;
const NODE_H = 80;
const GAP_X = 24;
const GAP_Y = 52;
const PAD = 8;

type StepData = { icon: string; label: string; status: StepStatus; owner: string; loop?: string; editing?: boolean };

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
      <div className={`flow-node ${view.cls}`}>
        <div className="flow-title">
          {data.icon} {data.label}
        </div>
        <div className="flow-owner">{data.owner}</div>
        <div className="flow-status">
          {view.icon} {view.text}
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

type Props = { task: Task | undefined; agents: Agent[]; team: TeamId; onEdit?: () => void };

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

function flowItems(task: Task | undefined, agents: Agent[], team: TeamId): FlowItem[] {
  if (!task) return [];
  const steps: FlowItem[] = task.plan.map((s, i) => ({
    id: s.id,
    kind: s.kind,
    data: {
      icon: STEP_KIND[s.kind].icon,
      label: s.label,
      status: s.status,
      owner: s.kind === 'approval' ? '사용자' : (agents.find((a) => a.id === s.agentId)?.name ?? '담당 없음'),
      loop: s.loop
        ? `${s.loop.when} → ${loopTargetLabel(task.plan, i, s.loop)} (${task.loopCounts?.[s.id] ?? 0}/${s.loop.max})`
        : undefined,
    },
  }));
  steps.push({
    id: `${task.id}-done`,
    kind: 'done',
    data: { icon: '✅', label: TEAMS[team].stepLabels.done, status: task.status === 'completed' ? 'done' : 'pending', owner: '결과 보관' },
  });
  return steps;
}

/** Fills rows left to right and wraps like text, so the journey stays readable at full size on narrow screens. */
function autoLayout(count: number, width: number): Layout[string][] {
  const perRow = Math.max(1, Math.min(count, Math.floor((width - 2 * PAD + GAP_X) / (NODE_W + GAP_X))));
  const rowWidth = perRow * NODE_W + (perRow - 1) * GAP_X;
  const left = Math.max(PAD, (width - rowWidth) / 2);
  return Array.from({ length: count }, (_, i) => ({
    x: left + (i % perRow) * (NODE_W + GAP_X),
    y: PAD + 18 + Math.floor(i / perRow) * (NODE_H + GAP_Y),
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

const sizeOf = (node: Node) => ({
  w: node.measured?.width ?? node.width ?? NODE_W,
  h: node.measured?.height ?? node.height ?? NODE_H,
});

/** Picks the facing sides of two nodes so arrows stay short whatever the layout. */
function sides(a: Node, b: Node): [string, string] {
  const sa = sizeOf(a);
  const sb = sizeOf(b);
  const dx = b.position.x + sb.w / 2 - (a.position.x + sa.w / 2);
  const dy = b.position.y + sb.h / 2 - (a.position.y + sa.h / 2);
  if (Math.abs(dy) > (sa.h + sb.h) / 2) return dy > 0 ? ['b', 't'] : ['t', 'b'];
  return dx >= 0 ? ['r', 'l'] : ['l', 'r'];
}

function WorkflowInner({ task, agents, team, onEdit }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [editing, setEditing] = useState(false);
  const [layout, setLayout] = useState<Layout | null>(() => loadLayout(task?.id));
  const dirty = useRef(false);

  useEffect(() => {
    setLayout(loadLayout(task?.id));
    setEditing(false);
  }, [task?.id]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const items = flowItems(task, agents, team);
  const structureKey = items.map((i) => i.id).join('|');
  const dataKey = JSON.stringify(items.map((i) => i.data));

  // React Flow keeps a node visible only while its `measured` size survives on the node object,
  // so rebuilt nodes are merged into the previous ones instead of replacing them.
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<StepData>>([]);
  useEffect(() => {
    if (!width) return;
    const fresh = flowItems(task, agents, team);
    const auto = autoLayout(fresh.length, width);
    setNodes((prev) =>
      fresh.map((item, i) => {
        const saved = layout?.[item.id];
        const old = prev.find((n) => n.id === item.id);
        const box = saved ?? auto[i];
        return {
          ...old,
          id: item.id,
          type: 'step',
          position: { x: box.x, y: box.y },
          width: saved?.w ?? NODE_W,
          height: saved?.h,
          data: { ...item.data, editing },
          draggable: editing,
        };
      }),
    );
  }, [structureKey, dataKey, width, layout, editing, setNodes]);

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
    if (!dirty.current || !task) return;
    dirty.current = false;
    const next: Layout = {};
    for (const node of nodes) {
      const { w, h } = sizeOf(node);
      next[node.id] = { x: Math.round(node.position.x), y: Math.round(node.position.y), w: Math.round(w), h: node.height ? Math.round(h) : undefined };
    }
    localStorage.setItem(layoutKey(task.id), JSON.stringify(next));
    setLayout(next);
  }, [nodes, task]);

  const resetLayout = () => {
    if (task) localStorage.removeItem(layoutKey(task.id));
    setLayout(null);
  };

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges: Edge[] = [];
  items.slice(0, -1).forEach((item, i) => {
    const next = items[i + 1];
    const a = byId.get(item.id);
    const b = byId.get(next.id);
    const [out, inn] = a && b ? sides(a, b) : ['r', 'l'];
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
  task?.plan.forEach((step, i) => {
    if (!step.loop || step.loop.to === i) return;
    const review = step.kind === 'review';
    const color = review ? '#c0392b' : '#8e44ad';
    edges.push({
      id: `${step.id}->loop`,
      source: step.id,
      sourceHandle: review ? 't-out' : 'b-out',
      target: task.plan[step.loop.to].id,
      targetHandle: review ? 't-in' : 'b-in',
      type: 'smoothstep',
      label: `${review ? '반려' : '조건'} ${task.loopCounts?.[step.id] ?? 0}/${step.loop.max}`,
      animated: step.status === 'rejected' || step.status === 'looped',
      style: { stroke: color, strokeDasharray: '6 4' },
      labelStyle: { fill: color, fontWeight: 700 },
    });
  });
  const draft = task?.plan.find((s) => s.kind === 'draft');
  const approval = task?.plan.at(-1);
  if (task && draft && approval) {
    edges.push({
      id: `${approval.id}->changes`,
      source: approval.id,
      sourceHandle: 'b-out',
      target: draft.id,
      targetHandle: 'b-in',
      type: 'smoothstep',
      label: `수정 요청 ${task.userChangeRequests.length}회`,
      animated: approval.status === 'rejected',
      style: { stroke: '#7f8c8d', strokeDasharray: '2 4' },
      labelStyle: { fill: '#7f8c8d', fontWeight: 700 },
    });
  }

  let contentW = width;
  let contentH = 0;
  for (const node of nodes) {
    const { w, h } = sizeOf(node);
    contentW = Math.max(contentW, node.position.x + w + PAD);
    contentH = Math.max(contentH, node.position.y + h + GAP_Y / 2 + PAD);
  }

  return (
    <div className="workflow">
      <div className="workflow-head">
        <span>업무 여정 {task ? `· ${task.title}` : ''}</span>
        {task && (
          <span className={`plan-mode plan-${task.planMode}`} title={task.planNote || undefined}>
            {PLAN_MODE_LABEL[task.planMode]}
          </span>
        )}
        {task && (
          <button
            className={`pixel-btn small ${editing ? 'primary' : ''}`}
            onClick={() => setEditing((v) => !v)}
            title="단계 상자를 끌어서 옮기고, 모서리를 끌어서 크기를 바꿔요"
          >
            {editing ? '✓ 배치 완료' : '✋ 배치 조정'}
          </button>
        )}
        {task && layout && (
          <button className="pixel-btn small" onClick={resetLayout} title="화면 너비에 맞춰 자동으로 줄바꿈해요">
            ↺ 자동 배치
          </button>
        )}
        {onEdit && (
          <button className="pixel-btn small" onClick={onEdit}>
            ✏️ 여정 편집
          </button>
        )}
      </div>
      {task?.planNote && <div className="plan-note">🧭 {task.planNote}</div>}
      <div className={`workflow-canvas ${editing ? 'editing' : 'locked'}`} ref={containerRef}>
        <div className="workflow-stage" style={{ width: contentW || '100%', height: Math.max(contentH, 100) }}>
          <ReactFlow
            nodes={nodes}
            onNodesChange={handleNodesChange}
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
    </div>
  );
}
