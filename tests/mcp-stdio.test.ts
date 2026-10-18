import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request } from 'express';
import { MCP_PRESETS, stdioPresetOf } from '../shared/mcp.ts';
import { isLocalRequest } from '../server/local-request.ts';

const request = (remoteAddress: string, headers: Record<string, string>) => ({ socket: { remoteAddress }, headers }) as unknown as Request;

test('only a browser on the PC itself counts as local; tunnels and other devices do not', () => {
  assert.equal(isLocalRequest(request('127.0.0.1', { host: 'localhost:8787' })), true);
  assert.equal(isLocalRequest(request('::1', { host: '[::1]:8787' })), true);
  assert.equal(isLocalRequest(request('::ffff:127.0.0.1', { host: '127.0.0.1:8787' })), true);

  // Another device on the network.
  assert.equal(isLocalRequest(request('192.168.0.12', { host: '192.168.0.5:8787' })), false);
  // Tailscale Funnel and cloudflared run on this PC and connect from loopback, but forward the outside request.
  assert.equal(isLocalRequest(request('127.0.0.1', { host: 'office.tail1234.ts.net', 'tailscale-funnel-request': '?1' })), false);
  assert.equal(isLocalRequest(request('127.0.0.1', { host: 'localhost:8787', 'x-forwarded-for': '203.0.113.7' })), false);
  assert.equal(isLocalRequest(request('127.0.0.1', { host: 'app.example.com' })), false);
});

test('built-in stdio connections are recognised only with their exact command line', () => {
  const brave = MCP_PRESETS.find((p) => p.id === 'brave-search')!;
  assert.equal(stdioPresetOf({ transport: 'stdio', command: brave.command!, args: [...(brave.args ?? [])] })?.id, 'brave-search');
  assert.equal(stdioPresetOf({ transport: 'stdio', command: brave.command!, args: [...(brave.args ?? []), '--evil'] }), null);
  assert.equal(stdioPresetOf({ transport: 'stdio', command: 'powershell', args: ['-c', 'whoami'] }), null);
  assert.equal(stdioPresetOf({ transport: 'http', command: brave.command!, args: [...(brave.args ?? [])] }), null);
});
