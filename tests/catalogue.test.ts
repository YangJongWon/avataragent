import assert from 'node:assert/strict';
import test from 'node:test';
import { CATALOGUE, LANGUAGES, TEMPLATES, translate } from '../shared/i18n.ts';

/**
 * 카탈로그 전체를 훑는 상수 검증. 이 파일은 문장을 하나씩 적어 확인할 수 없어
 * 대신 구조 불변식만 지킨다. 번역 품질(어색함 등)은 여기서 잡지 않는다.
 */
const TARGET_LANGUAGES = LANGUAGES.filter((l) => l.id !== 'ko');

// 번역 대상 key 인지를 본다. 'per 1M tok' 처럼 원문 자체가 영어인 항목은 대상이 아니다.
const hasCJK = (s: string) => /[\u3400-\u9FFF]/.test(s);
// 번역본에 한국어가 남아 있으면 사용자에게 한중일 어느 쪽도 아닌 문장으로 보인다.
const hasHangul = (s: string) => /[\uAC00-\uD7A3\u3130-\u318F]/.test(s);
// '예: 서원'은 사용자가 고를 한국어 이름을 그대로 안내하는 항목이라 예외다.
const carriesKoreanExample = (key: string) => key.includes('예:');

const entries: [string, string, Partial<Record<string, string>>][] = [
  ...Object.entries(CATALOGUE).map(([k, v]) => ['CATALOGUE', k, v] as [string, string, typeof v]),
  ...Object.entries(TEMPLATES).map(([k, v]) => ['TEMPLATES', k, v] as [string, string, typeof v]),
];

test('모든 문장에 중국어·일본어·영어 번역이 있다', () => {
  const missing: string[] = [];
  for (const [table, key, entry] of entries) {
    for (const l of TARGET_LANGUAGES) {
      const value = entry[l.id];
      if (value === undefined || value.trim() === '') missing.push(`${table} ${key} [${l.id}]`);
    }
  }
  assert.deepEqual(missing, [], `번역이 비었다:\n${missing.join('\n')}`);
});

test('번역이 한국어 그대로 남아 있지 않다', () => {
  const untranslated: string[] = [];
  for (const [table, key, entry] of entries) {
    if (!hasCJK(key)) continue;
    for (const l of TARGET_LANGUAGES) {
      if (entry[l.id] === key) untranslated.push(`${table} ${key} [${l.id}]`);
    }
  }
  assert.deepEqual(untranslated, [], `미번역:\n${untranslated.join('\n')}`);
});

test('번역본에 한국어 조각이 남아 있지 않다', () => {
  // ja 번역에 "…함숫부분이에요" 같은 한국어가 섞인 채로 들어온 적이 있다.
  const residues: string[] = [];
  for (const [table, key, entry] of entries) {
    if (carriesKoreanExample(key)) continue;
    for (const l of TARGET_LANGUAGES) {
      const value = String(entry[l.id] ?? '');
      if (hasHangul(value)) residues.push(`${table} ${key} [${l.id}] ${value}`);
    }
  }
  assert.deepEqual(residues, [], `번역에 한국어가 남았다:\n${residues.join('\n')}`);
});

test('t() 는 구멍이 남은 문장을 노출하지 않는다', () => {
  // TEMPLATES에는 "키에는 구멍이 없는데 번역 쪽에만 구멍이 있는" 항목이 있다(재료 감사로 실측).
  // 이런 항목은 tpl()로 불러야 하는데 t()로 열면 {title} 이 그대로 보인다.
  const leaked: string[] = [];
  for (const [, key] of entries) {
    if (key.includes('{')) continue; // 구멍이 있는 키는 애초에 t() 대상이 아니다.
    for (const l of TARGET_LANGUAGES) {
      const out = translate(key, l.id);
      if (out.includes('{') || out.includes('}')) leaked.push(`${key} [${l.id}] -> ${out}`);
    }
  }
  assert.deepEqual(leaked, [], `구멍이 노출됐다:\n${leaked.join('\n')}`);
});
