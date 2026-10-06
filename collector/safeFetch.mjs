import { lookup as dnsLookup } from 'node:dns/promises';
import net from 'node:net';

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';

function isPrivateIpv4(ip) {
  const [a, b, c] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || a >= 224
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 192 && b === 0 && c === 0)  // 192.0.0.0/24
    || (a === 192 && b === 0 && c === 2)  // 192.0.2.0/24
    || (a === 198 && b >= 18 && b <= 19)  // 198.18.0.0/15
    || (a === 198 && b === 51 && c === 100);  // 198.51.100.0/24
}

export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    return isPrivateIpv4(ip);
  }
  const v = ip.toLowerCase();
  if (v === '::1' || v === '::') return true;

  // IPv4-mapped (::ffff:x.x.x.x) and IPv4-compatible (::x.x.x.x)
  if (v.startsWith('::ffff:')) {
    const rest = v.slice(7);
    if (net.isIPv4(rest)) return isPrivateIpv4(rest);
    const m = rest.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (m) {
      const hi = parseInt(m[1], 16);
      const lo = parseInt(m[2], 16);
      return isPrivateIpv4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    return true;
  }

  // IPv4-compatible (::x.x.x.x form)
  if (v.startsWith('::') && v.length > 2) {
    const rest = v.slice(2);
    if (net.isIPv4(rest)) return isPrivateIpv4(rest);
  }

  // Parse IPv6 into hextets for range checking
  let hextets;
  try {
    hextets = parseIPv6(v);
  } catch {
    return false;
  }

  if (!hextets) return false;

  const first = hextets[0];

  // ULA (fc00::/7, fd00::/8)
  if ((first >= 0xfc00 && first <= 0xfdff) || (first >= 0xfd00 && first <= 0xfdff)) return true;

  // Link-local (fe80::/10)
  if ((first >= 0xfe80 && first <= 0xfebf)) return true;

  // Site-local (fec0::/10)
  if ((first >= 0xfec0 && first <= 0xfedf)) return true;

  // IPv4-mapped (0:0:0:0:0:ffff:xxxx:xxxx)
  if (hextets[5] === 0xffff && hextets[0] === 0 && hextets[1] === 0 && hextets[2] === 0 && hextets[3] === 0 && hextets[4] === 0) {
    const a = hextets[6] >> 8;
    const b = hextets[6] & 0xff;
    const c = hextets[7] >> 8;
    const d = hextets[7] & 0xff;
    return isPrivateIpv4(`${a}.${b}.${c}.${d}`);
  }

  // NAT64 (64:ff9b::/96) with embedded IPv4 in last 32 bits (hextets 6-7)
  if (first === 0x0064 && hextets[1] === 0xff9b) {
    const a = hextets[6] >> 8;
    const b = hextets[6] & 0xff;
    const c = hextets[7] >> 8;
    const d = hextets[7] & 0xff;
    return isPrivateIpv4(`${a}.${b}.${c}.${d}`);
  }

  // 6to4 (2002::/16) with embedded IPv4
  if (first === 0x2002) {
    const a = hextets[1] >> 8;
    const b = hextets[1] & 0xff;
    const c = hextets[2] >> 8;
    const d = hextets[2] & 0xff;
    return isPrivateIpv4(`${a}.${b}.${c}.${d}`);
  }

  return false;
}

function parseIPv6(str) {
  // Handle :: expansion and parse into 8 hextets
  const parts = str.split(':');

  // Handle IPv4 suffix like ::ffff:1.2.3.4
  let ipv4Suffix = null;
  if (parts.length > 0 && /^\d+\.\d+\.\d+\.\d+$/.test(parts[parts.length - 1])) {
    const ipv4 = parts.pop();
    const [a, b, c, d] = ipv4.split('.').map(Number);
    ipv4Suffix = [(a << 8) | b, (c << 8) | d];
  }

  const hextets = [];
  let emptyIndex = -1;

  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === '') {
      if (i === 0 || i === parts.length - 1) {
        // Leading or trailing ::
        emptyIndex = i;
      } else if (i === 1 && parts[0] === '') {
        // Leading :: (empty parts are [1])
        emptyIndex = 0;
      } else if (emptyIndex === -1) {
        emptyIndex = hextets.length;
      }
    } else {
      hextets.push(parseInt(parts[i], 16));
    }
  }

  // If there was a ::, expand it
  if (emptyIndex !== -1) {
    const expectedLength = ipv4Suffix ? 6 : 8;
    const numMissing = expectedLength - hextets.length;
    for (let i = 0; i < numMissing; i++) {
      hextets.splice(emptyIndex, 0, 0);
    }
  }

  // Add IPv4 suffix if present
  if (ipv4Suffix) {
    hextets.push(...ipv4Suffix);
  }

  return hextets.length === 8 ? hextets : null;
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
