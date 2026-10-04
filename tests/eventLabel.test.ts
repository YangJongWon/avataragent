import assert from 'node:assert/strict';
import test from 'node:test';
import { setActiveLanguage } from '../shared/i18n.ts';
import type { Language } from '../shared/i18n.ts';
import type { Agent, OfficeEvent } from '../shared/types.ts';
import { eventLabel } from '../web/src/format.ts';

/**
 * Every branch of `eventLabel()`. Kept as an explicit list rather than scraped from the
 * source so that adding a case without a test fails loudly instead of silently skipping.
 */
const EVENT_TYPES = [
  'task.created',
  'queue.started',
  'task.cancelled',
  'task.assigned',
  'task.started',
  'tool.started',
  'tool.completed',
  'mcp.called',
  'mcp.result',
  'mcp.failed',
  'mcp.changed',
  'task.designed',
  'artifact.created',
  'task.handed_off',
  'cost.recorded',
  'agent.help_requested',
  'agent.help_received',
  'agent.help_timed_out',
  'review.started',
  'review.rejected',
  'review.approved',
  'approval.requested',
  'approval.granted',
  'approval.denied',
  'value.recognized',
  'task.completed',
  'task.failed',
  'task.paused',
  'task.resumed',
  'rule.changed',
  'agent.hired',
  'agent.left',
  'budget.threshold_reached',
  'budget.exceeded',
  'team.applied',
  'mail.received',
  'inquiry.received',
  'office.updated',
  'office.created',
  'office.removed',
  'workflow.planned',
  'workflow.updated',
  'workflow.looped',
  'share.created',
  'share.revoked',
  'catalog.changed',
  'playbook.applied',
  'improvement.applied',
  'chat.forwarded',
  'task.assignee_changed',
  'plan.changed',
  'member.created',
  'member.updated',
  'member.removed',
  'billing.checkout_started',
  'billing.subscribed',
  'billing.renewed',
  'billing.payment_failed',
  'billing.checkout_canceled',
  'billing.cancel_scheduled',
  'billing.resumed',
] as const;

const LANGUAGES: Language[] = ['ko', 'zh', 'ja', 'en'];

const agent = (id: string, name: string) => ({ id, name }) as Agent;
const agents = new Map([
  ['a1', agent('a1', '민')],
  ['a2', agent('a2', '소이')],
]);

/** A payload with every field `eventLabel()` may read, so no branch sees `undefined`. */
const payload = {
  queued: false,
  title: '분기 보고서',
  attempt: 1,
  label: '요약',
  icon: '🧩',
  server: ' notion ',
  tool: 'search',
  approved: false,
  chars: 1234,
  reason: '출처 없음',
  summary: '3건 반영',
  kind: 'deck',
  version: 2,
  reviewed: true,
  rounds: 2,
  passed: false,
  dropped: 3,
  from: 'a1',
  to: 'a2',
  amountKrw: 12345,
  inputTokens: 1200,
  outputTokens: 340,
  question: '이 수치 출처는?',
  answer: '공시 자료입니다',
  assumption: '증가 추세로 가정',
  score: 88,
  estimatedKrw: 500000,
  comment: '표지를 고쳐 주세요',
  profitKrw: 90000,
  officeId: 'office_dev',
  subject: '정산 안내',
  steps: 5,
  note: '리서처 확인 필요',
  count: 1,
  max: 3,
  name: '뿌 doctr',
  changes: 4,
  auto: true,
  by: '민',
  author: '민',
  text: '이거 봐줘',
  plan: 'team',
};

const eventOf = (type: string, extra: Record<string, unknown> = {}) =>
  ({
    eventId: `e_${type}`,
    seq: 1,
    type,
    timestamp: '2026-01-01T00:00:00.000Z',
    projectId: 'p1',
    agentId: 'a1',
    payload: { ...payload, ...extra },
  }) as OfficeEvent;

test('모든 업무 이력 문구가 빈칸 없이 채워진다', () => {
  for (const language of LANGUAGES) {
    setActiveLanguage(language);
    for (const type of EVENT_TYPES) {
      const label = eventLabel(eventOf(type), agents);
      assert.ok(label.trim().length > 0, `${type} → ${language} 결과가 비어 있어요`);
      // 번역문에만 남은 표기가 있으면 번역 키와 변수를 잘못 연결한 것이다.
      const hole = label.match(/\{\w+\}/);
      assert.equal(hole, null, `${type} → ${language} 결과에 채워지지 않은 값이 있어요: ${hole?.[0]}`);
      assert.doesNotMatch(label, /\bundefined\b/, `${type} → ${language} 결과에 undefined 가 있어요`);
      assert.doesNotMatch(label, /\bNaN\b/, `${type} → ${language} 결과에 NaN 이 있어요`);
    }
  }
  setActiveLanguage('ko');
});

test('알 수 없는 이벤트 타입은 타입 이름을 그대로 보여준다', () => {
  for (const language of LANGUAGES) {
    setActiveLanguage(language);
    assert.equal(eventLabel(eventOf('some.future_event'), agents), 'some.future_event');
  }
  setActiveLanguage('ko');
});

test('문서 종류가 번역되어도 doc/deck/sheet 구분이 유지된다', () => {
  const kinds = [
    { kind: 'deck', ko: '슬라이드', en: 'slides', zh: '幻灯片' },
    { kind: 'doc', ko: '문서', en: 'document', zh: '文档' },
    { kind: 'sheet', ko: 'Excel', en: 'Excel', zh: 'Excel' },
  ];
  for (const { kind, ...words } of kinds) {
    for (const [language, word] of Object.entries(words)) {
      setActiveLanguage(language as Language);
      const label = eventLabel(eventOf('task.designed', { kind }), agents);
      assert.ok(label.includes(word), `${kind} → ${language} 에 "${word}" 가 있어야 해요. 실제: ${label}`);
    }
  }
  setActiveLanguage('ko');
});

test('예약 없이 다르게 배치되는 문장이 각 언어에서 자연스럽다', () => {
  // zh/ja는 어순이 달라 한글로 고정하면 깨진다.
  setActiveLanguage('en');
  assert.equal(eventLabel(eventOf('task.assigned'), agents), 'Assigned to 민');
  setActiveLanguage('ja');
  assert.equal(eventLabel(eventOf('task.assigned'), agents), '민にタスクを割り当て');
  setActiveLanguage('ko');
  assert.equal(eventLabel(eventOf('task.assigned'), agents), '민에게 업무 배정');
});

test('직원을 모르는 이벤트는 번역된 기본 이름을 쓴다', () => {
  const orphan = eventOf('task.paused');
  orphan.agentId = 'ghost';
  for (const [language, expected] of [
    ['ko', '직원 일시정지'],
    ['en', 'Staff paused'],
    ['zh', '员工 已暂停'],
    ['ja', '社員 を一時停止'],
  ] as [Language, string][]) {
    setActiveLanguage(language);
    assert.equal(eventLabel(orphan, agents), expected);
  }
  setActiveLanguage('ko');
});
