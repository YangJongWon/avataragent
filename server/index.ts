import { createServer, type IncomingMessage } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import { can, type Action } from '../shared/access.ts';
import {
  API_KINDS,
  isApiKind,
  isColor,
  isHatShape,
  isModelId,
  type Company,
  type ModelEntry,
  type Tier,
} from '../shared/models.ts';
import { isSkin } from '../shared/skins.ts';
import { TEAMS } from '../shared/teams.ts';
import type { AiMode, ServerMessage, ShareLink, ShareRole, TeamId, Viewer } from '../shared/types.ts';
import { canSeeEvent, ForbiddenError, snapshotFor } from './access.ts';
import { listModels } from './ai.ts';
import { authEnabled, authRouter, stillValid, viewerOf } from './auth.ts';
import { config } from './config.ts';
import { simulateInquiry, simulateMail } from './orchestrator.ts';
import { apiKeyFor, setApiKey } from './secrets.ts';
import { store } from './store.ts';
import { toStepInputs, workflowRuntime } from './workflow-runtime.ts';

const app = express();
app.set('trust proxy', 'loopback');
app.use(authRouter());
app.use(express.json({ limit: '1mb' }));

const viewerOfRes = (res: Response) => res.locals.viewer as Viewer;

function guard(res: Response, action: Action, officeId?: string) {
  if (!can(viewerOfRes(res), action, officeId)) {
    throw new ForbiddenError(action === 'owner' ? '사무실 주인만 할 수 있어요.' : '이 공유 링크에는 그 권한이 없어요.');
  }
}

const officeOfTask = (taskId: string) => store.task(taskId).officeId;
const officeOfAgent = (agentId: string) => store.agent(agentId).officeId;
const teamOffice = (res: Response, team: TeamId) =>
  store.data.offices.find((o) => o.team === team && can(viewerOfRes(res), 'manage', o.id))?.id;

app.get('/api/state', (_req, res) => {
  res.json(snapshotFor(viewerOfRes(res)));
});

app.post('/api/tasks', async (req, res) => {
  const { officeId, title, description, taskType, planMode, steps, planNote } = req.body ?? {};
  if (typeof officeId !== 'string') throw new Error('사무실을 선택해 주세요.');
  guard(res, 'operate', officeId);
  res.json(
    await workflowRuntime.createTask({
      officeId,
      title: typeof title === 'string' ? title : undefined,
      description: typeof description === 'string' ? description : undefined,
      taskType: typeof taskType === 'string' ? taskType : undefined,
      planMode: planMode === 'custom' || planMode === 'ai' ? planMode : 'template',
      steps: planMode === 'custom' ? toStepInputs(steps) : undefined,
      planNote: typeof planNote === 'string' ? planNote : undefined,
    }),
  );
});

app.post('/api/offices/:id/plan-preview', async (req, res) => {
  guard(res, 'operate', req.params.id);
  const { title, description, taskType } = req.body ?? {};
  res.json(
    await workflowRuntime.designPlan({
      officeId: req.params.id,
      title: String(title ?? ''),
      description: String(description ?? ''),
      taskType: String(taskType ?? ''),
    }),
  );
});

app.put('/api/tasks/:id/plan', async (req, res) => {
  guard(res, 'operate', officeOfTask(req.params.id));
  res.json(await workflowRuntime.updatePlan(req.params.id, toStepInputs(req.body?.steps)));
});

app.post('/api/offices', (req, res) => {
  guard(res, 'owner');
  const { team, name } = req.body ?? {};
  if (typeof team !== 'string' || !(team in TEAMS)) throw new Error('팀 종류를 선택해 주세요.');
  const meta = TEAMS[team as TeamId];
  const sameTeam = store.data.offices.filter((o) => o.team === team).length;
  const title = typeof name === 'string' && name.trim() ? name.trim().slice(0, 20) : `${meta.name} ${sameTeam + 1}`;
  const office = store.addOffice(team as TeamId, title);
  store.emit('office.created', { payload: { officeId: office.id, team, name: office.name } });
  res.json(office);
});

app.delete('/api/offices/:id', (req, res) => {
  guard(res, 'owner');
  const office = store.office(req.params.id);
  if (store.data.tasks.some((t) => t.officeId === office.id && ['running', 'awaiting_help', 'awaiting_approval'].includes(t.status))) {
    throw new Error('진행 중인 업무가 있어서 닫을 수 없어요.');
  }
  store.removeOffice(office.id);
  store.emit('office.removed', { payload: { name: office.name } });
  res.json({ ok: true });
});

