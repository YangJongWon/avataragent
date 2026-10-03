// MCP servers connect agents to outside tools (search, Notion, mail, ...).
// Secrets (tokens, API keys) are stored separately on the server and only shown as hints.

export type McpTransport = 'http' | 'stdio';

/**
 * off: never used. auto: agents may call it while researching.
 * approval: agents may only propose a call; it runs after the user approves the task.
 */
export type McpToolMode = 'off' | 'auto' | 'approval';

export const TOOL_MODE_LABEL: Record<McpToolMode, string> = {
  off: '끔',
  auto: '조사 때 자동',
  approval: '승인 후 실행',
};

export interface McpTool {
  name: string;
  description: string;
  /** JSON Schema of the arguments, trimmed for prompts. */
  inputSchema: Record<string, unknown>;
  /** The server marked this tool read-only (annotations.readOnlyHint). */
  readOnly: boolean;
  /** The server marked this tool destructive (annotations.destructiveHint). */
  destructive: boolean;
  /** New tools start as `auto` only when marked read-only, otherwise `off`. */
  mode: McpToolMode;
  /** Legacy on/off flag from before modes existed. */
  enabled?: boolean;
}

/** A tool call proposed with the draft and run only after the user approves the task. */
export interface PlannedAction {
  id: string;
  serverId: string;
  serverName: string;
  icon: string;
  tool: string;
  arguments: Record<string, unknown>;
  /** What the call does, in the agent's words. */
  summary: string;
  /** The user may switch off single actions before approving. */
  enabled: boolean;
  /**
   * running is persisted before the call starts. An action found `running` after a restart is
   * marked `unknown` instead of being called again, so external writes happen at most once.
   */
  status: 'proposed' | 'running' | 'done' | 'failed' | 'unknown' | 'skipped';
  result?: string;
}

export interface McpSecretInfo {
  name: string;
  hint: string;
}

export interface McpServer {
  id: string;
  name: string;
  icon: string;
  transport: McpTransport;
  /** http: endpoint URL (Streamable HTTP, falls back to SSE). */
  url: string;
  /** stdio: command and arguments started on the server PC. */
  command: string;
  args: string[];
  enabled: boolean;
  /** Offices whose agents may use the tools. */
  officeIds: 'all' | string[];
  tools: McpTool[];
  checkedAt: string | null;
  lastError: string | null;
  /** Names of stored secrets, sent as env vars (stdio) or headers (http). Values never leave the server. */
  secrets?: McpSecretInfo[];
  stats?: McpUsage;
  /** http only: sign in through the server's OAuth login instead of a fixed token. */
  oauth?: boolean;
  /** Snapshot-only OAuth state; tokens never leave the server. */
  login?: McpLoginInfo;
}

export interface McpUsage {
  calls: number;
  failures: number;
  lastUsedAt: string | null;
}

export interface McpLoginInfo {
  loggedIn: boolean;
  /** Access token expiry (ms). Refreshed automatically when a refresh token exists. */
  expiresAt: number | null;
}

export interface McpPreset {
  id: string;
  name: string;
  icon: string;
  transport: McpTransport;
  url?: string;
  command?: string;
  args?: string[];
  oauth?: boolean;
  /** Secret names the user needs to fill, with where to get them. */
  secrets: { name: string; label: string; placeholder?: string; prefix?: string }[];
  note: string;
}

export const MCP_PRESETS: McpPreset[] = [
  {
    id: 'brave-search',
    name: '웹 검색 (Brave)',
    icon: '🔎',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@brave/brave-search-mcp-server'],
    secrets: [{ name: 'BRAVE_API_KEY', label: 'Brave Search API 키', placeholder: 'BSA…' }],
    note: 'brave.com/search/api 에서 무료 키를 받을 수 있어요. 이 PC에 Node.js가 있어야 해요.',
  },
  {
    id: 'notion',
    name: 'Notion',
    icon: '📝',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@notionhq/notion-mcp-server'],
    secrets: [{ name: 'NOTION_TOKEN', label: 'Notion 통합 토큰', placeholder: 'ntn_…' }],
    note: 'notion.so/profile/integrations 에서 내부 통합을 만들고, 읽을 페이지에 그 통합을 연결해 주세요.',
  },
  {
    id: 'notion-remote',
    name: 'Notion (로그인)',
    icon: '📝',
    transport: 'http',
    url: 'https://mcp.notion.com/mcp',
    oauth: true,
    secrets: [],
    note: '저장한 뒤 로그인을 누르면 Notion 창에서 쓸 페이지를 고를 수 있어요. 토큰을 따로 만들 필요가 없어요.',
  },
  {
    id: 'github',
    name: 'GitHub',
    icon: '🐙',
    transport: 'http',
    url: 'https://api.githubcopilot.com/mcp/',
    secrets: [{ name: 'Authorization', label: 'GitHub 개인 액세스 토큰', placeholder: 'ghp_…', prefix: 'Bearer ' }],
    note: '읽기 권한만 있는 토큰을 권장해요.',
  },
  {
    id: 'fetch',
    name: '웹 페이지 읽기',
    icon: '🌐',
    transport: 'stdio',
    command: 'uvx',
    args: ['mcp-server-fetch'],
    secrets: [],
    note: '주소를 주면 페이지 내용을 읽어 와요. 이 PC에 uv(Python)가 있어야 해요.',
  },
  {
    id: 'custom',
    name: '직접 입력',
    icon: '🧩',
    transport: 'http',
    url: '',
    secrets: [],
    note: '메일·캘린더 등 다른 MCP 서버의 주소나 실행 명령을 직접 넣어요.',
  },
];

export const MCP_ICONS = ['🔎', '📝', '📧', '📅', '🐙', '🌐', '🗂️', '💬', '🧩', '🛠️'];

/** Read tools run freely; writes may wait for approval; destructive tools can only run after approval. */
export const allowedModes = (tool: McpTool): McpToolMode[] =>
  tool.readOnly ? ['off', 'auto'] : tool.destructive ? ['off', 'approval'] : ['off', 'auto', 'approval'];

export const isToolMode = (value: unknown): value is McpToolMode => value === 'off' || value === 'auto' || value === 'approval';

export const usableBy = (server: McpServer, officeId: string) =>
  server.enabled && (server.officeIds === 'all' || server.officeIds.includes(officeId));
