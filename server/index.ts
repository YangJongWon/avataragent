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
import { allowedModes, isToolMode, type McpServer } from '../shared/mcp.ts';
import { isExportFormat } from '../shared/design.ts';
import { isPersonality } from '../shared/personality.ts';
import { parsePlaybook, playbookChanges } from '../shared/playbook.ts';
import { parseFlowPack } from '../shared/flow-pack.ts';
import { isPlan, planOf } from '../shared/plans.ts';
import { isLanguage, type Language } from '../shared/i18n.ts';
import { exportActivity } from './activity.ts';
import { applyLicense, billingInfo, billingProvider, billingTick, cancelSubscription, completeMockCheckout, handleWebhook, resumeSubscription, startCheckout } from './billing.ts';
import { isSkin } from '../shared/skins.ts';
import { TEAMS } from '../shared/teams.ts';
import type { AiMode, ServerMessage, ShareLink, ShareRole, TeamId, Viewer } from '../shared/types.ts';
import { canSeeEvent, ForbiddenError, snapshotFor } from './access.ts';
import { listModels } from './ai.ts';
import { authEnabled, authRouter, stillValid, viewerOf } from './auth.ts';
import { chatNews, forwardChat, postChat, setAssignee } from './chat.ts';
import { communityFlow, communityInstall, communityItem, communityList, communityPreview, popularFlows, removeFlow, saveFlow } from './community.ts';
import { recommendFlows, suggestInstructions, suggestPrompt } from './recommend.ts';
import { config } from './config.ts';
import { closeStorage, storageInfo } from './db.ts';
import { createMember, deleteMember, updateMember } from './members.ts';
import { applyImprovement, autoImproveOffice, setActionEnabled, simulateInquiry, simulateMail } from './orchestrator.ts';
import { designReport, exportCapabilities } from './exports/designer.ts';
import { answerHelp } from './help.ts';
import { buildExport } from './exports/index.ts';
import { closeAllConnections, closeConnection, discoverTools } from './mcp.ts';
import { adviseModel } from './model-advice.ts';
import { finishLogin, logout, OAUTH_CALLBACK_PATH, startLogin } from './mcp-oauth.ts';
import { apiKeyFor, dropMcpSecrets, setApiKey, setMcpSecrets } from './secrets.ts';
import { store } from './store.ts';
import { exportTheme, importTheme, isUsableOutfit, isUsableSkin, isUsableTheme, listThemes, removeTheme, themeFile } from './themes.ts';
import { DEFAULT_THEME, parseBookings, THEME_LIMITS } from '../shared/theme-pack.ts';
import { toStepInputs, workflowRuntime } from './workflow-runtime.ts';

