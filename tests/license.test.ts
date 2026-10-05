import assert from 'node:assert/strict';
import test from 'node:test';

const { newLicenseKeys, signLicense, verifyLicense } = await import('../server/license-crypto.ts');
const { parseLicensePayload } = await import('../shared/license.ts');

const keys = newLicenseKeys();
const payload = {
  v: 1 as const,
  kid: 'site-1',
  lic: 'lic_abcdefgh1234',
  account: 'acc_1',
  plan: 'team' as const,
  seats: 10,
  install: 'ins_abcdefghijklmnop1234',
  periodEnd: '2026-11-04T00:00:00.000Z',
  issuedAt: '2026-10-05T00:00:00.000Z',
  status: 'active' as const,
};

test('a signed license verifies with the matching public key', () => {
  const token = signLicense(payload, keys.privateKey);
  assert.deepEqual(verifyLicense(token, { 'site-1': keys.publicKey }), payload);
});

test('forged, tampered or unknown-key licenses are refused', () => {
  const token = signLicense(payload, keys.privateKey);
  const other = newLicenseKeys();
  assert.throws(() => verifyLicense(token, { 'site-1': other.publicKey }), /서명이 맞지 않아요/);
  assert.throws(() => verifyLicense(token, { 'site-2': keys.publicKey }), /키를 알 수 없어요/);
  const [body, sig] = token.split('.');
  const richer = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), plan: 'business' })).toString('base64url');
  assert.throws(() => verifyLicense(`${richer}.${sig}`, { 'site-1': keys.publicKey }), /서명이 맞지 않아요/);
  assert.throws(() => verifyLicense('not-a-token', { 'site-1': keys.publicKey }), /형식/);
  assert.throws(() => verifyLicense(`${token}.extra`, { 'site-1': keys.publicKey }), /형식/);
});

test('payloads are checked field by field', () => {
  for (const [field, value] of [
    ['plan', 'personal'],
    ['plan', 'gold'],
    ['install', 'not-an-install'],
    ['status', 'paused'],
    ['periodEnd', 'tomorrow'],
    ['seats', -1],
    ['v', 2],
  ] as const) {
    assert.throws(() => parseLicensePayload({ ...payload, [field]: value }), /라이선스 형식/, `${field}=${value}`);
  }
});