app.put('/api/offices/:id', async (req, res) => {
  guard(res, 'manage', req.params.id);
  const { autoRun, budgetKrw } = req.body ?? {};
  if (budgetKrw !== undefined) guard(res, 'owner');
  store.updateOffice(req.params.id, (o) => {
    if (typeof autoRun === 'boolean') o.autoRun = autoRun;
    if (budgetKrw === null) o.budgetKrw = null;
    else if (typeof budgetKrw === 'number' && budgetKrw >= 0) o.budgetKrw = Math.round(budgetKrw);
  });
  store.emit('office.updated', { payload: { officeId: req.params.id, autoRun, budgetKrw } });
  await workflowRuntime.tick();
  res.json(store.office(req.params.id));
});

app.post('/api/sim/mail', async (_req, res) => {
  if (!teamOffice(res, 'hr')) guard(res, 'owner');
  const mail = simulateMail();
  await workflowRuntime.tick();
  res.json(mail);
});

app.post('/api/sim/inquiry', async (_req, res) => {
  if (!teamOffice(res, 'support')) guard(res, 'owner');
  const inquiry = simulateInquiry();
  await workflowRuntime.tick();
  res.json(inquiry);
});

app.put('/api/interests', (req, res) => {
  if (!teamOffice(res, 'welfare')) guard(res, 'owner');
  const { keywords, region, note } = req.body ?? {};
  store.mutate((s) => {
    if (Array.isArray(keywords)) {
      s.interests.keywords = keywords.map((k) => String(k).trim()).filter(Boolean).slice(0, 10);
    }
    if (typeof region === 'string') s.interests.region = region.trim().slice(0, 30);
    if (typeof note === 'string') s.interests.note = note.trim().slice(0, 300);
  });
  res.json(store.data.interests);
});

app.post('/api/tasks/:id/cancel', async (req, res) => {
  guard(res, 'operate', officeOfTask(req.params.id));
  await workflowRuntime.cancelTask(req.params.id);
  res.json({ ok: true });
});

app.post('/api/tasks/:id/help', async (req, res) => {
  guard(res, 'operate', officeOfTask(req.params.id));
  const answer = req.body?.answer;
  await workflowRuntime.answerHelp(req.params.id, typeof answer === 'string' && answer.trim() ? answer : null);
  res.json({ ok: true });
});

app.post('/api/tasks/:id/approve', async (req, res) => {
  guard(res, 'operate', officeOfTask(req.params.id));
  const valueKrw = req.body?.valueKrw;
  await workflowRuntime.approve(req.params.id, typeof valueKrw === 'number' && Number.isFinite(valueKrw) ? valueKrw : undefined);
  res.json({ ok: true });
});

app.post('/api/tasks/:id/request-changes', async (req, res) => {
  guard(res, 'operate', officeOfTask(req.params.id));
  await workflowRuntime.requestChanges(req.params.id, String(req.body?.comment ?? ''));
  res.json({ ok: true });
});

app.put('/api/agents/:id', (req, res) => {
  guard(res, 'manage', officeOfAgent(req.params.id));
  const { name, rules, model, skin } = req.body ?? {};
  const before = store.agent(req.params.id);
  const patch: Record<string, unknown> = {};
  if (typeof name === 'string' && name.trim()) patch.name = name.trim().slice(0, 20);
  if (typeof model === 'string') {
    if (!isModelId(model)) throw new Error('알 수 없는 모델입니다.');
    patch.model = model;
  }
  if (skin !== undefined) {
    if (!isSkin(skin)) throw new Error('알 수 없는 스킨입니다.');
    patch.skin = skin;
  }
  if (typeof rules === 'string' && rules !== before.rules) {
    store.emit('rule.changed', {
      agentId: before.id,
      payload: { scope: 'personal', before: before.rules, after: rules },
    });
    patch.rules = rules;
  }
  store.updateAgent(req.params.id, patch);
  res.json(store.agent(req.params.id));
});

app.post('/api/agents/:id/pause', async (req, res) => {
  guard(res, 'manage', officeOfAgent(req.params.id));
  await workflowRuntime.pauseAgent(req.params.id, Boolean(req.body?.paused));
  res.json({ ok: true });
});

