// MCP servers connect agents to outside tools (search, Notion, mail, ...).
// Secrets (tokens, API keys) are stored separately on the server and only shown as hints.

export type McpTransport = 'http' | 'stdio';

export interface McpTool {
  name: string;
  description: string;
  /** JSON Schema of the arguments, trimmed for prompts. */
  inputSchema: Record<string, unknown>;
  /** The server marked this tool read-only (annotations.readOnlyHint). */
  readOnly: boolean;
  /** The server marked this tool destructive (annotations.destructiveHint); such tools can never be enabled. */
  destructive: boolean;
  /** Agents may call it during research. New tools start enabled only when marked read-only. */
  enabled: boolean;
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
}

export interface McpPreset {
  id: string;
  name: string;
  icon: string;
  transport: McpTransport;
  url?: string;
  command?: string;
  args?: string[];
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

/** Destructive tools stay off; other non-read tools are enabled only after the owner confirms in the UI. */
export const canEnableTool = (tool: McpTool) => !tool.destructive;

export const usableBy = (server: McpServer, officeId: string) =>
  server.enabled && (server.officeIds === 'all' || server.officeIds.includes(officeId));
