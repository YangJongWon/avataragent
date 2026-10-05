import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { LANGUAGES, translateTemplate, type Vars } from '../shared/i18n.ts';
import { DEFAULT_MODELS } from '../shared/models.ts';
import { improvementReasonVars } from '../shared/performance.ts';

/**
 * `shared/performance.ts`가 만드는 개선 제안 이유는 PerformanceTab에서 동적으로
 * tpl()에 들어간다. 즉 리터럴 스캐너(i18n.test.ts)가 keys를 볼 수 없어서,
 * 여기에 따로 감수한다. runtime에 만들어지는 문장이라 카탈로그에 없으면
 * 한국어가 그대로 노출되고, 치환 실패면 `{score}` 같은 날짜가 화면에 남는다.
 */
const REASON_SOURCE = 'shared/performance.ts';

/** REASON 문장에 실제로 쓰이는 구멍. 값은 그대로 화면에 드러나므로 민감해야 한다. */
const HOLES: Vars = {
  score: '<score>',
  slow: '<slow>',
  count: '<count>',
  approved: '<approved>',
  checked: '<checked>',
  falsePasses: '<falsePasses>',
  personality: '<personality>',
  model: '<model>',
};

function reasonKeys(): string[] {
  const src = readFileSync(new URL(`../${REASON_SOURCE}`, import.meta.url), 'utf8');
  // REASON 상수만 본다. 파일 전체를 훑으면 주석 속 아포스트로피(agent's)가
  // 따옴표 짝을 깨뜨려 엉뚱한 문자열이 리터럴로 잡힌다.
  const block = /const REASON = \{([\s\S]*?)\} as const;/.exec(src);
  assert.ok(block, `${REASON_SOURCE}에서 REASON 상수를 찾지 못했다`);
  return [...block[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]).filter((s) => /\{[^}]+\}/.test(s));
}

test('개선 제안 이유 문장이 4개 언어에서 모두 치환된다', () => {
  const keys = reasonKeys();
  assert.ok(keys.length >= 8, `${REASON_SOURCE}에서 이유 문장을 ${keys.length}개 찾았다. REASON이 비었거나 형식이 바뀌었다.`);

  const problems: string[] = [];
  for (const key of keys) {
    const ko = translateTemplate(key, 'ko', HOLES);
    for (const l of LANGUAGES) {
      const out = translateTemplate(key, l.id, HOLES);
      if (l.id !== 'ko' && out === ko) problems.push(`${REASON_SOURCE} [${l.id}] 번역 없음: ${key}`);
      // 카탈로그 번역이 구멍을 잊거나 다른 이름을 쓰면 여기서 드러난다.
      if (/[{}]/.test(out)) problems.push(`${REASON_SOURCE} [${l.id}] 치환 안 된 구멍: ${out}`);
      for (const hole of Object.keys(HOLES)) {
        if (!key.includes(`{${hole}}`) && out.includes(`<${hole}>`)) problems.push(`${REASON_SOURCE} [${l.id}] 쓰지 않는 구멍 {${hole}}: ${out}`);
      }
    }
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('개선 제안 이유 문장은 카탈ogue에 템플릿으로 등록돼 있다', () => {
  // t()는 구멍이 있는 문장을 고의로 넘기지 않는다. PerformanceTab이 tpl()을 쓰는 이유다.
  for (const key of reasonKeys()) {
    for (const l of LANGUAGES) {
      const out = translateTemplate(key, l.id, HOLES);
      assert.ok(out.trim().length > 0, `${l.id} 번역이 비었다: ${key}`);
    }
  }
});

test('개선 이유 구멍의 성격·모델 id가 라벨로 바뀐다', () => {
  // 개선 적용 이벤트가 서버에서 넘어오면 이 자리에서 사람이 읽을 이름으로 바뀐다.
  const withPersonality = improvementReasonVars({ score: 70, personality: 'careful' });
  assert.equal(withPersonality.score, 70);
  assert.notEqual(withPersonality.personality, 'careful', '성격 id가 그대로 노출됐다');
  assert.ok(String(withPersonality.personality).length > 0);

  const modelId = DEFAULT_MODELS[0].id;
  const withModel = improvementReasonVars({ model: modelId });
  assert.equal(withModel.model, DEFAULT_MODELS[0].label);

  // 성격·모델이 없는 문장은 숫자 구멍만 그대로 둔다.
  assert.deepEqual(improvementReasonVars({ score: 1, slow: '<slow>' }), { score: 1, slow: '<slow>' });
});
