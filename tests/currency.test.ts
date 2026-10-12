import assert from 'node:assert/strict';
import test from 'node:test';
import { setActiveLanguage } from '../shared/i18n.ts';
import { currencyFor, setDisplayCurrency } from '../web/src/currency.ts';
import { krw } from '../web/src/format.ts';

test('고른 통화가 있으면 API 환율로 KRW를 환산한다', () => {
  setDisplayCurrency('JPY', 0.11);
  assert.match(krw(50_000), /5,500/);
  assert.match(krw(50_000), /￥|¥/);
  setDisplayCurrency('USD', 0.00075);
  assert.match(krw(50_000), /\$37\.5/);
  setDisplayCurrency('KRW', null);
});

test('환율이 없으면 원화를 다른 통화로 가장하지 않는다', () => {
  setDisplayCurrency('JPY', null);
  assert.match(krw(50_000), /₩50,000/);
});

test('자동이면 화면 언어의 통화를 쓰고, 직접 고르면 언어와 상관없이 그 통화를 쓴다', () => {
  setActiveLanguage('ja');
  assert.equal(currencyFor('auto', 'ja'), 'JPY');
  assert.equal(currencyFor('auto', 'en'), 'USD');
  assert.equal(currencyFor('KRW', 'ja'), 'KRW');
  setActiveLanguage('ko');
});
