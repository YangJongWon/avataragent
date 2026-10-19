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

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'avataragent-gmail-'));
process.env.AI_PROVIDER = 'mock';
process.env.MOCK_DELAY_MS = '5';

// Google's Gmail MCP answers in this shape (search_threads: subject/snippet only; get_thread: full plain-text body).
const inbox = [
  { id: 't1', messages: [{ id: 'm1', subject: '다음 주 협업 미팅', sender: 'kim@partner.com', date: '2026-10-19', snippet: '화요일 2시…', labelIds: ['INBOX', 'UNREAD'] }] },
  { id: 't2', messages: [{ id: 'm2', subject: '견적서 회신 요청', sender: 'choi@vendor.com', date: '2026-10-18', snippet: '견적서를…', labelIds: ['INBOX'] }] },
  { id: 't3', messages: [{ id: 'm3', subject: '내가 보낸 답장', sender: 'me@company.com', date: '2026-10-18', snippet: '…', labelIds: ['SENT'] }] },
];
const searches: unknown[] = [];

function fakeGmail() {
  const server = new SdkServer({ name: 'fake-gmail', version: '1.0.0' });
  server.registerTool('search_threads', { inputSchema: { query: z.string().optional(), pageSize: z.number().optional() } }, async (args) => {
    searches.push(args);
    return { content: [{ type: 'text', text: JSON.stringify({ threads: inbox }) }] };
  });
  server.registerTool('get_thread', { inputSchema: { threadId: z.string(), messageFormat: z.string().optional() } }, async ({ threadId }) => {
    const thread = inbox.find((t) => t.id === threadId)!;
    return { content: [{ type: 'text', text: JSON.stringify({ ...thread, messages: thread.messages.map((m) => ({ ...m, plaintextBody: `${m.subject} 본문입니다.` })) }) }] };
  });
  return server;
}

const readBody = async (req: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
};
const http = createServer(async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  const server = fakeGmail();
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
const { importGmail, gmailServers } = await import('../server/gmail.ts');

after(() => {
  closeAllConnections();
  http.close();
});

test('the HR mailbox reads new Gmail messages once, with their bodies, as outside material', async () => {
  const server = { id: 'mcp_gmail', name: 'Gmail', icon: '✉️', transport: 'http' as const, url, command: '', args: [], enabled: true, officeIds: 'all' as const, tools: [], checkedAt: null, lastError: null };
  server.tools = (await discoverTools(server)) as never;
  store.mutate((s) => {
    s.mcpServers.push(server);
  });
  assert.deepEqual(gmailServers().map((s) => s.id), ['mcp_gmail']);

  await assert.rejects(importGmail('office_hr'), /Gmail MCP를 먼저/);
  store.updateOffice('office_hr', (o) => {
    o.gmailServerId = 'mcp_gmail';
  });

  assert.equal(await importGmail('office_hr'), 2, 'what I sent myself is left out');
  const mail = store.data.mailbox.find((m) => m.id === 'gmail_m1')!;
  assert.equal(mail.source, 'gmail');
  assert.equal(mail.from, 'kim@partner.com');
  assert.equal(mail.body, '다음 주 협업 미팅 본문입니다.');
  assert.equal(mail.processed, false);
  assert.match(String((searches[0] as { query: string }).query), /in:inbox/);

  assert.equal(await importGmail('office_hr'), 0, 'the same messages are not fetched twice');

  const { TEAM_SPECS } = await import('../server/teams.ts');
  const inputs = TEAM_SPECS.hr.gatherInputs('', 'office_hr');
  assert.match(inputs.text, /외부에서 온 내용/);
  assert.match(inputs.text, /받은 날짜: 2026-10-19/);
  assert.ok(inputs.ids.includes('gmail_m2'));
});
