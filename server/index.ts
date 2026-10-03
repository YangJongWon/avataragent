import { createServer, type IncomingMessage } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import { can, type Action } from '../shared/access.ts';
import { isModelId } from '../shared/models.ts';
import { isSkin } from '../shared/skins.ts';
import { TEAMS } from '../shared/teams.ts';
import type { ServerMessage, ShareLink, ShareRole, TeamId, Viewer } from '../shared/types.ts';
import { canSeeEvent, ForbiddenError, snapshotFor } from './access.ts';
import { authEnabled, authRouter, stillValid, viewerOf } from './auth.ts';
import { config } from './config.ts';
import {
  autoRunTick,
  setPaused,
  simulateInquiry,
  simulateMail,
} from './orchestrator.ts';
import { store } from './store.ts';
import { workflowRuntime } from './workflow-runtime.ts';

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

app.post('/api/tasks', (req, res) => {
  const { officeId, title, description, taskType, planMode, steps, planNote } = req.body ?? {};
  if (typeof officeId !== 'string') throw new Error('사무실을 선택해 주세요.');
  guard(res, 'operate', officeId);
  res.json(
    workflowRuntime.createTask({
      officeId,
      title: typeof title === 'string' ? title : undefined,
      description: typeof description === 'string' ? description : undefined,
      taskType: typeof taskType === 'string' ? taskType : undefined,
      planMode,
      steps,
      planNote: typeof planNote === 'string' ? planNote : undefined,
    }),
  );
});

app.post('/api/offices/:id/plan-preview', async (req, res, next) => {
  try {
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
  } catch (error) {
    next(error);
  }
});

app.put('/api/tasks/:id/plan', (req, res) => {
  guard(res, 'operate', officeOfTask(req.params.id));
  res.json(workflowRuntime.updatePlan(req.params.id, req.body?.steps));
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

app.put('/api/offices/:id', (req, res) => {
  guard(res, 'manage', req.params.id);
  const { autoRun, budgetKrw } = req.body ?? {};
  if (budgetKrw !== undefined) guard(res, 'owner');
  store.updateOffice(req.params.id, (o) => {
    if (typeof autoRun === 'boolean') o.autoRun = autoRun;
    if (budgetKrw === null) o.budgetKrw = null;
    else if (typeof budgetKrw === 'number' && budgetKrw >= 0) o.budgetKrw = Math.round(budgetKrw);
  });
  store.emit('office.updated', { payload: { officeId: req.params.id, autoRun, budgetKrw } });
  autoRunTick();
  res.json(store.office(req.params.id));
});

app.post('/api/sim/mail', (_req, res) => {
  if (!teamOffice(res, 'hr')) guard(res, 'owner');
  res.json(simulateMail());
});

app.post('/api/sim/inquiry', (_req, res) => {
  if (!teamOffice(res, 'support')) guard(res, 'owner');
  res.json(simulateInquiry());
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

app.post('/api/tasks/:id/cancel', (req, res) => {
  guard(res, 'operate', officeOfTask(req.params.id));
  workflowRuntime.cancelTask(req.params.id);
  res.json({ ok: true });
});

app.post('/api/tasks/:id/help', (req, res) => {
  guard(res, 'operate', officeOfTask(req.params.id));
  const answer = req.body?.answer;
  workflowRuntime.answerHelp(req.params.id, typeof answer === 'string' && answer.trim() ? answer : null);
  res.json({ ok: true });
});

app.post('/api/tasks/:id/approve', (req, res) => {
  guard(res, 'operate', officeOfTask(req.params.id));
  const valueKrw = req.body?.valueKrw;
  workflowRuntime.approve(req.params.id, typeof valueKrw === 'number' && Number.isFinite(valueKrw) ? valueKrw : undefined);
  res.json({ ok: true });
});

app.post('/api/tasks/:id/request-changes', (req, res) => {
  guard(res, 'operate', officeOfTask(req.params.id));
  workflowRuntime.requestChanges(req.params.id, String(req.body?.comment ?? ''));
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

app.post('/api/agents/:id/pause', (req, res) => {
  guard(res, 'manage', officeOfAgent(req.params.id));
  setPaused(req.params.id, Boolean(req.body?.paused));
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

setInterval(autoRunTick, config.autoRunIntervalSec * 1000);

server.listen(config.port, () => {
  console.log(
    `[office] server http://localhost:${config.port}  provider=${config.provider} model=${config.model || '(미설정)'}  password=${authEnabled() ? 'on' : 'off'}`,
  );
  workflowRuntime.start();
  workflowRuntime.drain();
});
