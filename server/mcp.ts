import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { allowedModes, type McpServer, type McpTool } from '../shared/mcp.ts';
import { config } from './config.ts';
import { oauthProvider } from './mcp-oauth.ts';
import { mcpSecretsFor } from './secrets.ts';

const CLIENT_INFO = { name: 'avataragent-office', version: '0.1.0' };
const MAX_SCHEMA_CHARS = 1500;
const MAX_RESULT_CHARS = 4000;
const IDLE_CLOSE_MS = 5 * 60_000;

interface Connection {
  client: Client;
  stderr: () => string;
  idle?: ReturnType<typeof setTimeout>;
}

const connections = new Map<string, Promise<Connection>>();

function withTimeout<T>(job: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} 시간이 초과됐어요 (${Math.round(ms / 1000)}초).`)), ms);
  });
  return Promise.race([job, timeout]).finally(() => clearTimeout(timer));
}

async function open(server: McpServer): Promise<Connection> {
  const secrets = mcpSecretsFor(server.id);
  if (server.transport === 'stdio') {
    if (!config.mcpAllowStdio) throw new Error('실행 명령(stdio) MCP는 .env에 MCP_ALLOW_STDIO=1을 넣어야 쓸 수 있어요.');
    const transport = new StdioClientTransport({
      command: server.command,
      args: server.args,
      env: { ...getDefaultEnvironment(), ...secrets },
      stderr: 'pipe',
    });
    let log = '';
    transport.stderr?.on('data', (chunk: Buffer) => {
      log = (log + chunk.toString()).slice(-1500);
    });
    const client = new Client(CLIENT_INFO);
    await client.connect(transport);
    return { client, stderr: () => log };
  }

  const url = new URL(server.url);
  const options = { requestInit: { headers: secrets }, authProvider: server.oauth ? oauthProvider(server.id) : undefined };
  try {
    const client = new Client(CLIENT_INFO);
    await client.connect(new StreamableHTTPClientTransport(url, options));
    return { client, stderr: () => '' };
  } catch (streamableError) {
    if (streamableError instanceof UnauthorizedError) throw new Error(LOGIN_NEEDED);
    const client = new Client(CLIENT_INFO);
    try {
      await client.connect(new SSEClientTransport(url, options));
    } catch (sseError) {
      if (sseError instanceof UnauthorizedError) throw new Error(LOGIN_NEEDED);
      throw streamableError;
    }
    return { client, stderr: () => '' };
  }
}

const LOGIN_NEEDED = '로그인이 필요해요. MCP 관리에서 로그인을 눌러 주세요.';

async function connection(server: McpServer): Promise<Connection> {
  let pending = connections.get(server.id);
  if (!pending) {
    pending = withTimeout(open(server), config.mcpTimeoutMs * 2, `${server.name} 연결`);
    connections.set(server.id, pending);
    pending.catch(() => connections.delete(server.id));
  }
  const conn = await pending;
  clearTimeout(conn.idle);
  conn.idle = setTimeout(() => closeConnection(server.id), IDLE_CLOSE_MS);
  conn.idle.unref?.();
  return conn;
}

/** Drops the cached connection, e.g. after the server's address, command or secrets changed. */
export function closeConnection(serverId: string) {
  const pending = connections.get(serverId);
  connections.delete(serverId);
  pending?.then((conn) => {
    clearTimeout(conn.idle);
    return conn.client.close();
  }).catch(() => {});
}

export function closeAllConnections() {
  for (const id of [...connections.keys()]) closeConnection(id);
}

const describe = (error: unknown, conn?: Connection) => {
  const message = error instanceof UnauthorizedError ? LOGIN_NEEDED : error instanceof Error ? error.message : String(error);
  const log = conn?.stderr().trim();
  return log ? `${message}\n${log.split('\n').slice(-3).join('\n')}` : message;
};

function trimSchema(schema: unknown): Record<string, unknown> {
  const full = (schema && typeof schema === 'object' ? schema : { type: 'object' }) as Record<string, unknown>;
  if (JSON.stringify(full).length <= MAX_SCHEMA_CHARS) return full;
  const properties = (full.properties ?? {}) as Record<string, { type?: unknown; description?: unknown }>;
  return {
    type: 'object',
    properties: Object.fromEntries(
      Object.entries(properties)
        .slice(0, 15)
        .map(([key, prop]) => [key, { type: prop?.type, description: String(prop?.description ?? '').slice(0, 80) }]),
    ),
    required: full.required,
  };
}

/** Lists the server's tools, keeping the owner's on/off choices for tools seen before. */
export async function discoverTools(server: McpServer): Promise<McpTool[]> {
  let conn: Connection | undefined;
  try {
    conn = await connection(server);
    const { tools } = await withTimeout(conn.client.listTools(), config.mcpTimeoutMs, `${server.name} 도구 목록`);
    return tools.map((tool): McpTool => {
      const before = server.tools.find((t) => t.name === tool.name);
      const readOnly = tool.annotations?.readOnlyHint === true;
      const destructive = tool.annotations?.destructiveHint === true && !readOnly;
      const found: McpTool = {
        name: tool.name,
        description: (tool.description ?? '').slice(0, 300),
        inputSchema: trimSchema(tool.inputSchema),
        readOnly,
        destructive,
        mode: readOnly ? 'auto' : 'off',
      };
      if (before && allowedModes(found).includes(before.mode)) found.mode = before.mode;
      return found;
    });
  } catch (error) {
    closeConnection(server.id);
    throw new Error(describe(error, conn));
  }
}

/** Calls a tool and returns its text output, trimmed for the prompt. */
export async function callTool(server: McpServer, name: string, args: Record<string, unknown>): Promise<string> {
  let conn: Connection | undefined;
  try {
    conn = await connection(server);
    const result = await withTimeout(conn.client.callTool({ name, arguments: args }), config.mcpTimeoutMs, `${server.name} ${name}`);
    const parts = Array.isArray(result.content) ? result.content : [];
    const text = parts
      .map((part: { type?: string; text?: string; resource?: { text?: string; uri?: string } }) =>
        part.type === 'text' ? part.text : part.type === 'resource' ? (part.resource?.text ?? part.resource?.uri) : `[${part.type}]`,
      )
      .filter(Boolean)
      .join('\n')
      .slice(0, MAX_RESULT_CHARS);
    if (result.isError) throw new Error(text || '도구가 오류를 돌려줬어요.');
    return text || '(결과 없음)';
  } catch (error) {
    if (!conn) closeConnection(server.id);
    throw new Error(describe(error, conn));
  }
}
