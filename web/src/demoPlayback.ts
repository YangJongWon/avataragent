import { useCallback, useEffect, useRef, useState } from 'react';
import { TEAMS } from '../../shared/teams.ts';
import type { Agent, AgentStatus, Expression, OfficeEvent, Snapshot, Task, WorkflowStep } from '../../shared/types.ts';
import { templatePlan } from '../../shared/workflow.ts';

interface Frame {
  agents: Agent[];
  task: Task;
}

type Listener = (event: OfficeEvent) => void;

const TASK_ID = 'demo_task';
const PAUSE_BETWEEN_ROUNDS_MS = 3000;

function initialFrame(snapshot: Snapshot, officeId: string): Frame | null {
  const office = snapshot.offices.find((o) => o.id === officeId);
  const agents = snapshot.agents.filter((a) => a.officeId === officeId);
  if (!office || agents.length === 0) return null;
  const team = TEAMS[office.team];
  const taskType = team.taskTypes[0];
  const plan: WorkflowStep[] = templatePlan(office.team, taskType.id, agents).map((s, i) => ({ ...s, id: `demo_step_${i}`, status: 'pending' }));
  const now = new Date().toISOString();
  return {
    agents: agents.map((a) => ({ ...a, status: 'idle', expression: 'normal', activity: '대기 중이에요.', paused: false })),
    task: {
      id: TASK_ID,
      officeId,
      title: `[데모] ${taskType.label}`,
      description: '사용법 데모용 가짜 업무예요. 실제로 저장되거나 AI를 부르지 않아요.',
      taskType: taskType.id,
      status: 'queued',
      plan,
      planMode: 'template',
      planNote: '',
      currentStepId: null,
      inputText: '',
      inputIds: [],
      artifacts: [],
      reviews: [],
      help: null,
      clarifications: [],
      userChangeRequests: [],
      proposal: null,
      costKrw: 0,
      costByAgent: {},
      value: null,
      failureReason: null,
      createdAt: now,
      completedAt: null,
    },
  };
}

