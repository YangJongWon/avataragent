import type { EmoteRule, Interaction } from './theme-pack.ts';
import type { Role } from './types.ts';

/**
 * What every office shows unless its theme says otherwise. A theme's own rules are read first,
 * so a theme replaces any of these by writing a rule for the same situation (with `"icon": null` to hide one).
 */
const WORK_GLYPH: Record<Role, string> = { manager: '📋', researcher: '🔍', writer: '✏️', reviewer: '🧐' };
const LOUNGE_GLYPH: Record<Role, string> = { manager: '☕', researcher: '📖', writer: '💧', reviewer: '☕' };
const roles = Object.keys(WORK_GLYPH) as Role[];

export const DEFAULT_EMOTES: EmoteRule[] = [
  { when: { status: ['help_requested'] }, icon: { text: '?', color: '#f39c12' } },
  { when: { status: ['awaiting_approval'] }, icon: { text: '!', color: '#3498db' } },
  { when: { status: ['error'] }, icon: { text: '!', color: '#e74c3c' } },
  { when: { status: ['paused'] }, icon: { text: 'II', color: '#7f8c8d' } },
  { when: { expression: ['celebrate'] }, icon: { text: '⭐' } },
  { when: { expression: ['thanks'] }, icon: { text: '💗' } },
  ...roles.map((role): EmoteRule => ({ when: { status: ['working'], role: [role] }, icon: { text: WORK_GLYPH[role] } })),
  ...roles.map((role): EmoteRule => ({ when: { place: ['lounge'], walking: false, role: [role] }, icon: { text: LOUNGE_GLYPH[role] } })),
];

export const DEFAULT_INTERACTIONS: Interaction[] = [
  {
    id: 'greet',
    label: '인사하기',
    hidden: false,
    reactions: [
      { when: { status: ['help_requested', 'error'] }, state: 'troubled', say: ['지금 좀 곤란해요…', '도와주실 수 있어요?'], effect: 'sweat' },
      { when: { status: ['working', 'collaborating'] }, state: 'focus', say: ['네! 열심히 하는 중이에요', '조금만 기다려 주세요!'] },
      { when: { status: ['paused'] }, state: 'idle', say: ['잠깐 쉬고 있어요'] },
      { when: { hours: [5, 11] }, state: 'smile', say: ['좋은 아침이에요!', '오늘도 잘 부탁드려요!'], effect: 'notes' },
      { when: { hours: [11, 14] }, state: 'smile', say: ['점심은 드셨어요?', '안녕하세요!'] },
      { when: { hours: [18, 24] }, state: 'smile', say: ['오늘도 수고 많으셨어요!', '좋은 저녁이에요'] },
      { when: { hours: [0, 5] }, state: 'sweat', say: ['이 시간까지…? 무리하지 마세요'], effect: 'zzz' },
      { state: 'smile', say: ['안녕하세요!', '반가워요!'], effect: 'hearts' },
    ],
  },
];
