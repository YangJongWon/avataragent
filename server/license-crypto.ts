import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import { parseLicensePayload, type LicensePayload } from '../shared/license.ts';

/**
 * Ed25519 signing for plan licenses. The site signs with its private key; installs verify with the public keys
 * they trust. Shared by the app server and the project site.
 */

const b64 = (data: Buffer | string) => Buffer.from(data).toString('base64url');

export function signLicense(payload: LicensePayload, privateKeyPem: string): string {
  const body = b64(JSON.stringify(parseLicensePayload(payload)));
  const signature = sign(null, Buffer.from(body), createPrivateKey(privateKeyPem));
  return `${body}.${b64(signature)}`;
}

/** The payload of a token signed by one of `publicKeys` (kid → PEM); throws when it is not. */
export function verifyLicense(token: string, publicKeys: Record<string, string>): LicensePayload {
  const [body, signature, extra] = String(token).trim().split('.');
  if (!body || !signature || extra !== undefined || token.length > 4000) throw new Error('라이선스 키 형식이 올바르지 않아요.');
  let payload: LicensePayload;
  try {
    payload = parseLicensePayload(JSON.parse(Buffer.from(body, 'base64url').toString('utf8')));
  } catch (error) {
    throw error instanceof SyntaxError ? new Error('라이선스 키 형식이 올바르지 않아요.') : error;
  }
  const pem = publicKeys[payload.kid];
  if (!pem) throw new Error('이 라이선스를 서명한 키를 알 수 없어요. 앱을 업데이트해 보세요.');
  if (!verify(null, Buffer.from(body), createPublicKey(pem), Buffer.from(signature, 'base64url'))) {
    throw new Error('라이선스 서명이 맞지 않아요.');
  }
  return payload;
}

/** A new key pair in PEM, for `scripts/license-keygen.ts` and tests. */
export function newLicenseKeys() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}