/** One scripted round of a task going through the office, mirroring what the server emits. */
function script(frame: Frame) {
  const manager = frame.agents.find((a) => a.role === 'manager') ?? frame.agents[0];
  const plan = frame.task.plan;
  const indexOf = (kind: WorkflowStep['kind']) => plan.findIndex((s) => s.kind === kind);
  const stepAgent = (i: number) => frame.agents.find((a) => a.id === plan[i]?.agentId) ?? manager;

  type Beat = { wait: number; run: (f: Frame, emit: (type: string, agentId: string | undefined, payload?: Record<string, unknown>) => void) => void };
  const beats: Beat[] = [];
  const set = (f: Frame, id: string, status: AgentStatus, expression: Expression, activity: string) => {
    f.agents = f.agents.map((a) => (a.id === id ? { ...a, status, expression, activity } : a));
  };
  const allIdle = (f: Frame, expression: Expression = 'normal') => {
    f.agents = f.agents.map((a) => ({ ...a, status: 'idle', expression, activity: expression === 'celebrate' ? '업무 완료! 수고했어요.' : '대기 중이에요.' }));
  };
  const step = (f: Frame, i: number, status: WorkflowStep['status']) => {
    f.task = { ...f.task, plan: f.task.plan.map((s, j) => (j === i ? { ...s, status } : s)), currentStepId: status === 'running' || status === 'awaiting' ? plan[i].id : f.task.currentStepId };
  };
  const spend = (f: Frame, agent: Agent, amount: number, emit: Parameters<Beat['run']>[1]) => {
    f.task = { ...f.task, costKrw: f.task.costKrw + amount, costByAgent: { ...f.task.costByAgent, [agent.id]: (f.task.costByAgent[agent.id] ?? 0) + amount } };
    emit('cost.recorded', agent.id, { amountKrw: amount });
  };
  const handOff = (from: Agent, to: Agent, emit: Parameters<Beat['run']>[1]) => emit('task.handed_off', from.id, { from: from.id, to: to.id });

  beats.push({
    wait: 600,
    run: (f, emit) => {
      f.task = { ...f.task, status: 'running' };
      step(f, 0, 'running');
      set(f, manager.id, 'working', 'focus', '업무를 접수하고 단계를 나누고 있어요.');
      emit('task.created', manager.id, { title: f.task.title });
      emit('queue.started', manager.id, { title: f.task.title });
    },
  });

  let prev = manager;
  for (let i = 1; i < plan.length; i++) {
    const kind = plan[i].kind;
    if (kind === 'approval') break;
    const agent = stepAgent(i);
    const from = prev;
    beats.push({
      wait: 3000,
      run: (f, emit) => {
        step(f, i - 1, 'done');
        set(f, from.id, 'idle', 'smile', '넘겨줬어요.');
        spend(f, from, 40 + i * 15, emit);
        handOff(from, agent, emit);
        step(f, i, 'running');
        const doing = kind === 'research' ? '자료를 찾고 있어요.' : kind === 'draft' ? '결과물을 쓰고 있어요.' : '결과물을 검토하고 있어요.';
        set(f, agent.id, 'working', 'focus', doing);
      },
    });
    if (kind === 'research') {
      beats.push({ wait: 800, run: (_f, emit) => emit('tool.started', agent.id, { tool: 'research' }) });
      beats.push({ wait: 3200, run: (_f, emit) => emit('tool.completed', agent.id, { tool: 'research' }) });
    }
    if (kind === 'draft') {
      beats.push({
        wait: 2000,
        run: (f) => {
          f.task = {
            ...f.task,
            status: 'awaiting_help',
            help: {
              id: 'demo_help',
              agentId: agent.id,
              question: '결과물을 표 위주로 정리할까요, 글 위주로 정리할까요?',
              options: ['표 위주', '글 위주'],
              assumption: '표 위주로 정리할게요.',
              deadline: Date.now() + 60_000,
            },
          };
          set(f, agent.id, 'help_requested', 'troubled', '표 위주로 할지 글 위주로 할지 모르겠어요. 도와주실 수 있을까요?');
        },
      });
      beats.push({
        wait: 4000,
        run: (f, emit) => {
          f.task = { ...f.task, status: 'running', help: null, clarifications: ['표 위주'] };
          set(f, agent.id, 'working', 'thanks', '답을 받았어요! 표 위주로 쓰고 있어요.');
          emit('agent.help_received', agent.id, { answer: '표 위주' });
        },
      });
      beats.push({
        wait: 2500,
        run: (f) => {
          f.task = {
            ...f.task,
            artifacts: [
              ...f.task.artifacts,
              {
                id: `demo_draft_${f.task.artifacts.length + 1}`,
                agentId: agent.id,
                stepId: plan[i].id,
                kind: 'draft',
                title: f.task.title,
                content: '## 요약\n- 데모용 결과물이에요.\n- 실제 업무에서는 여기에 직원이 쓴 보고서가 들어가요.',
                version: f.task.artifacts.length + 1,
                createdAt: new Date().toISOString(),
              },
            ],
          };
          set(f, agent.id, 'working', 'smile', '초안을 다 썼어요.');
        },
      });
    }
    if (kind === 'review') {
      const draftIndex = indexOf('draft');
      const draftAgent = stepAgent(draftIndex);
      beats.push({
        wait: 2500,
        run: (f, emit) => {
          step(f, i, 'looped');
          step(f, draftIndex, 'running');
          set(f, agent.id, 'idle', 'normal', '수정을 요청했어요.');
          set(f, draftAgent.id, 'working', 'sweat', '검토 의견대로 고치고 있어요.');
          f.task = { ...f.task, reviews: [...f.task.reviews, { agentId: agent.id, approved: false, score: 62, reason: '근거가 조금 부족해요.', at: new Date().toISOString() }] };
          emit('review.rejected', agent.id, { returnTo: draftAgent.id, score: 62 });
        },
      });
      beats.push({
        wait: 3000,
        run: (f, emit) => {
          step(f, draftIndex, 'done');
          step(f, i, 'running');
          set(f, draftAgent.id, 'idle', 'smile', '고친 결과물을 넘겼어요.');
          set(f, agent.id, 'working', 'focus', '고친 결과물을 다시 보고 있어요.');
          handOff(draftAgent, agent, emit);
        },
      });
      beats.push({
        wait: 2500,
        run: (f, emit) => {
          f.task = { ...f.task, reviews: [...f.task.reviews, { agentId: agent.id, approved: true, score: 88, reason: '좋아요.', at: new Date().toISOString() }] };
          set(f, agent.id, 'working', 'smile', '통과! 팀장에게 넘길게요.');
          emit('review.approved', agent.id, { score: 88 });
        },
      });
    }
    prev = agent;
  }

  const approvalIndex = indexOf('approval');
  const last = prev;
  beats.push({
    wait: 2000,
    run: (f, emit) => {
      if (approvalIndex > 0) step(f, approvalIndex - 1, 'done');
      if (approvalIndex >= 0) step(f, approvalIndex, 'awaiting');
      spend(f, last, 90, emit);
      allIdle(f);
      set(f, manager.id, 'awaiting_approval', 'normal', '결과물을 올렸어요. 사용자 승인을 기다리고 있어요.');
      f.task = { ...f.task, status: 'awaiting_approval' };
      emit('approval.requested', manager.id);
    },
  });
  beats.push({
    wait: 4500,
    run: (f, emit) => {
      if (approvalIndex >= 0) step(f, approvalIndex, 'done');
      const value = 30000;
      f.task = {
        ...f.task,
        status: 'completed',
        currentStepId: null,
        completedAt: new Date().toISOString(),
        value: { baseKrw: value, qualityMultiplier: 1, userMultiplier: 1, estimatedKrw: value, recognizedKrw: value, userEdited: false },
      };
      allIdle(f, 'celebrate');
      emit('approval.granted', manager.id);
      emit('value.recognized', manager.id, { amountKrw: value });
      emit('task.completed', undefined, { title: f.task.title });
    },
  });
  beats.push({ wait: 4000, run: (f) => allIdle(f) });
  return beats;
}

