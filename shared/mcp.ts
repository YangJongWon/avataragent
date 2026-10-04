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
  /** Secret names the user needs to fill, with where to get them. `value` pre-fills a non-secret setting shown as plain text. */
  secrets: { name: string; label: string; placeholder?: string; prefix?: string; value?: string }[];
  note: string;
  /** Pages where the user creates the key, app or client; opened in a new tab. */
  links?: McpLink[];
}

export interface McpLink {
  label: string;
  url: string;
}

/** Secrets with these names are the pre-registered OAuth client for services without self-registration (e.g. Slack); never sent as headers. */
export const OAUTH_CLIENT_ID = 'OAUTH_CLIENT_ID';
export const OAUTH_CLIENT_SECRET = 'OAUTH_CLIENT_SECRET';
/** Space-separated scopes to request at login, for servers that do not advertise them. */
export const OAUTH_SCOPES = 'OAUTH_SCOPES';
export const isOAuthClientSecret = (name: string) => name === OAUTH_CLIENT_ID || name === OAUTH_CLIENT_SECRET || name === OAUTH_SCOPES;

const GMAIL_SCOPES = ['gmail.readonly', 'gmail.compose'].map((s) => `https://www.googleapis.com/auth/${s}`).join(' ');

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
    links: [
      { label: 'API 키 발급', url: 'https://api-dashboard.search.brave.com/app/keys' },
      { label: '요금제 안내', url: 'https://brave.com/search/api/' },
      { label: 'Node.js 설치', url: 'https://nodejs.org/ko/download' },
    ],
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
    links: [{ label: '통합 토큰 만들기', url: 'https://www.notion.so/profile/integrations' }],
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
    links: [{ label: 'Notion MCP 안내', url: 'https://developers.notion.com/guides/mcp/overview' }],
  },
  {
    id: 'github',
    name: 'GitHub',
    icon: '🐙',
    transport: 'http',
    url: 'https://api.githubcopilot.com/mcp/',
    secrets: [{ name: 'Authorization', label: 'GitHub 개인 액세스 토큰', placeholder: 'ghp_…', prefix: 'Bearer ' }],
    note: '읽기 권한만 있는 토큰을 권장해요.',
    links: [{ label: '토큰 만들기', url: 'https://github.com/settings/personal-access-tokens/new' }],
  },
  {
    id: 'slack',
    name: 'Slack',
    icon: '💬',
    transport: 'http',
    url: 'https://mcp.slack.com/mcp',
    oauth: true,
    secrets: [
      { name: OAUTH_CLIENT_ID, label: 'Slack 앱 Client ID', placeholder: '1234567890.1234567890' },
      { name: OAUTH_CLIENT_SECRET, label: 'Slack 앱 Client Secret' },
    ],
    note: 'api.slack.com/apps 에서 앱을 만들고 Client ID·Secret을 넣어 주세요. 앱의 OAuth & Permissions에 아래 Redirect URL을 등록하고, 워크스페이스 관리자가 MCP 사용을 허용해야 해요.',
    links: [{ label: '앱 만들기·Client ID 확인', url: 'https://api.slack.com/apps' }],
  },
  {
    id: 'gmail',
    name: 'Gmail',
    icon: '📧',
    transport: 'http',
    url: 'https://gmailmcp.googleapis.com/mcp/v1',
    oauth: true,
    secrets: [
      { name: OAUTH_CLIENT_ID, label: 'Google OAuth 클라이언트 ID', placeholder: '…apps.googleusercontent.com' },
      { name: OAUTH_CLIENT_SECRET, label: 'Google OAuth 클라이언트 보안 비밀', placeholder: 'GOCSPX-…' },
      { name: OAUTH_SCOPES, label: '요청할 권한', value: GMAIL_SCOPES },
    ],
    note: '구글 클라우드에서 ① Gmail API와 Gmail MCP API를 사용 설정하고 ② OAuth 동의 화면을 "외부·테스트"로 만들어 내 주소를 테스트 사용자로 넣고 ③ "웹 애플리케이션" 클라이언트에 아래 Redirect URL을 등록해 ID·보안 비밀을 넣어 주세요. 메일 읽기·검색과 임시보관함 초안 작성만 되고 발송은 안 돼요. 테스트 모드 로그인은 7일마다 다시 해야 해요.',
    links: [
      { label: '① Gmail API 사용', url: 'https://console.cloud.google.com/apis/library/gmail.googleapis.com' },
      { label: '① Gmail MCP API 사용', url: 'https://console.cloud.google.com/apis/library/gmailmcp.googleapis.com' },
      { label: '② 동의 화면·테스트 사용자', url: 'https://console.cloud.google.com/auth/audience' },
      { label: '③ 클라이언트 만들기', url: 'https://console.cloud.google.com/auth/clients' },
    ],
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
    links: [{ label: 'uv 설치 안내', url: 'https://docs.astral.sh/uv/getting-started/installation/' }],
  },
  {
    id: 'custom',
    name: '직접 입력',
    icon: '🧩',
    transport: 'http',
    url: '',
    secrets: [],
    note: '메일·캘린더 등 다른 MCP 서버의 주소나 실행 명령을 직접 넣어요.',
    links: [{ label: 'MCP 서버 목록', url: 'https://github.com/modelcontextprotocol/servers' }],
  },
];

export const MCP_ICONS = ['🔎', '📝', '📧', '📅', '🐙', '🌐', '🗂️', '💬', '🧩', '🛠️'];

/** Read tools run freely; writes may wait for approval; destructive tools can only run after approval. */
export const allowedModes = (tool: McpTool): McpToolMode[] =>
  tool.readOnly ? ['off', 'auto'] : tool.destructive ? ['off', 'approval'] : ['off', 'auto', 'approval'];

export const isToolMode = (value: unknown): value is McpToolMode => value === 'off' || value === 'auto' || value === 'approval';

export const usableBy = (server: McpServer, officeId: string) =>
  server.enabled && (server.officeIds === 'all' || server.officeIds.includes(officeId));
