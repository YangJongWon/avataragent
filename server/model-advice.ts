import { allModels, companyOf, DEFAULT_MODELS, isTier, MAX_TIER, MODEL_LABEL_MAX, tiersInUse, type ModelEntry, type Tier } from '../shared/models.ts';
import { complete, parseJson } from './ai.ts';
import { apiKeyFor } from './secrets.ts';

export interface ModelAdvice {
  label: string;
  tier: Tier;
  priceInPerMTokUsd: number;
  priceOutPerMTokUsd: number;
  /** ai: the company's model answered; table: built-in reference prices; guess: from the name only. */
  source: 'ai' | 'table' | 'guess';
  note: string;
  /** Built-in reference prices, shown next to an AI answer so the user can compare. */
  reference?: { priceInPerMTokUsd: number; priceOutPerMTokUsd: number };
}

/** USD per 1M tokens (input, output). Reference only: vendors change prices, so the UI asks the user to check. */
const REFERENCE_PRICES: [RegExp, Tier, number, number][] = [
  [/claude-(3-5-)?haiku|claude-haiku/, 1, 1, 5],
  [/claude-(3-7-|3-5-)?sonnet|claude-sonnet/, 2, 3, 15],
  [/claude-opus-4-[5-9]|claude-opus-5/, 3, 5, 25],
  [/claude-(3-)?opus|claude-opus/, 3, 15, 75],
  [/gpt-5(\.\d+)?-nano/, 1, 0.05, 0.4],
  [/gpt-5(\.\d+)?-mini/, 1, 0.25, 2],
  [/gpt-5(\.\d+)?-pro/, 3, 15, 120],
  [/gpt-5/, 2, 1.25, 10],
  [/gpt-4\.1-nano/, 1, 0.1, 0.4],
  [/gpt-4\.1-mini/, 1, 0.4, 1.6],
  [/gpt-4\.1/, 2, 2, 8],
  [/gpt-4o-mini/, 1, 0.15, 0.6],
  [/gpt-4o/, 2, 2.5, 10],
  [/o4-mini|o3-mini/, 2, 1.1, 4.4],
  [/^o3-pro/, 3, 20, 80],
  [/^o3/, 3, 2, 8],
  [/grok-[34](\.\d+)?-mini|grok-3-mini/, 1, 0.3, 0.5],
  [/grok-4(\.\d+)?-fast|grok-code-fast/, 1, 0.2, 0.5],
  [/grok-4(\.\d+)?-heavy/, 3, 6, 30],
  [/grok-[34]/, 2, 3, 15],
  [/gemini-[\d.]+-flash-lite/, 1, 0.1, 0.4],
  [/gemini-[\d.]+-flash/, 2, 0.3, 2.5],
  [/gemini-[\d.]+-pro/, 3, 1.25, 10],
  [/deepseek-reasoner/, 2, 0.55, 2.19],
  [/deepseek-chat|deepseek-v3/, 1, 0.27, 1.1],
  [/mistral-large/, 3, 2, 6],
  [/mistral-medium/, 2, 0.4, 2],
  [/mistral-small|ministral/, 1, 0.1, 0.3],
  [/solar-pro/, 2, 0.25, 0.25],
  [/solar-mini/, 1, 0.15, 0.15],
];

const LIGHT = /mini|nano|lite|haiku|flash|small|fast|8b|7b|3b|1b/i;
const TOP = /opus|pro|heavy|large|ultra|max|405b|70b|reasoner|o3$/i;

function tableAdvice(apiModel: string) {
  const id = apiModel.toLowerCase();
  const builtin = DEFAULT_MODELS.find((m) => m.apiModel === id);
  if (builtin) return { tier: builtin.tier, in: builtin.priceInPerMTokUsd, out: builtin.priceOutPerMTokUsd };
  const hit = REFERENCE_PRICES.find(([re]) => re.test(id));
  return hit ? { tier: hit[1], in: hit[2], out: hit[3] } : null;
}

function guessTier(apiModel: string): Tier {
  if (TOP.test(apiModel)) return 3;
  if (LIGHT.test(apiModel)) return 1;
  return 2;
}