app.put('/api/budget', (req, res) => {
  guard(res, 'owner');
  const { monthlyKrw, hourlyRateKrw } = req.body ?? {};
  store.updateBudget((b) => {
    if (typeof monthlyKrw === 'number' && monthlyKrw >= 0) {
      b.monthlyKrw = Math.round(monthlyKrw);
      b.warned80 = b.spentKrw >= b.monthlyKrw * 0.8;
    }
    if (typeof hourlyRateKrw === 'number' && hourlyRateKrw >= 0) b.hourlyRateKrw = Math.round(hourlyRateKrw);
  });
  res.json(store.budget);
});

const AI_MODES: AiMode[] = ['env', 'mock', 'agents'];
const MAX_COMPANIES = 20;
const MAX_MODELS = 80;

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const companyById = (id: string) => {
  const company = store.data.companies.find((c) => c.id === id);
  if (!company) throw new Error('알 수 없는 회사예요.');
  return company;
};
const modelsInUse = (ids: string[]) => store.data.agents.filter((a) => ids.includes(a.model));

function checkedBaseUrl(raw: unknown) {
  const url = text(raw, 300).replace(/\/+$/, '');
  if (!url) return '';
  if (!/^https?:\/\/[^\s/]+/i.test(url)) throw new Error('API 주소는 http:// 또는 https:// 로 시작해야 해요.');
  return url;
}

function applyCompany(company: Company, body: Record<string, unknown>) {
  if (body.name !== undefined) company.name = text(body.name, 20) || company.name;
  if (body.hat !== undefined) {
    if (!isHatShape(body.hat)) throw new Error('모자 모양을 골라 주세요.');
    company.hat = body.hat;
  }
  if (body.color !== undefined) {
    if (!isColor(body.color)) throw new Error('모자 색은 #RRGGBB 형식이어야 해요.');
    company.color = body.color.toLowerCase();
  }
  if (body.api !== undefined && body.api !== company.api) {
    if (company.builtin) throw new Error('기본 회사의 API 종류는 바꿀 수 없어요.');
    if (!isApiKind(body.api)) throw new Error('API 종류를 골라 주세요.');
    company.api = body.api;
  }
  if (body.baseUrl !== undefined) company.baseUrl = checkedBaseUrl(body.baseUrl);
  if (company.api === 'openai_compatible' && !company.baseUrl) throw new Error('OpenAI 호환 API는 주소(Base URL)가 필요해요.');
}

function applyModel(model: ModelEntry, body: Record<string, unknown>) {
  if (body.vendor !== undefined) model.vendor = companyById(String(body.vendor)).id;
  if (body.tier !== undefined) {
    const tier = Number(body.tier);
    if (![1, 2, 3].includes(tier)) throw new Error('등급은 1~3 중에서 골라 주세요.');
    model.tier = tier as Tier;
  }
  if (body.label !== undefined) model.label = text(body.label, 30) || model.label;
  if (body.apiModel !== undefined) model.apiModel = text(body.apiModel, 120);
  for (const key of ['priceInPerMTokUsd', 'priceOutPerMTokUsd'] as const) {
    if (body[key] === undefined) continue;
    const price = Number(body[key]);
    if (!Number.isFinite(price) || price < 0 || price > 10_000) throw new Error('단가는 0~10000 달러 사이로 입력해 주세요.');
    model[key] = price;
  }
  if (!model.label) throw new Error('모델 이름을 입력해 주세요.');
  if (!model.apiModel) throw new Error('API 모델 ID를 입력해 주세요.');
}

app.put('/api/ai-mode', (req, res) => {
  guard(res, 'owner');
  const mode = req.body?.mode;
  if (!AI_MODES.includes(mode)) throw new Error('실행 방식을 골라 주세요.');
  store.mutate((s) => {
    s.aiMode = mode;
  });
  store.emit('catalog.changed', { payload: { summary: `AI 실행 방식 변경: ${store.provider}` } });
  res.json({ provider: store.provider });
});

app.post('/api/companies', (req, res) => {
  guard(res, 'owner');
  if (store.data.companies.length >= MAX_COMPANIES) throw new Error(`회사는 ${MAX_COMPANIES}개까지 등록할 수 있어요.`);
  const body = req.body ?? {};
  const company: Company = { id: `co_${randomUUID().slice(0, 8)}`, name: '', hat: 'beret', color: '#c0392b', api: 'openai_compatible', baseUrl: '' };
  applyCompany(company, { ...body, api: undefined });
  if (!isApiKind(body.api)) throw new Error('API 종류를 골라 주세요.');
  company.api = body.api;
  applyCompany(company, { baseUrl: body.baseUrl });
  if (!company.name) throw new Error('회사 이름을 입력해 주세요.');
  store.mutate((s) => {
    s.companies.push(company);
  });
  if (text(body.apiKey, 500)) setApiKey(company.id, text(body.apiKey, 500));
  store.emit('catalog.changed', { payload: { summary: `회사 등록: ${company.name}` } });
  res.json(company);
});

