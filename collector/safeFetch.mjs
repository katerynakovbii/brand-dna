import { lookup as dnsLookup } from 'node:dns/promises';
import net from 'node:net';

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';

export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || a >= 224
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127);
  }
  const v = ip.toLowerCase();
  if (v === '::1' || v === '::') return true;
  if (v.startsWith('::ffff:')) {
    const rest = v.slice(7);
    if (net.isIPv4(rest)) return isPrivateIp(rest);
    const m = rest.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (m) {
      const hi = parseInt(m[1], 16);
      const lo = parseInt(m[2], 16);
      return isPrivateIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    return true;
  }
  return v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
}

export function createSafeFetch({ fetchImpl = globalThis.fetch, lookup = dnsLookup, timeoutMs = 15000, maxRedirects = 5 } = {}) {
  async function assertPublic(u) {
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error(`blocked scheme: ${u.protocol}`);
    const host = u.hostname.replace(/^\[|\]$/g, '');
    const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
    if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error(`blocked private address: ${host}`);
  }

  return async function safeFetch(url, opts = {}) {
    let current = new URL(url);
    for (let hop = 0; hop <= maxRedirects; hop++) {
      await assertPublic(current);
      const res = await fetchImpl(current.href, {
        ...opts,
        redirect: 'manual',
        headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9', ...(opts.headers || {}) },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const location = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && location) {
        current = new URL(location, current);
        continue;
      }
      res.finalUrl = current.href;
      return res;
    }
    throw new Error('too many redirects');
  };
}

export async function getText(fetcher, url, opts) {
  const res = await fetcher(url, opts);
  const text = (await res.text()).slice(0, 2_000_000);
  return { status: res.status, ok: res.ok, finalUrl: res.finalUrl ?? url, text };
}

export async function getJson(fetcher, url) {
  const r = await getText(fetcher, url, { headers: { accept: 'application/json' } });
  return { status: r.status, ok: r.ok, finalUrl: r.finalUrl, json: r.ok ? JSON.parse(r.text) : null };
}
