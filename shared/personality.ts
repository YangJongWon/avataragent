import { t } from './i18n.ts';
import type { Role } from './types.ts';

export type Personality = 'balanced' | 'careful' | 'fast' | 'creative' | 'friendly' | 'critical';

export interface PersonalityMeta {
  id: Personality;
  emoji: string;
  label: string;
  description: string;
  /** Added to the agent's system prompt; the organization safety rules still take priority. */
  prompt: string;
  /** One line the simulation adds to its output so the style shows without a real AI. */
  mockNote: string;
}

export const PERSONALITIES: PersonalityMeta[] = [
  {
    id: 'balanced',
    emoji: '⚖️',
    label: '균형형',
    description: '속도와 꼼꼼함을 적당히 맞춰요. 처음엔 이걸로 충분해요.',
    prompt: '속도와 품질의 균형을 맞춘다. 필요한 만큼만 자세히 쓰고, 중요한 불확실성은 표시한다.',
    mockNote: '균형형: 핵심과 근거를 적당한 분량으로 담았어요.',
  },
  {
    id: 'careful',
    emoji: '🔍',
    label: '꼼꼼형',
    description: '근거와 수치를 하나하나 확인하고, 애매하면 먼저 물어봐요. 대신 조금 느리고 길어요.',
    prompt:
      '정확성을 최우선으로 한다. 모든 주장에 근거나 출처 후보를 붙이고, 확인되지 않은 내용은 "확인 필요"로 표시한다. 요청이 애매하면 추측하지 말고 질문한다. 빠뜨린 항목이 없는지 마지막에 점검한다.',
    mockNote: '꼼꼼형: 항목마다 근거를 붙이고 확인이 필요한 부분을 따로 표시했어요.',
  },
  {
    id: 'fast',
    emoji: '⚡',
    label: '신속형',
    description: '핵심만 짧게, 빨리 끝내요. 토큰이 적게 들어 비용도 줄어요.',
    prompt: '핵심만 짧게 쓴다. 군더더기, 반복, 긴 서론을 빼고 결론과 다음 행동을 먼저 쓴다. 분량은 요청을 충족하는 최소한으로 한다.',
    mockNote: '신속형: 결론과 할 일만 짧게 추렸어요.',
  },
  {
    id: 'creative',
    emoji: '💡',
    label: '창의형',
    description: '뻔한 답 대신 새로운 관점과 대안을 함께 내놓아요.',
    prompt: '일반적인 답에 더해 새로운 관점, 대안, 의외의 아이디어를 1~2개 제시한다. 단, 사실과 추측을 구분해서 쓴다.',
    mockNote: '창의형: 기본안 외에 색다른 대안 하나를 덧붙였어요.',
  },
  {
    id: 'friendly',
    emoji: '😊',
    label: '친절형',
    description: '쉬운 말과 부드러운 말투로, 처음 보는 사람도 이해하게 써요.',
    prompt: '전문 용어는 풀어서 설명하고, 부드럽고 친절한 존댓말을 쓴다. 읽는 사람이 바로 따라 할 수 있게 예시를 든다.',
    mockNote: '친절형: 어려운 말을 풀어 쓰고 예시를 넣었어요.',
  },
  {
    id: 'critical',
    emoji: '🧐',
    label: '비판형',
    description: '약점, 위험, 반대 의견부터 짚어요. 검토 담당에게 잘 어울려요.',
    prompt: '결과물의 약점, 위험, 빠진 근거, 반대 논리를 먼저 찾아 구체적으로 지적한다. 칭찬보다 개선점을 우선하되 공정하게 평가한다.',
    mockNote: '비판형: 위험 요소와 반대 의견을 먼저 짚었어요.',
  },
];

/** Korean in `PERSONALITIES` is the catalogue key, so display goes through `t()`. */
export const personalityLabel = (id: Personality | undefined) => t(personalityOf(id).label);
export const personalityDescription = (id: Personality | undefined) => t(personalityOf(id).description);

export const DEFAULT_PERSONALITY_BY_ROLE: Record<Role, Personality> = {
  manager: 'balanced',
  researcher: 'careful',
  writer: 'balanced',
  reviewer: 'critical',
};

export const isPersonality = (v: unknown): v is Personality => PERSONALITIES.some((p) => p.id === v);
export const personalityOf = (id: Personality | undefined) => PERSONALITIES.find((p) => p.id === id) ?? PERSONALITIES[0];