app.put('/api/companies/:id', (req, res) => {
  guard(res, 'owner');
  const company = structuredClone(companyById(req.params.id));
  const body = req.body ?? {};
  applyCompany(company, body);
  store.mutate((s) => {
    s.companies = s.companies.map((c) => (c.id === company.id ? company : c));
  });
  if (body.apiKey === null) setApiKey(company.id, null);
  else if (text(body.apiKey, 500)) setApiKey(company.id, text(body.apiKey, 500));
  store.emit('catalog.changed', { payload: { summary: `회사 정보 변경: ${company.name}` } });
  res.json(company);
});

app.delete('/api/companies/:id', (req, res) => {
  guard(res, 'owner');
  const company = companyById(req.params.id);
  if (company.builtin) throw new Error('기본 회사는 지울 수 없어요.');
  const ids = store.data.models.filter((m) => m.vendor === company.id).map((m) => m.id);
  const users = modelsInUse(ids);
  if (users.length) throw new Error(`${users.map((a) => a.name).join(', ')} 직원이 이 회사 모델을 쓰고 있어요. 먼저 모델을 바꿔 주세요.`);
  store.mutate((s) => {
    s.companies = s.companies.filter((c) => c.id !== company.id);
    s.models = s.models.filter((m) => m.vendor !== company.id);
  });
  setApiKey(company.id, null);
  store.emit('catalog.changed', { payload: { summary: `회사 삭제: ${company.name}` } });
  res.json({ ok: true });
});

app.post('/api/models/discover', async (req, res, next) => {
  try {
    guard(res, 'owner');
    const body = req.body ?? {};
    const saved = typeof body.companyId === 'string' ? companyById(body.companyId) : null;
    const api = body.api ?? saved?.api;
    if (!isApiKind(api)) throw new Error('API 종류를 골라 주세요.');
    const baseUrl = body.baseUrl !== undefined ? checkedBaseUrl(body.baseUrl) : (saved?.baseUrl ?? '');
    const key = text(body.apiKey, 500) || (saved && saved.api === api ? apiKeyFor(saved) : '');
    const models = await listModels({ api, name: saved?.name ?? API_KINDS[api].name, key, baseUrl });
    res.json({ models });
  } catch (error) {
    next(error);
  }
});

app.post('/api/models', (req, res) => {
  guard(res, 'owner');
  if (store.data.models.length >= MAX_MODELS) throw new Error(`모델은 ${MAX_MODELS}개까지 등록할 수 있어요.`);
  const body = req.body ?? {};
  if (body.vendor === undefined) throw new Error('회사를 골라 주세요.');
  const model: ModelEntry = {
    id: `m_${randomUUID().slice(0, 8)}`,
    vendor: '',
    tier: 2,
    label: '',
    apiModel: '',
    priceInPerMTokUsd: 1,
    priceOutPerMTokUsd: 4,
  };
  applyModel(model, body);
  store.mutate((s) => {
    s.models.push(model);
  });
  store.emit('catalog.changed', { payload: { summary: `모델 등록: ${model.label}` } });
  res.json(model);
});

app.put('/api/models/:id', (req, res) => {
  guard(res, 'owner');
  const current = store.data.models.find((m) => m.id === req.params.id);
  if (!current) throw new Error('알 수 없는 모델이에요.');
  const model = structuredClone(current);
  applyModel(model, req.body ?? {});
  store.mutate((s) => {
    s.models = s.models.map((m) => (m.id === model.id ? model : m));
  });
  store.emit('catalog.changed', { payload: { summary: `모델 정보 변경: ${model.label}` } });
  res.json(model);
});

app.delete('/api/models/:id', (req, res) => {
  guard(res, 'owner');
  const model = store.data.models.find((m) => m.id === req.params.id);
  if (!model) throw new Error('이미 지워진 모델이에요.');
  if (model.builtin) throw new Error('기본 모델은 지울 수 없어요. 대신 API 모델 ID와 단가를 바꿀 수 있어요.');
  const users = modelsInUse([model.id]);
  if (users.length) throw new Error(`${users.map((a) => a.name).join(', ')} 직원이 이 모델을 쓰고 있어요. 먼저 모델을 바꿔 주세요.`);
  store.mutate((s) => {
    s.models = s.models.filter((m) => m.id !== model.id);
  });
  store.emit('catalog.changed', { payload: { summary: `모델 삭제: ${model.label}` } });
  res.json({ ok: true });
});