const app = express();
app.set('trust proxy', 'loopback');
// Payment companies call this without a session; the provider verifies the signature instead.
app.post('/api/billing/webhook/:provider', express.text({ type: '*/*', limit: '256kb' }), async (req, res) => {
  try {
    await handleWebhook(req.params.provider, typeof req.body === 'string' ? req.body : '', req.headers);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});
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

app.get('/api/health', (_req, res) => {
  const storage = storageInfo();
  res.status(storage.healthy ? 200 : 503).json({ ok: storage.healthy, storage, workflowRuntime: config.workflowRuntime });
});

app.post('/api/tasks', async (req, res) => {
  const { officeId, title, description, taskType, milestoneId, planMode, steps, planNote } = req.body ?? {};
  if (typeof officeId !== 'string') throw new Error('사무실을 선택해 주세요.');
  guard(res, 'operate', officeId);
  res.json(
    await workflowRuntime.createTask({
      officeId,
      title: typeof title === 'string' ? title : undefined,
      description: typeof description === 'string' ? description : undefined,
      taskType: typeof taskType === 'string' ? taskType : undefined,
      milestoneId: typeof milestoneId === 'string' ? milestoneId : undefined,
      planMode: planMode === 'custom' || planMode === 'ai' ? planMode : 'template',
      steps: planMode === 'custom' ? toStepInputs(steps) : undefined,
      planNote: typeof planNote === 'string' ? planNote : undefined,
    }),
  );
});

app.put('/api/tasks/:id/milestone', (req, res) => {
  const task = store.task(req.params.id);
  guard(res, 'operate', task.officeId);
  const office = store.office(task.officeId);
  const milestoneId = typeof req.body?.milestoneId === 'string' ? req.body.milestoneId : null;
  if (milestoneId !== null && !office.milestones?.some((milestone) => milestone.id === milestoneId)) throw new Error('이 프로젝트에 없는 마일스톤이에요.');
  store.updateTask(task.id, (target) => { target.milestoneId = milestoneId; });
  store.emit('task.milestone_changed', { taskId: task.id, payload: { officeId: task.officeId, milestoneId } });
  res.json(store.task(task.id));
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
  const { team, name, theme } = req.body ?? {};
  if (typeof team !== 'string' || !(team in TEAMS)) throw new Error('팀 종류를 선택해 주세요.');
  if (theme !== undefined && !isUsableTheme(theme)) throw new Error('설치되지 않은 테마예요.');
  const meta = TEAMS[team as TeamId];
  const sameTeam = store.data.offices.filter((o) => o.team === team).length;
  const title = typeof name === 'string' && name.trim() ? name.trim().slice(0, 20) : `${meta.name} ${sameTeam + 1}`;
  let office = store.addOffice(team as TeamId, title);
  if (theme && theme !== store.data.theme) {
    store.updateOffice(office.id, (o) => {
      o.theme = theme;
    });
    office = store.office(office.id);
  }
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
  const { autoRun, autoImprove, budgetKrw, theme, themeCss } = req.body ?? {};
  if (budgetKrw !== undefined) guard(res, 'owner');
  if (theme !== undefined && theme !== null && !isUsableTheme(theme)) throw new Error('설치되지 않은 테마예요.');
  store.updateOffice(req.params.id, (o) => {
    if (typeof autoRun === 'boolean') o.autoRun = autoRun;
    if (typeof autoImprove === 'boolean') o.autoImprove = autoImprove;
    // null goes back to the company theme; a theme id, even the built-in one, is this office's own pick.
    if (theme === null) delete o.theme;
    else if (typeof theme === 'string') o.theme = theme;
    if (themeCss === true) delete o.themeCss;
    else if (themeCss === false) o.themeCss = false;
    if (budgetKrw === null) o.budgetKrw = null;
    else if (typeof budgetKrw === 'number' && budgetKrw >= 0) o.budgetKrw = Math.round(budgetKrw);
  });
  store.emit('office.updated', { payload: { officeId: req.params.id, autoRun, autoImprove, budgetKrw, theme, themeCss } });
  if (autoImprove === true) autoImproveOffice(req.params.id);
  await workflowRuntime.tick();
  res.json(store.office(req.params.id));
});

app.post('/api/offices/:id/playbook', (req, res) => {
  guard(res, 'manage', req.params.id);
  const playbook = parsePlaybook(req.body?.playbook);
  const office = store.office(req.params.id);
  const changes = playbookChanges(playbook, office, store.data.agents, store.data.models, req.body?.includeModel === true);
  if (changes.some((c) => c.warnings.length) && req.body?.acceptWarnings !== true) throw new Error('주의가 필요한 규칙이 있어요. 내용을 확인한 뒤 다시 적용해 주세요.');
  for (const change of changes) {
    const before = store.agent(change.agentId);
    if (change.field === 'rules') store.emit('rule.changed', { agentId: before.id, payload: { scope: 'personal', before: before.rules, after: change.to } });
    store.updateAgent(change.agentId, { [change.field]: change.to });
  }
  store.emit('playbook.applied', { payload: { officeId: office.id, name: playbook.name, changes: changes.length } });
  res.json({ changes });
});

// Themes are only looks: anyone signed in (owner, member or share link) may list them and load their files.
app.get('/api/themes', (_req, res) => {
  res.json(listThemes());
});

// Themes apply to the whole company and may carry custom CSS, so only the owner installs or removes them.
app.post('/api/themes/import', express.raw({ type: ['application/zip', 'application/octet-stream'], limit: THEME_LIMITS.zipBytes }), (req, res) => {
  guard(res, 'owner');
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw new Error('테마 zip 파일을 올려 주세요.');
  const theme = importTheme(new Uint8Array(req.body));
  store.emit('theme.installed', { payload: { themeId: theme.id, name: theme.name, version: theme.themeVersion, hasCss: theme.hasCss } });
  res.json(theme);
});

// The company theme is what every office shows unless it picked its own.
app.put('/api/theme', (req, res) => {
  guard(res, 'owner');
  const theme = req.body?.theme;
  if (!isUsableTheme(theme)) throw new Error('설치되지 않은 테마예요.');
  store.mutate((s) => {
    s.theme = theme;
  });
  store.emit('theme.changed', { payload: { themeId: theme } });
  res.json({ theme });
});

app.put('/api/theme-bookings', (req, res) => {
  guard(res, 'owner');
  const bookings = parseBookings(req.body?.bookings);
  const missing = bookings.find((b) => !isUsableTheme(b.theme));
  if (missing) throw new Error(`설치되지 않은 테마예요 (${missing.theme}).`);
  store.mutate((s) => {
    s.themeBookings = bookings;
  });
  store.emit('theme.booked', { payload: { count: bookings.length } });
  res.json({ bookings });
});

app.put('/api/site-theme', (req, res) => {
  guard(res, 'owner');
  const theme = req.body?.theme ?? null;
  if (theme !== null && !isUsableTheme(theme)) throw new Error('설치되지 않은 테마예요.');
  store.mutate((s) => {
    s.siteTheme = theme;
  });
  store.emit('theme.site', { payload: { themeId: theme } });
  res.json({ theme });
});

app.delete('/api/themes/:id', (req, res) => {
  guard(res, 'owner');
  removeTheme(req.params.id);
  if (store.data.theme === req.params.id || store.data.siteTheme === req.params.id || store.data.themeBookings.some((b) => b.theme === req.params.id)) {
    store.mutate((s) => {
      if (s.theme === req.params.id) s.theme = DEFAULT_THEME;
      if (s.siteTheme === req.params.id) s.siteTheme = null;
      s.themeBookings = s.themeBookings.filter((b) => b.theme !== req.params.id);
    });
  }
  for (const office of store.data.offices.filter((o) => o.theme === req.params.id)) {
    store.updateOffice(office.id, (o) => {
      delete o.theme;
    });
  }
  for (const agent of store.data.agents.filter((a) => a.skin.startsWith(`${req.params.id}:`))) store.updateAgent(agent.id, { skin: 'pixel' });
  store.emit('theme.removed', { payload: { themeId: req.params.id } });
  res.json({ ok: true });
});

app.get('/api/themes/:id/export', (req, res) => {
  const zip = exportTheme(req.params.id);
  res.setHeader('content-type', 'application/zip');
  res.setHeader('content-disposition', `attachment; filename="${req.params.id}.zip"`);
  res.send(Buffer.from(zip));
});

// Saved work journeys: anyone making a task can use them; the owner keeps the list.
app.post('/api/flows', (req, res) => {
  guard(res, 'owner');
  const source = req.body?.source === 'file' ? 'file' : 'mine';
  res.json(saveFlow(parseFlowPack(req.body?.flow), source));
});

app.delete('/api/flows/:id', (req, res) => {
  guard(res, 'owner');
  removeFlow(req.params.id);
  res.json({ ok: true });
});

// The community on the project site, fetched by this server from SITE_URL only.
app.get('/api/community/items', async (req, res) => {
  guard(res, 'owner');
  res.json(await communityList(req.query as Record<string, unknown>));
});

app.get('/api/community/items/:id', async (req, res) => {
  guard(res, 'owner');
  res.json(await communityItem(req.params.id));
});

app.get('/api/community/items/:id/preview', async (req, res) => {
  guard(res, 'owner');
  const file = await communityPreview(req.params.id);
  res.setHeader('content-type', file.contentType);
  res.setHeader('cache-control', 'private, max-age=300');
  res.send(Buffer.from(file.bytes));
});

// Help while making a task. Popular flows cost nothing; the rest ask the office manager (charged to the office).
app.get('/api/community/popular-flows', async (_req, res) => {
  res.json(await popularFlows());
});

app.get('/api/community/items/:id/flow', async (req, res) => {
  guard(res, 'operate', typeof req.query.officeId === 'string' ? req.query.officeId : undefined);
  res.json(await communityFlow(req.params.id));
});

const requestOf = (req: Request) => ({
  officeId: req.params.id as string,
  title: String(req.body?.title ?? '').slice(0, 200),
  description: String(req.body?.description ?? '').slice(0, 4000),
  taskType: String(req.body?.taskType ?? ''),
});

app.post('/api/offices/:id/flow-recommendations', async (req, res) => {
  guard(res, 'operate', req.params.id);
  res.json(await recommendFlows(requestOf(req)));
});

app.post('/api/offices/:id/prompt-suggestion', async (req, res) => {
  guard(res, 'operate', req.params.id);
  res.json(await suggestPrompt(requestOf(req)));
});

app.post('/api/offices/:id/step-instructions', async (req, res) => {
  guard(res, 'operate', req.params.id);
  const steps = Array.isArray(req.body?.steps) ? req.body.steps.slice(0, 10) : [];
  res.json({ steps: await suggestInstructions({ ...requestOf(req), steps: toStepInputs(steps) }) });
});

app.post('/api/community/install', async (req, res) => {
  guard(res, 'owner');
  res.json(await communityInstall(req.body?.id));
});

app.get('/themes/:id/*path', (req, res) => {
  const path = (req.params as unknown as { path: string[] }).path.join('/');
  const found = themeFile(req.params.id, path);
  if (!found) return void res.status(404).end();
  res.sendFile(found.file, { headers: { 'content-type': found.contentType, 'x-content-type-options': 'nosniff', 'cache-control': 'no-cache' } });
});

app.post('/api/offices/:id/improvements', (req, res) => {
  guard(res, 'manage', req.params.id);
  res.json(applyImprovement(req.params.id, String(req.body?.id ?? '')));
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

app.get('/api/tasks/:id/export', async (req, res) => {
  const task = store.task(req.params.id);
  guard(res, 'view', task.officeId);
  const format = req.query.format;
  if (!isExportFormat(format)) {
    res.status(400).json({ error: '지원하지 않는 형식이에요.' });
    return;
  }
  const file = await buildExport(task, store.office(task.officeId), format, { print: req.query.print === '1' });
  res.setHeader('content-type', file.mime);
  res.setHeader('x-export-designed', file.designed ? '1' : '0');
  if (format === 'pdf') {
    res.setHeader('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:");
  } else {
    res.setHeader('content-disposition', `attachment; filename="export.${format}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
  }
  res.send(file.body);
});

app.post('/api/tasks/:id/design', async (req, res) => {
  guard(res, 'operate', officeOfTask(req.params.id));
  const kind = req.body?.kind;
  if (kind !== 'doc' && kind !== 'deck' && kind !== 'sheet') {
    res.status(400).json({ error: 'kind는 doc, deck, sheet 중 하나여야 해요.' });
    return;
  }
  res.json(await designReport(req.params.id, kind, { review: req.body?.review === true }));
});

app.get('/api/export-capabilities', (_req, res) => {
  res.json(exportCapabilities());
});

app.post('/api/help', async (req, res) => {
  const viewer = viewerOfRes(res);
  const officeId = typeof req.body?.officeId === 'string' && can(viewer, 'view', req.body.officeId) ? req.body.officeId : undefined;
  const history = Array.isArray(req.body?.history)
    ? req.body.history.slice(-3).map((h: { question?: unknown; answer?: unknown }) => ({ question: String(h?.question ?? '').slice(0, 500), answer: String(h?.answer ?? '').slice(0, 2000) }))
    : [];
  const useAI = officeId ? can(viewer, 'operate', officeId) : can(viewer, 'owner');
  res.json(await answerHelp({ question: String(req.body?.question ?? ''), tab: String(req.body?.tab ?? ''), officeId, history }, useAI));
});

app.put('/api/tasks/:id/actions/:actionId', (req, res) => {
  guard(res, 'operate', officeOfTask(req.params.id));
  res.json(setActionEnabled(req.params.id, req.params.actionId, Boolean(req.body?.enabled)));
});

app.post('/api/tasks/:id/request-changes', async (req, res) => {
  guard(res, 'operate', officeOfTask(req.params.id));
  await workflowRuntime.requestChanges(req.params.id, String(req.body?.comment ?? ''));
  res.json({ ok: true });
});

app.put('/api/agents/:id', (req, res) => {
  guard(res, 'manage', officeOfAgent(req.params.id));
  const { name, rules, model, skin, outfit, personality, workPolicy } = req.body ?? {};
  const before = store.agent(req.params.id);
  const patch: Record<string, unknown> = {};
  if (typeof name === 'string' && name.trim()) patch.name = name.trim().slice(0, 20);
  if (personality !== undefined) {
    if (!isPersonality(personality)) throw new Error('알 수 없는 성격이에요.');
    patch.personality = personality;
  }
  if (typeof model === 'string') {
    if (!isModelId(model)) throw new Error('알 수 없는 모델입니다.');
    patch.model = model;
  }
  if (skin !== undefined) {
    if (!isUsableSkin(skin)) throw new Error('알 수 없는 스킨입니다.');
    patch.skin = skin;
  }
  if (outfit !== undefined) {
    if (outfit === null) patch.outfit = undefined;
    else if (!isUsableOutfit(String(patch.skin ?? before.skin), outfit)) throw new Error('이 캐릭터에 없는 의상이에요.');
    else patch.outfit = outfit;
  } else if (patch.skin !== undefined && before.outfit && !isUsableOutfit(String(patch.skin), before.outfit)) {
    patch.outfit = undefined;
  }
  if (typeof rules === 'string' && rules !== before.rules) {
    store.emit('rule.changed', {
      agentId: before.id,
      payload: { scope: 'personal', before: before.rules, after: rules },
    });
    patch.rules = rules;
  }
  if (workPolicy !== undefined) {
    if (!workPolicy || typeof workPolicy !== 'object') throw new Error('근무 정책 형식이 올바르지 않습니다.');
    const candidate = { ...before.workPolicy, ...workPolicy };
    if (typeof candidate.enabled !== 'boolean') throw new Error('근무제 사용 여부가 올바르지 않습니다.');
    if (!Array.isArray(candidate.days) || candidate.days.some((d: unknown) => !Number.isInteger(d) || Number(d) < 0 || Number(d) > 6)) throw new Error('근무 요일이 올바르지 않습니다.');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(candidate.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(candidate.end)) throw new Error('근무 시간은 HH:mm 형식이어야 합니다.');
    try { new Intl.DateTimeFormat('en', { timeZone: candidate.timezone }).format(); } catch { throw new Error('알 수 없는 시간대입니다.'); }
    for (const key of ['maxTokens', 'maxWorkMinutes'] as const) {
      const value = candidate[key];
      if (value !== null && (!Number.isFinite(value) || value <= 0)) throw new Error('일일 한도는 양수이거나 비어 있어야 합니다.');
    }
    patch.workPolicy = candidate;
  }
  store.updateAgent(req.params.id, patch);
  res.json(store.agent(req.params.id));
});

app.post('/api/offices/:id/agents', (req, res) => {
  guard(res, 'manage', req.params.id);
  const { role, name, model, skin, personality } = req.body ?? {};
  if (!['manager', 'researcher', 'writer', 'reviewer'].includes(role)) throw new Error('알 수 없는 역할입니다.');
  if (model !== undefined && !isModelId(model)) throw new Error('알 수 없는 모델입니다.');
  if (skin !== undefined && !isUsableSkin(skin)) throw new Error('알 수 없는 스킨입니다.');
  if (personality !== undefined && !isPersonality(personality)) throw new Error('알 수 없는 성격이에요.');
  const agent = store.hireAgent(req.params.id, role, typeof name === 'string' ? name : undefined);
  if (model !== undefined || skin !== undefined || personality !== undefined) {
    store.updateAgent(agent.id, { ...(model ? { model } : {}), ...(skin ? { skin } : {}), ...(personality ? { personality } : {}) });
  }
  store.emit('agent.hired', { agentId: agent.id, payload: { name: agent.name, role } });
  res.json(store.agent(agent.id));
});

app.delete('/api/agents/:id', (req, res) => {
  guard(res, 'manage', officeOfAgent(req.params.id));
  const agent = store.fireAgent(req.params.id);
  store.emit('agent.left', { payload: { name: agent.name, role: agent.role, officeId: agent.officeId } });
  res.json({ ok: true });
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

app.post('/api/models/advise', async (req, res, next) => {
  try {
    guard(res, 'owner');
    const vendor = companyById(String(req.body?.vendor ?? '')).id;
    const apiModel = text(req.body?.apiModel, 120);
    if (!apiModel) throw new Error('API 모델 ID를 먼저 입력해 주세요.');
    res.json(await adviseModel(vendor, apiModel));
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

const MAX_MCP_SERVERS = 20;
const SECRET_NAME = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;

const mcpById = (id: string) => {
  const server = store.data.mcpServers.find((m) => m.id === id);
  if (!server) throw new Error('알 수 없는 MCP 서버예요.');
  return server;
};

function applyMcp(server: McpServer, body: Record<string, unknown>) {
  if (body.name !== undefined) server.name = text(body.name, 20) || server.name;
  if (body.icon !== undefined) server.icon = text(body.icon, 4) || server.icon;
  if (body.transport !== undefined) {
    if (body.transport !== 'http' && body.transport !== 'stdio') throw new Error('연결 방식을 골라 주세요.');
    server.transport = body.transport;
  }
  if (body.url !== undefined) server.url = text(body.url, 500);
  if (body.command !== undefined) server.command = text(body.command, 200);
  if (body.args !== undefined) {
    if (!Array.isArray(body.args) || body.args.length > 20) throw new Error('실행 인자는 20개까지 넣을 수 있어요.');
    server.args = body.args.map((a) => String(a).slice(0, 300));
  }
  if (body.enabled !== undefined) server.enabled = Boolean(body.enabled);
  if (body.oauth !== undefined) server.oauth = Boolean(body.oauth);
  if (server.transport !== 'http') server.oauth = false;
  if (body.officeIds !== undefined) {
    if (body.officeIds === 'all') server.officeIds = 'all';
    else if (Array.isArray(body.officeIds)) {
      const known = new Set(store.data.offices.map((o) => o.id));
      server.officeIds = [...new Set(body.officeIds.map(String))].filter((id) => known.has(id));
    } else throw new Error('쓸 사무실을 골라 주세요.');
  }
  if (body.tools !== undefined) {
    const choices = (body.tools ?? {}) as Record<string, unknown>;
    server.tools = server.tools.map((tool) => {
      if (!(tool.name in choices)) return tool;
      const mode = choices[tool.name];
      if (!isToolMode(mode) || !allowedModes(tool).includes(mode)) throw new Error(`${tool.name} 도구는 그 방식으로 쓸 수 없어요.`);
      return { ...tool, mode };
    });
  }
  if (!server.name) throw new Error('이름을 입력해 주세요.');
  if (server.transport === 'http') {
    if (!/^https?:\/\/[^\s/]+/i.test(server.url)) throw new Error('MCP 주소는 http:// 또는 https:// 로 시작해야 해요.');
  } else {
    if (!config.mcpAllowStdio) throw new Error('실행 명령(stdio) MCP는 .env에 MCP_ALLOW_STDIO=1을 넣고 서버를 다시 켜야 등록할 수 있어요.');
    if (!server.command || /[\r\n]/.test(server.command)) throw new Error('실행 명령을 입력해 주세요.');
  }
}

function checkedSecrets(raw: unknown): Record<string, string | null> {
  if (raw === undefined) return {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('비밀값 형식이 올바르지 않아요.');
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > 10) throw new Error('비밀값은 10개까지 넣을 수 있어요.');
  return Object.fromEntries(
    entries.map(([name, value]) => {
      if (!SECRET_NAME.test(name)) throw new Error(`비밀값 이름 "${name}"은(는) 영문, 숫자, _ , - 만 쓸 수 있어요.`);
      if (value === null || value === '') return [name, null];
      return [name, String(value).trim().slice(0, 2000)];
    }),
  );
}

app.post('/api/mcp-servers', (req, res) => {
  guard(res, 'owner');
  if (store.data.mcpServers.length >= MAX_MCP_SERVERS) throw new Error(`MCP 서버는 ${MAX_MCP_SERVERS}개까지 등록할 수 있어요.`);
  const body = req.body ?? {};
  const server: McpServer = {
    id: `mcp_${randomUUID().slice(0, 8)}`,
    name: '',
    icon: '🧩',
    transport: 'http',
    url: '',
    command: '',
    args: [],
    enabled: true,
    officeIds: 'all',
    tools: [],
    checkedAt: null,
    lastError: null,
  };
  applyMcp(server, { ...body, tools: undefined });
  const secrets = checkedSecrets(body.secrets);
  store.mutate((s) => {
    s.mcpServers.push(server);
  });
  setMcpSecrets(server.id, secrets);
  store.emit('mcp.changed', { payload: { summary: `MCP 등록: ${server.name}` } });
  res.json(server);
});

app.put('/api/mcp-servers/:id', (req, res) => {
  guard(res, 'owner');
  const before = mcpById(req.params.id);
  const server = structuredClone(before);
  const body = req.body ?? {};
  applyMcp(server, body);
  const secrets = checkedSecrets(body.secrets);
  store.mutate((s) => {
    s.mcpServers = s.mcpServers.map((m) => (m.id === server.id ? server : m));
  });
  setMcpSecrets(server.id, secrets);
  const reconnect =
    Object.keys(secrets).length > 0 ||
    server.transport !== before.transport ||
    server.url !== before.url ||
    server.command !== before.command ||
    server.args.join('\n') !== before.args.join('\n') ||
    server.oauth !== before.oauth;
  if (server.url !== before.url || !server.oauth) logout(server.id);
  if (reconnect || !server.enabled) closeConnection(server.id);
  store.emit('mcp.changed', { payload: { summary: `MCP 변경: ${server.name}` } });
  res.json(server);
});

app.delete('/api/mcp-servers/:id', (req, res) => {
  guard(res, 'owner');
  const server = mcpById(req.params.id);
  store.mutate((s) => {
    s.mcpServers = s.mcpServers.filter((m) => m.id !== server.id);
  });
  closeConnection(server.id);
  dropMcpSecrets(server.id);
  logout(server.id);
  store.emit('mcp.changed', { payload: { summary: `MCP 삭제: ${server.name}` } });
  res.json({ ok: true });
});

/** Re-reads the server's tool list and records the outcome on the server card. */
async function refreshTools(server: McpServer) {
  try {
    const tools = await discoverTools(server);
    store.mutate((s) => {
      const target = s.mcpServers.find((m) => m.id === server.id);
      if (target) Object.assign(target, { tools, checkedAt: new Date().toISOString(), lastError: null });
    });
    return tools;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    store.mutate((s) => {
      const target = s.mcpServers.find((m) => m.id === server.id);
      if (target) Object.assign(target, { checkedAt: new Date().toISOString(), lastError: reason.slice(0, 500) });
    });
    throw new Error(`연결하지 못했어요: ${reason}`);
  }
}

app.post('/api/mcp-servers/:id/check', async (req, res) => {
  guard(res, 'owner');
  res.json({ tools: await refreshTools(mcpById(req.params.id)) });
});

app.post('/api/mcp-servers/:id/login', async (req, res) => {
  guard(res, 'owner');
  const server = mcpById(req.params.id);
  if (!server.oauth) throw new Error('OAuth 로그인을 쓰는 서버가 아니에요.');
  const url = await startLogin(server, `${req.protocol}://${req.get('host')}`);
  if (!url) {
    closeConnection(server.id);
    await refreshTools(server);
  }
  store.emit('mcp.changed', { payload: { summary: `MCP 로그인 시작: ${server.name}` } });
  res.json({ url });
});

app.delete('/api/mcp-servers/:id/login', (req, res) => {
  guard(res, 'owner');
  const server = mcpById(req.params.id);
  logout(server.id);
  closeConnection(server.id);
  store.emit('mcp.changed', { payload: { summary: `MCP 로그아웃: ${server.name}` } });
  res.json({ ok: true });
});

const callbackPage = (title: string, detail: string) =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font-family:sans-serif;padding:32px"><h2>${title}</h2><p>${detail}</p><p>이 창을 닫고 사무실로 돌아가세요.</p><script>setTimeout(()=>window.close(),3000)</script></body>`;

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

app.get(OAUTH_CALLBACK_PATH, async (req, res) => {
  guard(res, 'owner');
  const { code, state, error } = req.query;
  try {
    if (typeof error === 'string') throw new Error(`로그인이 취소됐어요 (${error}).`);
    if (typeof code !== 'string' || typeof state !== 'string') throw new Error('로그인 응답이 올바르지 않아요.');
    const serverId = await finishLogin(state, code, (id) => store.data.mcpServers.find((m) => m.id === id));
    const server = mcpById(serverId);
    closeConnection(serverId);
    store.emit('mcp.changed', { payload: { summary: `MCP 로그인 완료: ${server.name}` } });
    background(async () => void (await refreshTools(server)), `${server.name} 도구 확인`);
    res.type('html').send(callbackPage('로그인 완료', `${escapeHtml(server.name)}에 연결했어요. 도구 목록을 불러오고 있어요.`));
  } catch (e) {
    res.status(400).type('html').send(callbackPage('로그인 실패', escapeHtml(e instanceof Error ? e.message : String(e))));
  }
});

app.put('/api/plan', (req, res) => {
  guard(res, 'owner');
  if (!isPlan(req.body?.plan)) throw new Error('알 수 없는 플랜이에요.');
  if (billingProvider()) throw new Error('결제가 연결되어 있어서 플랜은 결제나 구독 해지로 바꿔요.');
  store.mutate((s) => {
    s.plan = req.body.plan;
  });
  store.emit('plan.changed', { payload: { plan: req.body.plan } });
  closeRevokedSockets();
  res.json({ plan: store.data.plan });
});

app.put('/api/language', (req, res) => {
  guard(res, 'owner');
  if (!isLanguage(req.body?.language)) throw new Error('지원하지 않는 언어예요.');
  store.mutate((s) => {
    s.language = req.body.language as Language;
  });
  store.emit('language.changed', { payload: { language: req.body.language } });
  closeRevokedSockets();
  res.json({ language: store.data.language });
});

app.post('/api/members', (req, res) => {
  guard(res, 'owner');
  res.json(createMember(req.body ?? {}));
});

app.put('/api/members/:id', (req, res) => {
  guard(res, 'owner');
  const member = updateMember(req.params.id, req.body ?? {});
  closeRevokedSockets();
  res.json(member);
});

app.delete('/api/members/:id', (req, res) => {
  guard(res, 'owner');
  deleteMember(req.params.id);
  closeRevokedSockets();
  res.json({ ok: true });
});

app.post('/api/chat', (req, res) => {
  res.json(postChat(viewerOfRes(res), req.body ?? {}));
});

app.post('/api/chat/:id/forward', async (req, res) => {
  const mode = req.body?.mode;
  if (mode !== 'note' && mode !== 'answer' && mode !== 'changes') throw new Error('전달 방식을 골라 주세요.');
  res.json(
    await forwardChat(viewerOfRes(res), req.params.id, mode, {
      answer: (taskId, text) => workflowRuntime.answerHelp(taskId, text),
      changes: (taskId, text) => workflowRuntime.requestChanges(taskId, text),
    }),
  );
});

app.put('/api/tasks/:id/assignee', (req, res) => {
  guard(res, 'operate', officeOfTask(req.params.id));
  const assigneeId = req.body?.assigneeId;
  res.json(setAssignee(req.params.id, typeof assigneeId === 'string' && assigneeId ? assigneeId : null));
});

app.get('/api/activity/export', async (req, res) => {
  guard(res, 'owner');
  const file = await exportActivity(req.query.from, req.query.to, req.query.format);
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.type(file.type).send(file.body);
});

app.post('/api/billing/checkout', async (req, res) => {
  guard(res, 'owner');
  if (!isPlan(req.body?.plan)) throw new Error('알 수 없는 플랜이에요.');
  // The site sends the browser back here with the license; PUBLIC_URL when set, else the address in use.
  const base = config.publicUrl || `${req.protocol}://${req.get('host')}`;
  res.json(await startCheckout(req.body.plan, `${base}/billing/return`));
});

// The browser comes back from the site's checkout with the license in the query.
app.get('/billing/return', async (req, res) => {
  guard(res, 'owner');
  try {
    await applyLicense(String(req.query.license ?? ''), typeof req.query.ref === 'string' ? req.query.ref : undefined);
    res.redirect('/?billing=success');
  } catch (error) {
    console.warn('license from checkout refused:', error instanceof Error ? error.message : error);
    res.redirect('/?billing=failed');
  }
});

// A license key pasted by hand (an install the browser cannot reach back to, or moving a license).
app.post('/api/billing/license', async (req, res) => {
  guard(res, 'owner');
  if (typeof req.body?.token !== 'string') throw new Error('라이선스 키를 붙여 넣어 주세요.');
  await applyLicense(req.body.token);
  res.json(billingInfo());
});

app.post('/api/billing/cancel', async (_req, res) => {
  guard(res, 'owner');
  await cancelSubscription();
  res.json(billingInfo());
});

app.post('/api/billing/resume', async (_req, res) => {
  guard(res, 'owner');
  await resumeSubscription();
  res.json(billingInfo());
});

app.get('/billing/mock-checkout/:id', (req, res) => {
  guard(res, 'owner');
  if (billingProvider()?.id !== 'mock') throw new Error('모의 결제가 켜져 있지 않아요.');
  const checkout = store.data.billing.checkouts.find((c) => c.id === req.params.id && c.status === 'open');
  if (!checkout) return res.redirect('/?billing=expired');
  res.type('html').send(mockCheckoutPage(checkout.id, planOf(checkout.plan).label, checkout.amountKrw));
});

app.post('/billing/mock-checkout/:id', express.urlencoded({ extended: false }), async (req, res) => {
  guard(res, 'owner');
  if (billingProvider()?.id !== 'mock') throw new Error('모의 결제가 켜져 있지 않아요.');
  const outcome = req.body?.outcome === 'fail' ? 'fail' : req.body?.outcome === 'cancel' ? 'cancel' : 'pay';
  await completeMockCheckout(req.params.id, outcome);
  res.redirect(`/?billing=${outcome === 'pay' ? 'success' : outcome === 'fail' ? 'failed' : 'canceled'}`);
});

function mockCheckoutPage(id: string, planLabel: string, amountKrw: number) {
  return `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>모의 결제</title>
<style>
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center; background: #2b2438; font-family: system-ui, sans-serif; }
  form { background: #fff8ec; border: 3px solid #3a3045; box-shadow: 6px 6px 0 #1a1522; padding: 24px; width: min(340px, 86vw); }
  h1 { margin: 0 0 6px; font-size: 18px; } p { color: #5b4f63; font-size: 14px; }
  button { display: block; width: 100%; margin-top: 10px; font-size: 15px; padding: 10px; border: 2px solid #3a3045; box-shadow: 3px 3px 0 #3a3045; cursor: pointer; background: #fff; }
  button.pay { background: #f4c542; }
</style></head>
<body>
<form method="post" action="/billing/mock-checkout/${encodeURIComponent(id)}">
  <h1>🧪 모의 결제</h1>
  <p>실제 돈은 나가지 않아요. 결제사 연결 전에 흐름을 시험하는 화면이에요.</p>
  <p><b>${planLabel} 플랜</b> · 월 ${amountKrw.toLocaleString('ko-KR')}원</p>
  <button class="pay" name="outcome" value="pay">결제 성공으로 처리</button>
  <button name="outcome" value="fail">결제 실패로 처리</button>
  <button name="outcome" value="cancel">취소하고 돌아가기</button>
</form>
</body></html>`;
}

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
setInterval(() => background(() => billingTick(), '구독 확인'), 60 * 60 * 1000);

store.subscribe((message) => {
  if (message.kind === 'event') chatNews(message.data);
});

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
    closeAllConnections();
    workflowRuntime
      .stop()
      .then(() => closeStorage())
      .catch((error) => console.error('[office] 실행기 종료 실패:', error))
      .finally(() => process.exit(0));
  });
}
