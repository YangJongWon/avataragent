import type { Request } from 'express';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
/** Tunnels and proxies on this PC (Tailscale Funnel, cloudflared) connect from loopback too; these headers give them away. */
const FORWARDED = ['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-real-ip', 'cf-connecting-ip', 'tailscale-user-login', 'tailscale-funnel-request'];

/**
 * The request comes from a browser on the PC running the app, not through a tunnel or the network: someone sitting at
 * the PC. Settings that run programs on it are only changed from here, so a leaked or weak password is not enough.
 */
export function isLocalRequest(req: Request) {
  if (!LOOPBACK.has(req.socket.remoteAddress ?? '')) return false;
  if (FORWARDED.some((name) => req.headers[name] !== undefined)) return false;
  const host = (req.headers.host ?? '').toLowerCase().replace(/:\d+$/, '').replace(/^\[(.*)\]$/, '$1');
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}
