import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  currentLanguage,
  detectLanguage,
  isLanguage,
  languageOf,
  localeOf,
  setActiveLanguage,
  t,
  translate,
  translateTemplate,
  tpl,
} from '../shared/i18n.ts';

test('한·중·일·영 네 개 언어를 모두 지원한다', () => {
  assert.deepEqual(
    LANGUAGES.map((l) => l.id),
    ['ko', 'zh', 'ja', 'en'],
  );
  for (const l of LANGUAGES) {
    assert.ok(isLanguage(l.id), `${l.id} 는 지원 언어여야 해요`);
    assert.ok(l.label.length > 0, `${l.id} 는 자기 이름으로 표시돼야 해요`);
    assert.match(l.locale, /^[a-z]{2}-[A-Z]{2}$/, `${l.id} 의 locale 형식이 올바라야 해요`);
  }
  assert.equal(DEFAULT_LANGUAGE, 'ko');
});

test('브라우저 언어 목록에서 가장 가까운 언어를 고른다', () => {
  assert.equal(detectLanguage(['ja-JP', 'en-US']), 'ja');
  assert.equal(detectLanguage(['zh-CN']), 'zh');
  assert.equal(detectLanguage(['ko']), 'ko');
  assert.equal(detectLanguage(['en-GB', 'ko-KR']), 'en');
  // 못 알아보는 언어만 있으면 기본값으로 돌아간다.
  assert.equal(detectLanguage(['fr-FR', 'de-DE']), DEFAULT_LANGUAGE);
  assert.equal(detectLanguage([]), DEFAULT_LANGUAGE);
});

test('알 수 없는 값은 언어 목록의 첫 항목으로 안전하게 처리한다', () => {
  assert.equal(isLanguage('kr'), false);
  assert.equal(isLanguage(undefined), false);
  assert.equal(languageOf(undefined).id, DEFAULT_LANGUAGE);
  assert.equal(localeOf(undefined), 'ko-KR');
});

test('번역이 없는 문장은 원문을 그대로 돌려준다', () => {
  const missing = '아직 번역하지 않은 문장이에요';
  for (const l of LANGUAGES) assert.equal(translate(missing, l.id), missing);
});

test('번역이 있는 문장은 선택한 언어로 나온다', () => {
  assert.equal(translate('환경 설정', 'ko'), '환경 설정');
  assert.equal(translate('환경 설정', 'ja'), '環境設定');
  assert.equal(translate('환경 설정', 'en'), 'Settings');
  assert.equal(translate('환경 설정', 'zh'), '环境设置');
  // 키가 한국어 원문이므로 영어로 번역되지 않은 키는 한국어로 남는다.
  assert.equal(translate('저장', 'en'), 'Save');
});

test('서로 다른 언어의 번역이 비어 있지 않다', () => {
  const sources = ['환경 설정', '화면 언어', '저장', '닫기', '예정', '현재 언어'];
  for (const source of sources) {
    for (const l of LANGUAGES) {
      const out = translate(source, l.id);
      assert.ok(out.trim().length > 0, `${source} → ${l.id} 번역이 비어 있어요`);
    }
  }
});

test('중괄값 자리를 채우고, 없는 값은 원래 표기를 남긴다', () => {
  assert.equal(translateTemplate('{who}에게 업무 배정', 'en', { who: '민' }), 'Assigned to 민');
  assert.equal(translateTemplate('{who}에게 업무 배정', 'ja', { who: '민' }), '민にタスクを割り当て');
  // 값이 없으면 빈칸이 아니라 {who} 가 그대로 남아 오류를 눈으로 확인할 수 있다.
  assert.equal(translateTemplate('{who}에게 업무 배정', 'en', {}), 'Assigned to {who}');
  assert.equal(translateTemplate('{who}에게 업무 배정', 'en', { who: null }), 'Assigned to {who}');
});

test('번역 없는 템플릿도 원문 그대로 채운다', () => {
  const missing = '{who}가 "{title}" 라고 함';
  assert.equal(translateTemplate(missing, 'en', { who: '민', title: '갑' }), '민가 "갑" 라고 함');
});

test('전역 활성 언어가 t/tpl 과 currentLanguage 에 반영된다', () => {
  assert.equal(currentLanguage(), DEFAULT_LANGUAGE);
  assert.equal(t('환경 설정'), '환경 설정');

  setActiveLanguage('en');
  assert.equal(currentLanguage(), 'en');
  assert.equal(t('환경 설정'), 'Settings');
  assert.equal(tpl('{who} 검수 통과', { who: '민', score: 92 }), '민 approved it (92)');
  // 번역이 없는 문장은 영어 화면에서도 한국어로 남는다.
  assert.equal(t('번역 없는 문구'), '번역 없는 문구');

  // 같은 값을 다시 넣어도 결과가 달라지지 않아야 렌더 중 호출해도 안전하다.
  setActiveLanguage('en');
  assert.equal(t('환경 설정'), 'Settings');

  setActiveLanguage(DEFAULT_LANGUAGE);
  assert.equal(t('환경 설정'), '환경 설정');
});

