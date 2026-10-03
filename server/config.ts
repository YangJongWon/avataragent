try {
  process.loadEnvFile('.env');
} catch {
  // .env is optional; defaults below run the mock provider.
}

const num = (key: string, fallback: number) => {
  const raw = process.env[key];
  const value = raw === undefined || raw === '' ? NaN : Number(raw);
  return Number.isFinite(value) ? value : fallback;
};

// 'agents' routes each agent to its own model family; the others send every call to AI_MODEL.
export type ProviderName = 'mock' | 'agents' | 'openai' | 'anthropic' | 'gemini' | 'xai';

const provider = (process.env.AI_PROVIDER ?? 'mock').toLowerCase() as ProviderName;

function tenantId(raw: string | undefined) {
  const id = raw?.trim() || 'default';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error('TENANT_ID는 영문, 숫자, -, _ 로 64자 이내여야 합니다.');
  return id;
}

export const config = {
  port: num('PORT', 8787),
  provider,
  model: process.env.AI_MODEL || '',
  keys: {
    openai: process.env.OPENAI_API_KEY ?? '',
    anthropic: process.env.ANTHROPIC_API_KEY ?? '',
    gemini: process.env.GEMINI_API_KEY ?? '',
    xai: process.env.XAI_API_KEY ?? '',
  },
  priceInputPerMTokUsd: num('PRICE_INPUT_PER_MTOK_USD', 1),
  priceOutputPerMTokUsd: num('PRICE_OUTPUT_PER_MTOK_USD', 4),
  usdKrw: num('USD_KRW', 1400),
  monthlyBudgetKrw: num('MONTHLY_BUDGET_KRW', 50000),
  hourlyRateKrw: num('HOURLY_RATE_KRW', 30000),
  helpTimeoutSec: num('HELP_TIMEOUT_SEC', 180),
  mockDelayMs: num('MOCK_DELAY_MS', 2500),
  autoRunIntervalSec: num('AUTO_RUN_INTERVAL_SEC', 30),
  aiTimeoutMs: num('AI_TIMEOUT_MS', 60_000),
  aiMaxRetries: Math.max(0, Math.min(5, Math.round(num('AI_MAX_RETRIES', 2)))),
  aiRetryBaseMs: num('AI_RETRY_BASE_MS', 750),
  dataDir: process.env.DATA_DIR || 'data',
  databaseUrl: process.env.DATABASE_URL?.trim() || '',
  /** Every stored row belongs to this tenant; servers with different tenants can share one database. */
  tenantId: tenantId(process.env.TENANT_ID),
  accessPassword: process.env.ACCESS_PASSWORD ?? '',
  publicUrl: (process.env.PUBLIC_URL ?? '').replace(/\/+$/, ''),
  /** stdio MCP servers run commands on this PC, so registering them must be switched on explicitly. */
  mcpAllowStdio: process.env.MCP_ALLOW_STDIO === '1',
  mcpTimeoutMs: num('MCP_TIMEOUT_MS', 30_000),
  /** LibreOffice for rendering exports so a vision model can check them; found on the usual paths when empty. */
  sofficePath: process.env.SOFFICE_PATH?.trim() || '',
  designReviewRounds: Math.max(1, Math.min(3, Math.round(num('DESIGN_REVIEW_ROUNDS', 2)))),
  workflowRuntime: process.env.WORKFLOW_RUNTIME === 'temporal' ? ('temporal' as const) : ('local' as const),
  temporal: {
    address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
    namespace: process.env.TEMPORAL_NAMESPACE || 'default',
    taskQueue: process.env.TEMPORAL_TASK_QUEUE || 'avataragent-tasks',
  },
};

export const ORGANIZATION_SAFETY_RULES = [
  '사실과 추정을 구분해서 쓴다.',
  '확인하지 못한 수치는 "추정" 또는 "확인 필요"로 표시한다.',
  '개인정보, 비밀키, 내부 비밀 정보를 결과물에 포함하지 않는다.',
  '외부로 메시지를 보내거나 게시하는 행동은 하지 않는다.',
];
