import assert from 'node:assert/strict';
import { existsSync, mkdtempSync } from 'node:fs';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { McpServer as SdkServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import * as z from 'zod';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'avataragent-files-'));
process.env.AI_PROVIDER = 'mock';
process.env.MOCK_DELAY_MS = '5';
process.env.HELP_TIMEOUT_SEC = '600';

// A 1x1 PNG, as an image tool would return it.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function fakeMcp() {
  const server = new SdkServer({ name: 'painter', version: '1.0.0' });
  server.registerTool('draw', { description: '그림 그리기', inputSchema: { prompt: z.string() }, annotations: { readOnlyHint: true } }, async ({ prompt }) => ({
    content: [
      { type: 'text', text: `${prompt} 그림을 그렸어요.` },
      { type: 'image', data: PNG, mimeType: 'image/png' },
    ],
  }));
  return server;
}
const readBody = async (req: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
};
const http = createServer(async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  const server = fakeMcp();
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
const { closeAllConnections, discoverTools } = await import('../server/mcp.ts');
const { localWorkflowRuntime: runtime } = await import('../server/workflow-runtime.ts');
const { until } = await import('./runtime-contract.ts');
const { FILE_LIMITS, readTaskFile, removeTaskFiles, saveTaskFile, syncDraftFiles } = await import('../server/task-files.ts');

after(() => {
  closeAllConnections();
  http.close();
});

test('결과물의 코드 블록은 파일이 되고, 결과물이 바뀌면 새 코드로 바뀐다', async () => {
  const task = await runtime.createTask({ officeId: 'office_welfare', title: '파일 테스트', description: '', planMode: 'template' });
  syncDraftFiles(task.id, '설명\n\napp.py\n```python\nimport sys\nprint(1)\nprint(2)\n```\n\n```js\nconst a = 1;\nconst b = 2;\nconsole.log(a + b);\n```');
  assert.deepEqual(store.task(task.id).files?.map((f) => f.name), ['app.py', '파일 테스트-2.js']);
  const code = readTaskFile(task.id, store.task(task.id).files![0].id)!;
  assert.equal(code.data.toString(), 'import sys\nprint(1)\nprint(2)\n');
  syncDraftFiles(task.id, '```python\nprint(3)\nprint(4)\nprint(5)\n```');
  assert.deepEqual(store.task(task.id).files?.map((f) => f.name), ['파일 테스트.py'], '앞 결과물의 코드 파일은 지워진다');

  // Limits: an oversized file is skipped and the task goes on.
  assert.equal(saveTaskFile(task.id, { name: 'big.bin', data: Buffer.alloc(FILE_LIMITS.fileBytes + 1), source: 'mcp' }), null);
  removeTaskFiles(task.id);
  assert.equal(existsSync(join(process.env.DATA_DIR!, 'files', task.id)), false);
});

test('MCP 도구가 돌려준 이미지는 업무의 결과 파일로 남고, 조사 메모에는 저장한 파일 이름이 적힌다', async () => {
  store.mutate((s) => {
    s.mcpServers.push({ id: 'mcp_paint', name: '그림판', icon: '🎨', transport: 'http', url, command: '', args: [], enabled: true, officeIds: ['office_mgmt'], tools: [], checkedAt: null, lastError: null });
  });
  const tools = await discoverTools(store.data.mcpServers.find((m) => m.id === 'mcp_paint')!);
  store.mutate((s) => {
    s.mcpServers.find((m) => m.id === 'mcp_paint')!.tools = tools;
  });
  const task = await runtime.createTask({ officeId: 'office_mgmt', title: '고양이', description: '고양이 그림' });
  await until(() => ['awaiting_approval', 'awaiting_help'].includes(store.task(task.id).status), '승인 대기');
  if (store.task(task.id).status === 'awaiting_help') await runtime.answerHelp(task.id, null);
  await until(() => store.task(task.id).status === 'awaiting_approval', '승인 대기');

  const image = store.task(task.id).files?.find((f) => f.source === 'mcp');
  assert.ok(image, 'the image was kept');
  assert.equal(image.mime, 'image/png');
  assert.equal(image.origin, '그림판 · draw');
  assert.deepEqual(readTaskFile(task.id, image.id)!.data, Buffer.from(PNG, 'base64'));
  const notes = store.task(task.id).artifacts.filter((a) => a.kind === 'research').map((a) => a.content).join('\n');
  assert.match(notes, /파일 저장: draw-2\.png/);
  await runtime.approve(task.id);
  await until(() => store.task(task.id).status === 'completed', '완료');
});

test('그림 단계는 작성자가 적은 그림을 이미지 모델로 그려 결과 파일과 결과물에 넣고, 검토자는 그 그림을 본다', async () => {
  const { templatePlan } = await import('../shared/workflow.ts');
  const team = store.data.agents.filter((a) => a.officeId === 'office_support');
  const steps = templatePlan('support', 'image_create', team);
  assert.equal(steps.find((s) => s.kind === 'draft')?.imageModel, 'openai/gpt-image-1-mini', '이미지 생성 유형은 그림 모델을 가진 작성 단계로 시작한다');
  const task = await runtime.createTask({ officeId: 'office_support', title: '봄 이벤트 배너', description: '벚꽃 배너 2장', taskType: 'image_create', planMode: 'custom', steps });
  await until(() => ['awaiting_approval', 'awaiting_help'].includes(store.task(task.id).status), '승인 대기');
  if (store.task(task.id).status === 'awaiting_help') await runtime.answerHelp(task.id, null);
  await until(() => store.task(task.id).status === 'awaiting_approval', '승인 대기');
  const t = store.task(task.id);
  const pictures = t.files?.filter((f) => f.source === 'image') ?? [];
  assert.ok(pictures.length >= 1, 'a picture was drawn');
  assert.equal(pictures[0].mime, 'image/png');
  assert.equal(pictures[0].origin, 'openai/gpt-image-1-mini');
  const result = t.artifacts.filter((a) => a.kind === 'draft').at(-1)!.content;
  // A rejected first draft is drawn again; the result shows the latest picture.
  assert.ok(result.includes(`](/api/tasks/${task.id}/files/${pictures.at(-1)!.id}?inline=1)`), 'the result shows the picture');
  assert.equal(result.includes('```images'), false, 'the request block is taken out of the result');
  await runtime.approve(task.id);
  await until(() => store.task(task.id).status === 'completed', '완료');
});

test('모델이 받지 않는 비율은 받는 비율 중 가장 가까운 것으로 바꾼다', async () => {
  const { nearestAccepted } = await import('../server/images.ts');
  const rejection = 'No provider for openai/gpt-image-1-mini supports the requested parameter(s): aspect_ratio "16:9". Provider rejections: OpenAI: aspect_ratio: not supported. Accepted: 1:1, 3:2, 2:3, auto';
  assert.equal(nearestAccepted(rejection, '16:9'), '3:2');
  assert.equal(nearestAccepted(rejection, '9:16'), '2:3');
  assert.equal(nearestAccepted(rejection, '1:1'), '1:1');
  assert.equal(nearestAccepted('aspect_ratio: not supported. Accepted: auto', '16:9'), 'auto');
  assert.equal(nearestAccepted('some other error', '16:9'), null);
});
