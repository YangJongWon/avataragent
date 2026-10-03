import type { Role } from './types.ts';

export type Vendor = 'claude' | 'gpt' | 'grok' | 'gemini';
export type Tier = 1 | 2 | 3;
export type VendorProvider = 'anthropic' | 'openai' | 'xai' | 'gemini';

export interface ModelEntry {
  id: string;
  vendor: Vendor;
  tier: Tier;
  label: string;
  apiModel: string;
  priceInPerMTokUsd: number;
  priceOutPerMTokUsd: number;
}

export const VENDORS: Record<Vendor, { name: string; hat: string; provider: VendorProvider }> = {
  claude: { name: 'Claude', hat: '주황 비니 + 스파크 문양', provider: 'anthropic' },
  gpt: { name: 'GPT', hat: '검정 야구모자 + 매듭 문양', provider: 'openai' },
  grok: { name: 'Grok', hat: '검정 헬멧 + 은빛 바이저', provider: 'xai' },
  gemini: { name: 'Gemini', hat: '파란 마법사 모자 + 별 문양', provider: 'gemini' },
};

export const TIER_LABEL: Record<Tier, string> = { 1: '경량', 2: '표준', 3: '최상위' };
export const TIER_HAT: Record<Tier, string> = { 1: '기본 모자', 2: '금테 장식', 3: '금테 + 보석 + 빛나는 오라' };

// apiModel ids and prices are editable defaults; check each vendor's current model list before real calls.
export const MODELS: ModelEntry[] = [
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
];

export const DEFAULT_MODEL_BY_ROLE: Record<Role, string> = {
  manager: 'claude-opus',
  researcher: 'gemini-flash',
  writer: 'gpt',
  reviewer: 'grok-mini',
};

export const isModelId = (id: string) => MODELS.some((m) => m.id === id);

export function modelOf(id: string): ModelEntry {
  return MODELS.find((m) => m.id === id) ?? MODELS.find((m) => m.id === 'claude-sonnet')!;
}
