import assert from 'node:assert/strict';
import test from 'node:test';
import { localize, viewerText } from '../shared/i18n.ts';

test('a fixed server sentence reads in each viewer’s own language, whatever language AI output is set to', () => {
  const line = viewerText('{step} 중이에요.', { step: '자료 수집' });
  assert.equal(localize(line, 'ko'), '자료 수집 중이에요.');
  assert.doesNotMatch(localize(line, 'ja'), /[가-힣]/);

  // AI text inside stays as written.
  const said = viewerText('의견을 남기고 넘길게요: {reason}', { reason: '出典が不足しています' });
  assert.equal(localize(said, 'ko'), '의견을 남기고 넘길게요: 出典が不足しています');

  // Wrapped values (what approving did, inside "task done!") and several pieces in one text.
  const applied = [viewerText('추천 {n}개를 추천 보관함에 저장했어요.', { n: 3 }), viewerText('외부 작업 {n}건 실행', { n: 2 })].join(' · ');
  const done = viewerText('업무 완료! {applied}', { applied });
  assert.equal(localize(done, 'ko'), '업무 완료! 추천 3개를 추천 보관함에 저장했어요. · 외부 작업 2건 실행');
  assert.doesNotMatch(localize(done, 'en'), /[가-힣]/);

  // Plain text (older rows, AI output) is left alone.
  assert.equal(localize('휴게실에서 쉬고 있어요.', 'en'), '휴게실에서 쉬고 있어요.');
});
