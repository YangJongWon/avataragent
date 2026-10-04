import type { Role } from './types.ts';

/** Company id. Built-in: claude, gpt, grok, gemini; registered companies get `co_…` ids. */
export type Vendor = string;
export type Tier = 1 | 2 | 3;
export type ApiKind = 'anthropic' | 'openai' | 'xai' | 'gemini' | 'openai_compatible';
export type HatShape = 'beanie' | 'cap' | 'helmet' | 'wizard' | 'beret' | 'tophat' | 'bandana';
export type KeySource = 'saved' | 'env' | 'none';

export interface ModelEntry {
  id: string;
  vendor: Vendor;
  tier: Tier;
  label: string;
  apiModel: string;
  priceInPerMTokUsd: number;
  priceOutPerMTokUsd: number;
  builtin?: boolean;
}

export interface Company {
  id: Vendor;
  name: string;
  hat: HatShape;
  color: string;
  api: ApiKind;
  /** Only used by openai_compatible, e.g. https://api.deepseek.com/v1 */
  baseUrl: string;
  builtin?: boolean;
  /** Owner only; filled by the server, never the key itself. */
  key?: { source: KeySource; hint: string };
}

export interface SiteLink {
  label: string;
  url: string;
}

export const API_KINDS: Record<ApiKind, { name: string; env?: string; base?: string; links?: SiteLink[] }> = {
  anthropic: {
    name: 'Anthropic (Claude)',
    env: 'ANTHROPIC_API_KEY',
    base: 'https://api.anthropic.com/v1',
    links: [
      { label: 'API 키 발급', url: 'https://platform.claude.com/settings/keys' },
      { label: '결제·충전', url: 'https://platform.claude.com/settings/billing' },
      { label: '가격표', url: 'https://claude.com/pricing' },
    ],
  },
  openai: {
    name: 'OpenAI (GPT)',
    env: 'OPENAI_API_KEY',
    base: 'https://api.openai.com/v1',
    links: [
      { label: 'API 키 발급', url: 'https://platform.openai.com/api-keys' },
      { label: '결제·충전', url: 'https://platform.openai.com/settings/organization/billing/overview' },
      { label: '가격표', url: 'https://openai.com/api/pricing/' },
    ],
  },
  xai: {
    name: 'xAI (Grok)',
    env: 'XAI_API_KEY',
    base: 'https://api.x.ai/v1',
    links: [
      { label: 'API 키 발급·결제', url: 'https://console.x.ai/' },
      { label: '모델·가격표', url: 'https://docs.x.ai/developers/models' },
    ],
  },
  gemini: {
    name: 'Google Gemini',
    env: 'GEMINI_API_KEY',
    base: 'https://generativelanguage.googleapis.com/v1beta',
    links: [
      { label: 'API 키 발급', url: 'https://aistudio.google.com/app/apikey' },
      { label: '결제 설정', url: 'https://ai.google.dev/gemini-api/docs/billing' },
      { label: '가격표', url: 'https://ai.google.dev/gemini-api/docs/pricing' },
    ],
  },
  openai_compatible: { name: 'OpenAI 호환 (DeepSeek·Mistral·Ollama 등)' },
};

/** Well-known OpenAI-compatible services, used to pre-fill a new company and link to its key page. */
export const COMPATIBLE_SERVICES: { name: string; baseUrl: string; links: SiteLink[] }[] = [
  {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    links: [
      { label: 'API 키 발급', url: 'https://platform.deepseek.com/api_keys' },
      { label: '가격표', url: 'https://api-docs.deepseek.com/quick_start/pricing' },
    ],
  },
  {
    name: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    links: [
      { label: 'API 키 발급', url: 'https://console.mistral.ai/api-keys' },
      { label: '가격표', url: 'https://mistral.ai/pricing#api-pricing' },
    ],
  },
  {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    links: [
      { label: 'API 키 발급', url: 'https://openrouter.ai/settings/keys' },
      { label: '모델·가격', url: 'https://openrouter.ai/models' },
    ],
  },
  {
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    links: [
      { label: 'API 키 발급', url: 'https://console.groq.com/keys' },
      { label: '모델 목록', url: 'https://console.groq.com/docs/models' },
    ],
  },
  {
    name: 'Upstage',
    baseUrl: 'https://api.upstage.ai/v1',
    links: [
      { label: 'API 키 발급', url: 'https://console.upstage.ai/api-keys' },
      { label: '가격표', url: 'https://www.upstage.ai/pricing' },
    ],
  },
  {
    name: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    links: [
      { label: 'Ollama 설치', url: 'https://ollama.com/download' },
      { label: '모델 목록', url: 'https://ollama.com/library' },
    ],
  },
];

export function companyLinks(company: Pick<Company, 'api' | 'baseUrl'>): SiteLink[] {
  if (company.api !== 'openai_compatible') return API_KINDS[company.api].links ?? [];
  const host = (url: string) => {
    try {
      return new URL(url).host;
    } catch {
      return '';
    }
  };
  const target = host(company.baseUrl);
  return (target && COMPATIBLE_SERVICES.find((s) => host(s.baseUrl) === target)?.links) || [];
}

export const HATS: Record<HatShape, { name: string; color: string }> = {
  beanie: { name: '비니 + 스파크', color: '#d97757' },
  cap: { name: '야구모자 + 매듭', color: '#1f1f1f' },
  helmet: { name: '헬멧 + 바이저', color: '#2b2b2b' },
  wizard: { name: '마법사 모자 + 별', color: '#4c6ef5' },
  beret: { name: '베레모', color: '#c0392b' },
  tophat: { name: '실크햇 + 리본', color: '#5b3a8c' },
  bandana: { name: '두건 + 물방울', color: '#16a085' },
};