export function labelFromId(apiModel: string) {
  return apiModel
    .replace(/^models\//, '')
    .replace(/-(\d{8}|\d{4}-\d{2}-\d{2}|latest|preview|exp)$/i, '')
    .split(/[-_/]/)
    .filter(Boolean)
    .map((part) => (/^[a-z]/.test(part) ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ')
    .slice(0, 30);
}

const clampPrice = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 10_000 ? Math.round(n * 1000) / 1000 : null;
};

/** The tiers in use and the models in each, so a new model is placed on the same ladder as the rest. */
const ladder = () =>
  tiersInUse()
    .map((tier) => `  ${tier}: ${allModels().filter((m) => m.tier === tier).map((m) => m.label).join(', ')}`)
    .join('\n');

const PROMPT = (company: string, apiModel: string) =>
  [
    `${company} API의 모델 "${apiModel}"을 사내 AI 직원 모델로 등록하려고 한다. 아는 범위에서 아래 JSON 하나만 출력해라.`,
    `{"label":"화면에 보일 모델 이름(${MODEL_LABEL_MAX}자 이내)","tier":1 이상의 정수,"priceInPerMTokUsd":숫자,"priceOutPerMTokUsd":숫자,"note":"근거나 불확실한 점 한 줄"}`,
    `- tier: 숫자가 클수록 똑똑하고 비싼 모델. 지금 쓰는 등급과 모델은 아래와 같다. 비슷한 수준이면 같은 숫자, 가장 위 모델보다 확실히 위면 그보다 큰 숫자(최대 ${MAX_TIER}).`,
    ladder(),
    '- 단가는 입력/출력 토큰 100만 개당 미국 달러 기준 공식 API 정가. 모르면 비슷한 모델로 추정하고 note에 "추정"이라고 써라.',
  ].join('\n');

/**
 * Fills a new model's label, tier and prices. Asks the model itself (then another model of the same
 * company) when a key is available; otherwise falls back to the reference table and the model name.
 */
export async function adviseModel(vendor: string, apiModel: string, { ask = complete, keyFor = apiKeyFor } = {}): Promise<ModelAdvice> {
  const company = companyOf(vendor);
  const table = tableAdvice(apiModel);
  const reference = table ? { priceInPerMTokUsd: table.in, priceOutPerMTokUsd: table.out } : undefined;
  const fallback = (): ModelAdvice =>
    table
      ? { label: labelFromId(apiModel), tier: table.tier, ...reference!, source: 'table', note: '내장 참고 가격표 값이에요. 회사 가격표에서 최신 단가를 확인해 주세요.' }
      : {
          label: labelFromId(apiModel),
          tier: guessTier(apiModel),
          priceInPerMTokUsd: 1,
          priceOutPerMTokUsd: 4,
          source: 'guess',
          note: '모델 이름으로만 등급을 추정했고 단가는 기본값이에요. 회사 가격표를 보고 고쳐 주세요.',
        };

  const hasKey = Boolean(keyFor(company)) || company.api === 'openai_compatible';
  if (!hasKey) return fallback();

  const sibling = allModels()
    .filter((m) => m.vendor === company.id && m.apiModel !== apiModel)
    .sort((a, b) => a.tier - b.tier || a.priceOutPerMTokUsd - b.priceOutPerMTokUsd)[0];
  const askers: ModelEntry[] = [
    { id: 'advice', vendor: company.id, tier: 2, label: apiModel, apiModel, priceInPerMTokUsd: 0, priceOutPerMTokUsd: 0 },
    ...(sibling ? [sibling] : []),
  ];
  for (const model of askers) {
    try {
      const result = await ask({ purpose: 'check', system: '너는 AI 모델 카탈로그 담당자다. JSON 하나만 출력한다.', user: PROMPT(company.name, apiModel), json: true, model, mockText: () => '{}', direct: true });
      const parsed = parseJson<Record<string, unknown>>(result.text, {});
      const tier = Number(parsed.tier);
      const priceIn = clampPrice(parsed.priceInPerMTokUsd);
      const priceOut = clampPrice(parsed.priceOutPerMTokUsd);
      if (!isTier(tier) || priceIn === null || priceOut === null) continue;
      return {
        label: (typeof parsed.label === 'string' && parsed.label.trim().slice(0, MODEL_LABEL_MAX)) || labelFromId(apiModel),
        tier,
        priceInPerMTokUsd: priceIn,
        priceOutPerMTokUsd: priceOut,
        source: 'ai',
        note: `${model.apiModel}에게 물어본 추정값이에요. ${typeof parsed.note === 'string' ? parsed.note.slice(0, 120) : ''}`.trim(),
        reference,
      };
    } catch {
      // Not a chat model, or the key cannot call it; try the next one.
    }
  }
  return fallback();
}
