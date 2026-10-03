import { VENDORS, type ModelEntry, type VendorProvider } from '../shared/models.ts';
import { config } from './config.ts';

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

const usesAgentPricing = () => config.provider === 'mock' || config.provider === 'agents';

export function costKrw(result: CompletionResult, model: ModelEntry) {
  const [priceIn, priceOut] = usesAgentPricing()
    ? [model.priceInPerMTokUsd, model.priceOutPerMTokUsd]
    : [config.priceInputPerMTokUsd, config.priceOutputPerMTokUsd];
  const usd = (result.inputTokens * priceIn + result.outputTokens * priceOut) / 1_000_000;
  return Math.round(usd * config.usdKrw * 100) / 100;
}

export async function complete(req: CompletionRequest): Promise<CompletionResult> {
  if (config.provider === 'mock') return mock(req);
  if (config.provider === 'agents') return callProvider(VENDORS[req.model.vendor].provider, req.model.apiModel, req);
  if (!config.model) throw new Error('AI_MODEL이 비어 있습니다. .env 파일에 모델 ID를 입력하거나 AI_PROVIDER=agents를 쓰세요.');
  return callProvider(config.provider, config.model, req);
}

function callProvider(provider: VendorProvider, model: string, req: CompletionRequest) {
  switch (provider) {
    case 'openai':
      return openaiCompatible('https://api.openai.com/v1/chat/completions', config.keys.openai, 'OpenAI', model, req);
    case 'xai':
      return openaiCompatible('https://api.x.ai/v1/chat/completions', config.keys.xai, 'xAI (Grok)', model, req);
    case 'anthropic':
      return anthropic(model, req);
    case 'gemini':
      return gemini(model, req);
  }
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
  if (!key) throw new Error(`${name} API 키가 없습니다. .env 파일을 확인해 주세요.`);
}

async function postJson(url: string, headers: Record<string, string>, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`AI 호출 실패 (${res.status}): ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function openaiCompatible(url: string, key: string, name: string, model: string, req: CompletionRequest): Promise<CompletionResult> {
  requireKey(key, name);
  const data = await postJson(
    url,
    { authorization: `Bearer ${key}` },
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

async function anthropic(model: string, req: CompletionRequest): Promise<CompletionResult> {
  requireKey(config.keys.anthropic, 'Anthropic');
  const data = await postJson(
    'https://api.anthropic.com/v1/messages',
    { 'x-api-key': config.keys.anthropic, 'anthropic-version': '2023-06-01' },
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

async function gemini(model: string, req: CompletionRequest): Promise<CompletionResult> {
  requireKey(config.keys.gemini, 'Gemini');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const data = await postJson(
    url,
    { 'x-goog-api-key': config.keys.gemini },
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