export const DEFAULT_COMPANIES: Company[] = [
  { id: 'claude', name: 'Claude', hat: 'beanie', color: HATS.beanie.color, api: 'anthropic', baseUrl: '', builtin: true },
  { id: 'gpt', name: 'GPT', hat: 'cap', color: HATS.cap.color, api: 'openai', baseUrl: '', builtin: true },
  { id: 'grok', name: 'Grok', hat: 'helmet', color: HATS.helmet.color, api: 'xai', baseUrl: '', builtin: true },
  { id: 'gemini', name: 'Gemini', hat: 'wizard', color: HATS.wizard.color, api: 'gemini', baseUrl: '', builtin: true },
];

export const TIER_LABEL: Record<Tier, string> = { 1: '경량', 2: '표준', 3: '최상위' };
export const TIER_HAT: Record<Tier, string> = { 1: '기본 모자', 2: '금테 장식', 3: '금테 + 보석 + 빛나는 오라' };

// apiModel ids and prices are editable defaults; check each vendor's current model list before real calls.
export const DEFAULT_MODELS: ModelEntry[] = [
  { id: 'claude-haiku', vendor: 'claude', tier: 1, label: 'Claude Haiku', apiModel: 'claude-haiku-4-5', priceInPerMTokUsd: 1, priceOutPerMTokUsd: 5 },
  { id: 'claude-sonnet', vendor: 'claude', tier: 2, label: 'Claude Sonnet', apiModel: 'claude-sonnet-4-5', priceInPerMTokUsd: 3, priceOutPerMTokUsd: 15 },
  { id: 'claude-opus', vendor: 'claude', tier: 3, label: 'Claude Opus', apiModel: 'claude-opus-4-1', priceInPerMTokUsd: 15, priceOutPerMTokUsd: 75 },
  { id: 'gpt-mini', vendor: 'gpt', tier: 1, label: 'GPT mini', apiModel: 'gpt-5-mini', priceInPerMTokUsd: 0.25, priceOutPerMTokUsd: 2 },
  { id: 'gpt', vendor: 'gpt', tier: 2, label: 'GPT', apiModel: 'gpt-5', priceInPerMTokUsd: 1.25, priceOutPerMTokUsd: 10 },
  { id: 'gpt-pro', vendor: 'gpt', tier: 3, label: 'GPT Pro', apiModel: 'gpt-5-pro', priceInPerMTokUsd: 15, priceOutPerMTokUsd: 120 },
  { id: 'grok-mini', vendor: 'grok', tier: 1, label: 'Grok mini', apiModel: 'grok-3-mini', priceInPerMTokUsd: 0.3, priceOutPerMTokUsd: 0.5 },
  { id: 'grok', vendor: 'grok', tier: 2, label: 'Grok', apiModel: 'grok-4', priceInPerMTokUsd: 3, priceOutPerMTokUsd: 15 },
  { id: 'grok-heavy', vendor: 'grok', tier: 3, label: 'Grok Heavy', apiModel: 'grok-4-heavy', priceInPerMTokUsd: 6, priceOutPerMTokUsd: 30 },
  { id: 'gemini-flash-lite', vendor: 'gemini', tier: 1, label: 'Gemini Flash-Lite', apiModel: 'gemini-2.5-flash-lite', priceInPerMTokUsd: 0.1, priceOutPerMTokUsd: 0.4 },
  { id: 'gemini-flash', vendor: 'gemini', tier: 2, label: 'Gemini Flash', apiModel: 'gemini-2.5-flash', priceInPerMTokUsd: 0.3, priceOutPerMTokUsd: 2.5 },
  { id: 'gemini-pro', vendor: 'gemini', tier: 3, label: 'Gemini Pro', apiModel: 'gemini-2.5-pro', priceInPerMTokUsd: 1.25, priceOutPerMTokUsd: 10 },
].map((m) => ({ ...m, tier: m.tier as Tier, builtin: true }));

export const DEFAULT_MODEL_BY_ROLE: Record<Role, string> = {
  manager: 'claude-opus',
  researcher: 'gemini-flash',
  writer: 'gpt',
  reviewer: 'grok-mini',
};

// Both server and browser keep the live catalog here so modelOf() stays synchronous.
let catalog = { companies: DEFAULT_COMPANIES, models: DEFAULT_MODELS };

export function setCatalog(companies: Company[], models: ModelEntry[]) {
  catalog = { companies, models };
}

export const allCompanies = () => catalog.companies;
export const allModels = () => catalog.models;
export const isModelId = (id: string) => catalog.models.some((m) => m.id === id);

export function modelOf(id: string): ModelEntry {
  return catalog.models.find((m) => m.id === id) ?? catalog.models.find((m) => m.id === 'claude-sonnet') ?? catalog.models[0] ?? DEFAULT_MODELS[1];
}

export function companyOf(id: Vendor): Company {
  return catalog.companies.find((c) => c.id === id) ?? DEFAULT_COMPANIES.find((c) => c.id === id) ?? DEFAULT_COMPANIES[0];
}

export const isHatShape = (v: unknown): v is HatShape => typeof v === 'string' && v in HATS;
export const isApiKind = (v: unknown): v is ApiKind => typeof v === 'string' && v in API_KINDS;
export const isColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
