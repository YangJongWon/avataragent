import { API_KINDS, companyOf, type ApiKind, type ModelEntry } from '../shared/models.ts';
import { config } from './config.ts';
import { apiKeyFor } from './secrets.ts';
import { store } from './store.ts';

export type Purpose = 'plan' | 'brief' | 'research' | 'clarify' | 'draft' | 'review' | 'check';

export interface CompletionRequest {
  purpose: Purpose;
  system: string;
  user: string;
  json?: boolean;
  model: ModelEntry;
  mockText: () => string;
}

export interface CompletionResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

const usesAgentPricing = () => store.provider === 'mock' || store.provider === 'agents';

export function costKrw(result: CompletionResult, model: ModelEntry) {
  const [priceIn, priceOut] = usesAgentPricing()
    ? [model.priceInPerMTokUsd, model.priceOutPerMTokUsd]
    : [config.priceInputPerMTokUsd, config.priceOutputPerMTokUsd];
  const usd = (result.inputTokens * priceIn + result.outputTokens * priceOut) / 1_000_000;
  return Math.round(usd * config.usdKrw * 100) / 100;
}

interface Endpoint {
  api: ApiKind;
  name: string;
  key: string;
  baseUrl: string;
}

export async function complete(req: CompletionRequest): Promise<CompletionResult> {
  const provider = store.provider;
  if (provider === 'mock') return mock(req);
  if (provider === 'agents') {
    const company = companyOf(req.model.vendor);
    const endpoint = { api: company.api, name: company.name, key: apiKeyFor(company), baseUrl: company.baseUrl };
    return withRetry(() => callProvider(endpoint, req.model.apiModel, req), req.json);
  }
  if (!config.model) {
    throw new Error('AI_MODEL이 비어 있습니다. .env 파일에 모델 ID를 입력하거나, 모델 관리에서 "직원별 실제 AI"를 고르세요.');
  }
  const endpoint = { api: provider, name: API_KINDS[provider].name, key: config.keys[provider], baseUrl: '' };
  return withRetry(() => callProvider(endpoint, config.model, req), req.json);
}

class ProviderRequestError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
  }
}

const jsonObject = (text: string) => {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return false;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
  } catch {
    return false;
  }
};

async function withRetry(run: () => Promise<CompletionResult>, requireJson = false) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= config.aiMaxRetries; attempt++) {
    try {
      const result = await run();
      if (requireJson && !jsonObject(result.text)) {
        throw new ProviderRequestError('AI가 올바른 JSON 객체를 반환하지 않았습니다.', true);
      }
      return result;
    } catch (error) {
      lastError = error;
      const retryable = error instanceof ProviderRequestError ? error.retryable : error instanceof TypeError;
      if (!retryable || attempt >= config.aiMaxRetries) throw error;
      const delay = config.aiRetryBaseMs * 2 ** attempt + Math.round(Math.random() * 250);
      await sleep(delay);
    }
  }
  throw lastError;
}

const baseOf = (endpoint: Pick<Endpoint, 'api' | 'baseUrl'>) => {
  const base = (endpoint.api === 'openai_compatible' ? endpoint.baseUrl : API_KINDS[endpoint.api].base) ?? '';
  if (!base) throw new Error('OpenAI 호환 API는 주소(Base URL)가 필요해요. 모델 관리에서 입력해 주세요.');
  return base.replace(/\/+$/, '');
};

function callProvider(endpoint: Endpoint, model: string, req: CompletionRequest) {
  switch (endpoint.api) {
    case 'openai':
    case 'xai':
    case 'openai_compatible':
      return openaiCompatible(endpoint, model, req);
    case 'anthropic':
      return anthropic(endpoint, model, req);
    case 'gemini':
      return gemini(endpoint, model, req);
  }
}