/**
 * Plays a fake task in the current office while the usage demo is open.
 * Nothing is sent to the server; the scene only sees the overridden agents, task and events.
 */
export function useDemoPlayback(active: boolean, snapshot: Snapshot | null, officeId: string) {
  const [frame, setFrame] = useState<Frame | null>(null);
  const listeners = useRef(new Set<Listener>());
  const seq = useRef(0);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  useEffect(() => {
    if (!active || !snapshotRef.current) {
      setFrame(null);
      return;
    }
    const base = initialFrame(snapshotRef.current, officeId);
    if (!base) return;
    let current: Frame = base;
    let timer = 0;
    let index = 0;
    let beats = script(current);
    const emit = (type: string, agentId: string | undefined, payload: Record<string, unknown> = {}) => {
      const event: OfficeEvent = {
        eventId: `demo_${++seq.current}`,
        seq: -seq.current,
        type,
        timestamp: new Date().toISOString(),
        projectId: 'demo',
        taskId: TASK_ID,
        agentId,
        payload,
      };
      for (const listener of listeners.current) listener(event);
    };
    const next = () => {
      if (index >= beats.length) {
        current = (snapshotRef.current && initialFrame(snapshotRef.current, officeId)) ?? base;
        beats = script(current);
        index = 0;
        setFrame(current);
        timer = window.setTimeout(next, PAUSE_BETWEEN_ROUNDS_MS);
        return;
      }
      const beat = beats[index++];
      const f = { ...current };
      beat.run(f, emit);
      current = f;
      setFrame(current);
      timer = window.setTimeout(next, beats[index]?.wait ?? 0);
    };
    setFrame(current);
    timer = window.setTimeout(next, beats[0].wait);
    return () => window.clearTimeout(timer);
  }, [active, officeId]);

  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  return { agents: frame?.agents ?? null, task: frame?.task ?? null, subscribe };
}
