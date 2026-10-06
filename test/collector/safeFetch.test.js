import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSafeFetch, isPrivateIp, getText, getJson } from '../../collector/safeFetch.mjs';

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];

function stubFetch(map) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const r = map[url];
    if (!r) return new Response('nf', { status: 404 });
    return new Response(r.body ?? '', { status: r.status ?? 200, headers: r.headers ?? {} });
  };
  impl.calls = calls;
  return impl;
}

test('isPrivateIp classifies addresses', () => {
  for (const ip of ['10.1.2.3', '127.0.0.1', '0.0.0.0', '169.254.169.254', '172.16.0.1', '172.31.255.255',
    '192.168.1.1', '100.64.0.1', '224.0.0.1', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1']) {
    assert.equal(isPrivateIp(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '172.32.0.1', '93.184.216.34', '2606:4700::1111', '::ffff:8.8.8.8']) {
    assert.equal(isPrivateIp(ip), false, ip);
  }
});

test('isPrivateIp blocks IPv6 and reserved ranges', () => {
  // IPv6 link-local, site-local, NAT64, 6to4, IPv4-compatible, IPv4-mapped
  for (const ip of ['fe90::1', 'febf::1', 'fec0::1', '64:ff9b::7f00:1', '2002:7f00:1::', '::127.0.0.1', '0:0:0:0:0:ffff:7f00:1']) {
    assert.equal(isPrivateIp(ip), true, ip);
  }
  // Reserved IPv4 ranges
  for (const ip of ['192.0.0.0', '192.0.0.255', '192.0.2.0', '192.0.2.255', '198.18.0.0', '198.19.255.255', '198.51.100.0', '198.51.100.255']) {
    assert.equal(isPrivateIp(ip), true, ip);
  }
  // Public addresses stay false
  for (const ip of ['2606:4700::1111', '8.8.8.8']) {
    assert.equal(isPrivateIp(ip), false, ip);
  }
});

test('blocks non-http schemes', async () => {
  const f = createSafeFetch({ fetchImpl: stubFetch({}), lookup: publicLookup });
  await assert.rejects(f('file:///etc/passwd'), /blocked scheme/);
  await assert.rejects(f('javascript:alert(1)'), /blocked scheme/);
});

test('blocks private literal and private DNS results', async () => {
  const f = createSafeFetch({ fetchImpl: stubFetch({}), lookup: async () => [{ address: '10.0.0.5' }] });
  await assert.rejects(f('http://127.0.0.1/'), /blocked private address/);
  await assert.rejects(f('http://internal.example/'), /blocked private address/);
});

test('follows public redirects, sets finalUrl and UA', async () => {
  const impl = stubFetch({
    'https://a.test/': { status: 301, headers: { location: '/b' } },
    'https://a.test/b': { body: 'hello' },
  });
  const f = createSafeFetch({ fetchImpl: impl, lookup: publicLookup });
  const res = await f('https://a.test/');
  assert.equal(await res.text(), 'hello');
  assert.equal(res.finalUrl, 'https://a.test/b');
  assert.match(impl.calls[0].init.headers['user-agent'], /Mozilla/);
  assert.equal(impl.calls[0].init.redirect, 'manual');
});

test('blocks redirect to private address', async () => {
  const impl = stubFetch({ 'https://a.test/': { status: 302, headers: { location: 'http://169.254.169.254/latest' } } });
  const f = createSafeFetch({ fetchImpl: impl, lookup: publicLookup });
  await assert.rejects(f('https://a.test/'), /blocked private address/);
});

test('stops after too many redirects', async () => {
  const impl = stubFetch({ 'https://a.test/': { status: 302, headers: { location: 'https://a.test/' } } });
  const f = createSafeFetch({ fetchImpl: impl, lookup: publicLookup, maxRedirects: 2 });
  await assert.rejects(f('https://a.test/'), /too many redirects/);
});

test('getText and getJson wrap responses', async () => {
  const impl = stubFetch({ 'https://a.test/t': { body: 'x'.repeat(10) }, 'https://a.test/j': { body: '{"a":1}' }, 'https://a.test/e': { status: 500 } });
  const f = createSafeFetch({ fetchImpl: impl, lookup: publicLookup });
  assert.deepEqual(await getText(f, 'https://a.test/t'), { status: 200, ok: true, finalUrl: 'https://a.test/t', text: 'xxxxxxxxxx' });
  assert.deepEqual((await getJson(f, 'https://a.test/j')).json, { a: 1 });
  const bad = await getJson(f, 'https://a.test/e');
  assert.equal(bad.ok, false);
  assert.equal(bad.json, null);
});

test('blocks IPv6 localhost literal', async () => {
  const f = createSafeFetch({ fetchImpl: stubFetch({}), lookup: publicLookup });
  await assert.rejects(f('http://[::1]/'), /blocked private address/);
});