/** Lists model ids the key can use; also serves as a connection test that costs no tokens. */
export async function listModels(endpoint: Endpoint): Promise<string[]> {
  if (endpoint.api !== 'openai_compatible') requireKey(endpoint.key, endpoint.name);
  const base = baseOf(endpoint);
  let ids: string[];
  if (endpoint.api === 'anthropic') {
    const data = await requestJson('GET', `${base}/models?limit=1000`, anthropicHeaders(endpoint.key));
    ids = (data.data ?? []).map((m: { id: string }) => m.id);
  } else if (endpoint.api === 'gemini') {
    const data = await requestJson('GET', `${base}/models?pageSize=1000`, { 'x-goog-api-key': endpoint.key });
    ids = (data.models ?? [])
      .filter((m: { supportedGenerationMethods?: string[] }) => m.supportedGenerationMethods?.includes('generateContent') ?? true)
      .map((m: { name: string }) => m.name.replace(/^models\//, ''));
  } else {
    const data = await requestJson('GET', `${base}/models`, endpoint.key ? { authorization: `Bearer ${endpoint.key}` } : {});
    ids = (data.data ?? data.models ?? []).map((m: { id?: string; name?: string }) => m.id ?? m.name ?? '');
  }
  return [...new Set(ids.filter(Boolean))].sort();
}

export function parseJson<T>(text: string, fallback: T): T {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return fallback;
  try {
    return { ...fallback, ...(JSON.parse(text.slice(start, end + 1)) as Partial<T>) };
  } catch {
    return fallback;
  }
}

function requireKey(key: string, name: string) {
  if (!key) throw new Error(`${name} API 키가 없습니다. 모델 관리에서 키를 등록하거나 .env 파일을 확인해 주세요.`);
}

const postJson = (url: string, headers: Record<string, string>, body: unknown) => requestJson('POST', url, headers, body);

async function requestJson(method: 'GET' | 'POST', url: string, headers: Record<string, string>, body?: unknown) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.aiTimeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      const retryable = res.status === 408 || res.status === 409 || res.status === 429 || res.status >= 500;
      throw new ProviderRequestError(`AI 호출 실패 (${res.status}): ${text.slice(0, 300)}`, retryable);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new ProviderRequestError('AI 제공자가 JSON이 아닌 HTTP 응답을 반환했습니다.', true);
    }
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (controller.signal.aborted) throw new ProviderRequestError(`AI 호출이 ${config.aiTimeoutMs}ms 제한시간을 넘었습니다.`, true);
    throw new ProviderRequestError(`AI 네트워크 호출 실패: ${error instanceof Error ? error.message : String(error)}`, true);
  } finally {
    clearTimeout(timer);
  }
}

async function openaiCompatible(endpoint: Endpoint, model: string, req: CompletionRequest): Promise<CompletionResult> {
  if (endpoint.api !== 'openai_compatible') requireKey(endpoint.key, endpoint.name);
  const data = await postJson(
    `${baseOf(endpoint)}/chat/completions`,
    endpoint.key ? { authorization: `Bearer ${endpoint.key}` } : {},
    {
      model,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
      ...(req.json ? { response_format: { type: 'json_object' } } : {}),
    },
  );
  return {
    text: data.choices?.[0]?.message?.content ?? '',
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };
}

const anthropicHeaders = (key: string) => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01' });

async function anthropic(endpoint: Endpoint, model: string, req: CompletionRequest): Promise<CompletionResult> {
  requireKey(endpoint.key, endpoint.name);
  const data = await postJson(
    `${baseOf(endpoint)}/messages`,
    anthropicHeaders(endpoint.key),
    {
      model,
      max_tokens: 4096,
      system: req.system,
      messages: [{ role: 'user', content: req.user }],
    },
  );
  const text = (data.content ?? [])
    .filter((c: { type: string }) => c.type === 'text')
    .map((c: { text: string }) => c.text)
    .join('');
  return { text, inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0 };
}

async function gemini(endpoint: Endpoint, model: string, req: CompletionRequest): Promise<CompletionResult> {
  requireKey(endpoint.key, endpoint.name);
  const url = `${baseOf(endpoint)}/models/${encodeURIComponent(model)}:generateContent`;
  const data = await postJson(
    url,
    { 'x-goog-api-key': endpoint.key },
    {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: 'user', parts: [{ text: req.user }] }],
      ...(req.json ? { generationConfig: { responseMimeType: 'application/json' } } : {}),
    },
  );
  const text = (data.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('');
  return {
    text,
    inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function mock(req: CompletionRequest): Promise<CompletionResult> {
  await sleep(config.mockDelayMs * (0.7 + Math.random() * 0.6));
  const text = req.mockText();
  return {
    text,
    inputTokens: Math.round((req.system.length + req.user.length) / 2),
    outputTokens: Math.round(text.length / 2),
  };
}