/** 번역한 탭은 화면에 그대로 나가는 한국어 문자열이.catalog 안에 있어야 한다. */
const LOCALIZED_SOURCES = [
  'web/src/components/HireTab.tsx',
  'web/src/components/ModelsTab.tsx',
  'web/src/components/PerformanceTab.tsx',
];

const SENTINELS = [
  'name', 'n', 'role', 'msg', 'env', 'who', 'in', 'out', 'names', 'provider', 'summary',
  'title', 'steps', 'from', 'to', 'count', 'max', 'reason', 'score', 'label', 'value',
  'attempt', 'tool', 'question', 'answer', 'assumption', 'kind', 'version', 'rounds', 'result',
  'comment', 'amount', 'inputTokens', 'outputTokens', 'profit', 'icon', 'server', 'chars',
  'subject', 'plan', 'changes', 'by', 'author', 'text',
].reduce<Record<string, string>>((acc, key) => ({ ...acc, [key]: `<${key}>` }), {});

test('번역한 탭의 t/tpl 키가 네 개 언어 모두에 등록돼 있다', () => {
  const problems: string[] = [];
  // 번역 대상은 한국어 원문뿐이다. 이미 라틴 문자만 있는 문구는 번역할 대상이 아니다.
  const needsTranslation = (key: string) => /[가-힣]/.test(key);

  for (const file of LOCALIZED_SOURCES) {
    const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

    // 이 호출은 {placeholder} 가 있는 문장이므로 템플릿 카탈로그에서 찾아야 한다.
    // 잘못된 카탈로그에 넣어도 컴파일은 통과하지만 화면에서는 한국어로 남는다.
    for (const m of src.matchAll(/\btpl\(\s*'((?:[^'\\]|\\.)*)'/g)) {
      const key = m[1];
      const ko = translateTemplate(key, 'ko', SENTINELS);
      for (const l of LANGUAGES) {
        const out = translateTemplate(key, l.id, SENTINELS);
        if (l.id !== 'ko' && needsTranslation(key) && out === ko) problems.push(`${file} [${l.id}] 템플릿 미등록: ${key}`);
        if (/[{}]/.test(out)) problems.push(`${file} [${l.id}] 치환되지 않은 중괄값: ${out}`);
      }
    }

    for (const m of src.matchAll(/(?<![a-zA-Z.])t\(\s*'((?:[^'\\]|\\.)*)'/g)) {
      const key = m[1];
      if (!needsTranslation(key)) continue;
      for (const l of LANGUAGES) {
        if (l.id !== 'ko' && translate(key, l.id) === key) problems.push(`${file} [${l.id}] 문장 미등록: ${key}`);
      }
    }
  }

  assert.deepEqual(problems, [], problems.join('\n'));
});

test('빈 칸이 없는 템플릿 문장은 t() 로도 읽힌다', () => {
  // 이 문장들에는 {placeholder} 가 없다. 이벤트 문구가 t() 를 쓰는 곳이 있어
  // 템플릿 카탈로그에 남은 문장도 문장 카탈로그처럼 해석돼야 한다.
  for (const key of ['검수 통과', '업무 완료', '사무실 개설', '결제 실패']) {
    for (const l of LANGUAGES) {
      const out = translate(key, l.id);
      assert.ok(out.trim().length > 0, `${key} → ${l.id} 번역이 비어 있어요`);
      if (l.id !== 'ko') assert.notEqual(out, key, `${key} 의 ${l.id} 번역을 t() 로 읽지 못했어요`);
    }
  }
  // 빈 칸이 있는 문장은 값을 채워야 하므로 t() 로 해석하지 않는다.
  assert.equal(translate('{who} 검수 통과', 'en'), '{who} 검수 통과');
});

test('화면 문자열 카탈로그에 중괄값이 있는 문장을 잘못 넣지 않는다', () => {
  // t()는 문자열 전체를 키로 보고, tpl()만 {placeholder} 를 해석한다.
  // 두 카탈로그가 섞이면 형식만 맞는 조용한 번역 실패가 된다.
  const withHoles = '{who} 검수 통과';
  assert.equal(translate(withHoles, 'en'), withHoles, '문장 카탈로그는 중괄값 문장을 받지 않아요');
  assert.equal(translateTemplate(withHoles, 'en', { who: '민', score: 1 }), '민 approved it (1)');
});