import { useCallback, useEffect, useRef, useState } from 'react';
import { setCatalog, type ApiKind, type Company, type ModelEntry } from '../../shared/models.ts';
import type {
  AiMode,
  Interests,
  Office,
  OfficeEvent,
  PlanMode,
  ServerMessage,
  ShareLink,
  ShareRole,
  Skin,
  Snapshot,
  TeamId,
  WorkflowStepInput,
} from '../../shared/types.ts';

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) location.assign('/login');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `요청 실패 (${res.status})`);
  return data as T;
}

export const api = {
  createTask: (input: {
    officeId: string;
    title?: string;
    description?: string;
    taskType?: string;
    planMode?: PlanMode;
    steps?: WorkflowStepInput[];
    planNote?: string;
  }) => call('POST', '/api/tasks', input),
  previewPlan: (officeId: string, input: { title: string; description: string; taskType: string }) =>
    call<{ steps: WorkflowStepInput[]; note: string }>('POST', `/api/offices/${officeId}/plan-preview`, input),
  updatePlan: (taskId: string, steps: WorkflowStepInput[]) => call('PUT', `/api/tasks/${taskId}/plan`, { steps }),
  createShare: (input: { name: string; role: ShareRole; officeIds: string[] | 'all'; expiresInDays: number }) =>
    call<ShareLink>('POST', '/api/shares', input),
  deleteShare: (shareId: string) => call('DELETE', `/api/shares/${shareId}`),
  updateOffice: (officeId: string, patch: { autoRun?: boolean; budgetKrw?: number | null }) =>
    call('PUT', `/api/offices/${officeId}`, patch),
  createOffice: (input: { team: TeamId; name?: string }) => call<Office>('POST', '/api/offices', input),
  deleteOffice: (officeId: string) => call('DELETE', `/api/offices/${officeId}`),
  simulateMail: () => call('POST', '/api/sim/mail'),
  simulateInquiry: () => call('POST', '/api/sim/inquiry'),
  updateInterests: (patch: Partial<Interests>) => call('PUT', '/api/interests', patch),
  cancelTask: (taskId: string) => call('POST', `/api/tasks/${taskId}/cancel`),
  answerHelp: (taskId: string, answer: string | null) => call('POST', `/api/tasks/${taskId}/help`, { answer }),
  approve: (taskId: string, valueKrw?: number) => call('POST', `/api/tasks/${taskId}/approve`, { valueKrw }),
  requestChanges: (taskId: string, comment: string) =>
    call('POST', `/api/tasks/${taskId}/request-changes`, { comment }),
  updateAgent: (agentId: string, patch: { name?: string; rules?: string; model?: string; skin?: Skin }) =>
    call('PUT', `/api/agents/${agentId}`, patch),
  setPaused: (agentId: string, paused: boolean) => call('POST', `/api/agents/${agentId}/pause`, { paused }),
  updateBudget: (patch: { monthlyKrw?: number; hourlyRateKrw?: number }) => call('PUT', '/api/budget', patch),
  setAiMode: (mode: AiMode) => call('PUT', '/api/ai-mode', { mode }),
  createCompany: (input: CompanyInput & { apiKey?: string }) => call<Company>('POST', '/api/companies', input),
  updateCompany: (id: string, patch: Partial<CompanyInput> & { apiKey?: string | null }) => call<Company>('PUT', `/api/companies/${id}`, patch),
  deleteCompany: (id: string) => call('DELETE', `/api/companies/${id}`),
  discoverModels: (input: { companyId?: string; api?: ApiKind; baseUrl?: string; apiKey?: string }) =>
    call<{ models: string[] }>('POST', '/api/models/discover', input),
  createModel: (input: ModelInput) => call<ModelEntry>('POST', '/api/models', input),
  updateModel: (id: string, patch: Partial<ModelInput>) => call<ModelEntry>('PUT', `/api/models/${id}`, patch),
  deleteModel: (id: string) => call('DELETE', `/api/models/${id}`),
};

export type CompanyInput = Pick<Company, 'name' | 'hat' | 'color' | 'api' | 'baseUrl'>;
export type ModelInput = Omit<ModelEntry, 'id' | 'builtin'>;

type EventListener = (event: OfficeEvent) => void;

export function useOffice() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [events, setEvents] = useState<OfficeEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const listeners = useRef(new Set<EventListener>());

  useEffect(() => {
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let closed = false;

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      socket = new WebSocket(`${proto}://${location.host}/ws`);
      socket.onopen = () => {
        setConnected(true);
        setEvents([]);
      };
      socket.onclose = () => {
        setConnected(false);
        if (closed) return;
        retry = setTimeout(() => {
          fetch('/api/state', { method: 'HEAD' })
            .then((res) => (res.status === 401 ? location.assign('/login') : connect()))
            .catch(connect);
        }, 1500);
      };
      socket.onmessage = (msg) => {
        const message = JSON.parse(msg.data) as ServerMessage;
        if (message.kind === 'snapshot') {
          setCatalog(message.data.companies, message.data.models);
          setSnapshot(message.data);
          return;
        }
        setEvents((prev) => {
          if (prev.some((e) => e.eventId === message.data.eventId)) return prev;
          return [...prev, message.data].slice(-400);
        });
        if (!message.replay) for (const listener of listeners.current) listener(message.data);
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      socket?.close();
    };
  }, []);

  const onEvent = useCallback((listener: EventListener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  return { snapshot, events, connected, onEvent };
}
