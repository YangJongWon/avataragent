import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { McpServer as SdkServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import * as z from 'zod';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'avataragent-mcp-'));
process.env.AI_PROVIDER = 'mock';
process.env.MOCK_DELAY_MS = '5';
process.env.HELP_TIMEOUT_SEC = '600';

const calls: { tool: string; args: unknown; auth?: string }[] = [];

function fakeMcp(auth: string | undefined) {
  const server = new SdkServer({ name: 'fake', version: '1.0.0' });
  server.registerTool(
    'search',
    { description: '웹 검색', inputSchema: { query: z.string() }, annotations: { readOnlyHint: true } },
    async ({ query }) => {
      calls.push({ tool: 'search', args: { query }, auth });
      return { content: [{ type: 'text', text: `검색 결과: ${query} 관련 문서 3건` }] };
    },
  );
  server.registerTool('send_mail', { description: '메일 보내기', inputSchema: { to: z.string(), body: z.string() } }, async (args) => {
    calls.push({ tool: 'send_mail', args, auth });
    return { content: [{ type: 'text', text: 'sent' }] };
  });
  server.registerTool(
    'delete_all',
    { description: '모두 삭제', inputSchema: {}, annotations: { destructiveHint: true } },
    async () => ({ content: [{ type: 'text', text: 'deleted' }] }),
  );
  return server;
}

const readBody = async (req: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
};

const http = createServer(async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  const server = fakeMcp(req.headers.authorization);
  res.on('close', () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.method === 'POST' ? await readBody(req) : undefined);
});
await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}/mcp`;

const { store } = await import('../server/store.ts');
const { setMcpSecrets } = await import('../server/secrets.ts');
const { closeAllConnections, discoverTools } = await import('../server/mcp.ts');
const { localWorkflowRuntime: runtime } = await import('../server/workflow-runtime.ts');
const { until } = await import('./runtime-contract.ts');
const { allowedModes } = await import('../shared/mcp.ts');

after(() => {
  closeAllConnections();
  http.close();
});

test('MCP 도구를 확인하고 조사 단계에서 허용된 도구만 쓴다', async () => {
  store.mutate((s) => {
    s.mcpServers.push({
      id: 'mcp_test',
      name: '테스트 검색',
      icon: '🔎',
      transport: 'http',
      url,
      command: '',
      args: [],
      enabled: true,
      officeIds: ['office_dev'],
      tools: [],
      checkedAt: null,
      lastError: null,
    });
  });
  setMcpSecrets('mcp_test', { Authorization: 'Bearer secret-token-1234' });

  const tools = await discoverTools(store.data.mcpServers[0]);
  const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
  assert.equal(byName.search.mode, 'auto', '읽기 도구는 기본으로 조사 때 자동');
  assert.equal(byName.send_mail.mode, 'off', '읽기 표시가 없는 도구는 기본으로 꺼진다');
  assert.equal(byName.delete_all.destructive, true);
  assert.deepEqual(allowedModes(byName.delete_all), ['off', 'approval'], '위험 도구는 승인 후에만 쓸 수 있다');
  assert.deepEqual(allowedModes(byName.search), ['off', 'auto']);
  store.mutate((s) => {
    s.mcpServers[0].tools = tools;
  });

  const other = await runtime.createTask({ officeId: 'office_welfare', title: '다른 사무실', description: '' });
  const task = await runtime.createTask({ officeId: 'office_dev', title: '경쟁사 가격', description: '조사' });

  await until(() => store.task(task.id).status === 'awaiting_help', '도움 요청');
  await runtime.answerHelp(task.id, null);
  await until(() => store.task(task.id).status === 'awaiting_approval', '승인 대기');
  await until(() => store.task(other.id).status === 'awaiting_approval', '다른 사무실 승인 대기');

  assert.ok(calls.length >= 1);
  assert.ok(calls.every((c) => c.tool === 'search'), '허용된 도구만 호출한다');
  assert.equal(calls[0].auth, 'Bearer secret-token-1234', '비밀값은 헤더로 전달된다');
  assert.deepEqual(calls[0].args, { query: '경쟁사 가격' });

  const research = store.task(task.id).artifacts.filter((a) => a.kind === 'research');
  assert.ok(research.some((a) => a.content.includes('검색 결과: 경쟁사 가격')), '도구 결과가 조사 메모에 들어간다');
  assert.equal(store.task(other.id).artifacts.some((a) => a.content.includes('검색 결과')), false, '허용하지 않은 사무실은 쓰지 않는다');

  const snapshot = JSON.stringify(store.snapshot());
  assert.equal(snapshot.includes('secret-token-1234'), false, '비밀값은 스냅샷에 나가지 않는다');
  assert.ok(snapshot.includes('••••1234'));

  assert.equal(store.task(task.id).actions?.length ?? 0, 0, '승인 후 실행 도구가 없으면 외부 작업도 없다');
  await runtime.approve(task.id);
  await runtime.approve(other.id);
  await until(() => store.task(task.id).status === 'completed', '완료');
});

const { setActionEnabled } = await import('../server/orchestrator.ts');

async function untilApproval(title: string) {
  const task = await runtime.createTask({ officeId: 'office_dev', title, description: '반영' });
  await until(() => ['awaiting_help', 'awaiting_approval'].includes(store.task(task.id).status), '도움 요청 또는 승인 대기');
  if (store.task(task.id).status === 'awaiting_help') await runtime.answerHelp(task.id, null);
  await until(() => store.task(task.id).status === 'awaiting_approval', '승인 대기');
  return task.id;
}

test('승인 후 실행 도구는 제안만 되고 승인하면 한 번만 실행된다', async () => {
  store.mutate((s) => {
    const send = s.mcpServers[0].tools.find((t) => t.name === 'send_mail')!;
    send.mode = 'approval';
  });
  const sent = () => calls.filter((c) => c.tool === 'send_mail').length;

  const skippedId = await untilApproval('끄고 승인');
  const [proposed] = store.task(skippedId).actions ?? [];
  assert.equal(proposed?.tool, 'send_mail', '승인 후 실행 도구로 외부 작업을 제안한다');
  assert.equal(proposed.status, 'proposed');
  assert.equal(sent(), 0, '승인 전에는 실행하지 않는다');
  setActionEnabled(skippedId, proposed.id, false);
  await runtime.approve(skippedId);
  await until(() => store.task(skippedId).status === 'completed', '완료');
  assert.equal(store.task(skippedId).actions?.[0].status, 'skipped');
  assert.equal(sent(), 0, '끈 작업은 실행하지 않는다');

  const doneId = await untilApproval('승인하면 발송');
  await runtime.approve(doneId);
  await until(() => store.task(doneId).status === 'completed', '완료');
  assert.equal(store.task(doneId).actions?.[0].status, 'done');
  assert.equal(store.task(doneId).actions?.[0].result, 'sent');
  assert.equal(sent(), 1);
  assert.throws(() => setActionEnabled(doneId, store.task(doneId).actions![0].id, false), '끝난 업무의 작업은 바꿀 수 없다');

  const crashedId = await untilApproval('재시작 중 발송');
  store.updateTask(crashedId, (t) => {
    t.actions![0].status = 'running';
  });
  await runtime.approve(crashedId);
  await until(() => store.task(crashedId).status === 'completed', '완료');
  assert.equal(store.task(crashedId).actions?.[0].status, 'unknown', '실행 중에 끊긴 작업은 다시 보내지 않는다');
  assert.equal(sent(), 1);
});