const SHARE_ROLE_IDS: ShareRole[] = ['viewer', 'operator', 'manager'];
const MAX_SHARES = 30;

app.post('/api/shares', (req, res) => {
  guard(res, 'owner');
  const { name, role, officeIds, expiresInDays } = req.body ?? {};
  if (!SHARE_ROLE_IDS.includes(role)) throw new Error('권한을 골라 주세요.');
  let scope: ShareLink['officeIds'];
  if (officeIds === 'all') scope = 'all';
  else if (Array.isArray(officeIds)) {
    const known = new Set(store.data.offices.map((o) => o.id));
    scope = [...new Set(officeIds.map(String))].filter((id) => known.has(id));
    if (scope.length === 0) throw new Error('공유할 사무실을 하나 이상 골라 주세요.');
  } else throw new Error('공유 범위를 골라 주세요.');
  if (store.data.shares.length >= MAX_SHARES) throw new Error(`공유 링크는 ${MAX_SHARES}개까지 만들 수 있어요. 안 쓰는 링크를 지워 주세요.`);
  const days = Number(expiresInDays);
  const share: ShareLink = {
    id: `share_${randomUUID().slice(0, 8)}`,
    token: randomBytes(24).toString('base64url'),
    name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 30) : '이름 없는 공유',
    role,
    officeIds: scope,
    createdAt: new Date().toISOString(),
    expiresAt: Number.isFinite(days) && days > 0 ? new Date(Date.now() + days * 86_400_000).toISOString() : null,
    lastUsedAt: null,
  };
  store.mutate((s) => {
    s.shares.unshift(share);
  });
  store.emit('share.created', { payload: { shareId: share.id, name: share.name, role } });
  res.json(share);
});

app.delete('/api/shares/:id', (req, res) => {
  guard(res, 'owner');
  const share = store.data.shares.find((s) => s.id === req.params.id);
  if (!share) throw new Error('이미 지워진 공유 링크예요.');
  store.mutate((s) => {
    s.shares = s.shares.filter((x) => x.id !== share.id);
  });
  store.emit('share.revoked', { payload: { shareId: share.id, name: share.name } });
  closeRevokedSockets();
  res.json({ ok: true });
});

const webDist = resolve('dist/web');
if (existsSync(webDist)) {
  app.use(express.static(webDist));
}

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  res.status(error instanceof ForbiddenError ? 403 : 400).json({ error: error instanceof Error ? error.message : String(error) });
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', verifyClient: ({ req }: { req: IncomingMessage }) => viewerOf(req) !== null });
const sockets = new Map<WebSocket, Viewer>();

function closeRevokedSockets() {
  for (const [socket, viewer] of sockets) {
    if (!stillValid(viewer)) socket.close(4001, 'share revoked');
  }
}

wss.on('connection', (socket, req) => {
  const viewer = viewerOf(req);
  if (!viewer) return socket.close(4001, 'unauthorized');
  sockets.set(socket, viewer);
  const send = (message: ServerMessage) => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
  };
  send({ kind: 'snapshot', data: snapshotFor(viewer) });
  for (const event of store.recentEvents(200)) {
    if (canSeeEvent(viewer, event)) send({ kind: 'event', data: event, replay: true });
  }

  const unsubscribe = store.subscribe((message) => {
    if (!stillValid(viewer)) return socket.close(4001, 'share expired');
    if (message.kind === 'snapshot') send({ kind: 'snapshot', data: snapshotFor(viewer) });
    else if (canSeeEvent(viewer, message.data)) send({ ...message, replay: false });
  });
  socket.on('close', () => {
    unsubscribe();
    sockets.delete(socket);
  });
});

function background(job: () => Promise<void>, label: string): void {
  job().catch((error) => console.error(`[office] ${label} 실패:`, error));
}

setInterval(() => background(() => workflowRuntime.tick(), '자동 확인'), config.autoRunIntervalSec * 1000);

server.listen(config.port, () => {
  console.log(
    `[office] server http://localhost:${config.port}  provider=${store.provider} model=${config.model || '(미설정)'}  password=${authEnabled() ? 'on' : 'off'}`,
  );
  background(async () => {
    await workflowRuntime.start();
    await workflowRuntime.drain();
  }, '작업 복구');
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    workflowRuntime
      .stop()
      .catch((error) => console.error('[office] 실행기 종료 실패:', error))
      .finally(() => process.exit(0));
  });
}
