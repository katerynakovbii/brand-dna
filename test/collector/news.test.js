import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { collectNews, googleNewsUrl, unwrapBing, cleanName } from '../../collector/collectors/news.mjs';
import { fakeFetcher } from '../helpers/fake-fetch.js';

const google = readFileSync(new URL('../fixtures/news/google.xml', import.meta.url), 'utf8');
const bing = readFileSync(new URL('../fixtures/news/bing.xml', import.meta.url), 'utf8');
const now = new Date('2026-10-06T00:00:00Z');

test('urls encode quotes and special characters', () => {
  assert.equal(cleanName('"Ben & Jerry\'s"'), "Ben & Jerry's");
  const u = new URL(googleNewsUrl(`"${cleanName('Ben & Jerry\'s')}" when:60d`));
  assert.equal(u.searchParams.get('q'), `"Ben & Jerry's" when:60d`);
  assert.equal(unwrapBing('http://www.bing.com/news/apiclick.aspx?url=https%3a%2f%2fa.test%2fb'), 'https://a.test/b');
  assert.equal(unwrapBing('https://plain.test/x'), 'https://plain.test/x');
});

test('collects, filters to 60 days, unwraps bing links, drops unrelated bing items', async () => {
  const fetcher = fakeFetcher([[/news\.google\.com/, { body: google }], [/bing\.com/, { body: bing }]]);
  const r = await collectNews({ name: 'Acme' }, { fetcher, now });
  assert.equal(r.ok, true);
  assert.deepEqual(r.data.items.map((i) => [i.source, i.url]), [
    ['google-news', 'https://news.google.com/rss/articles/abc1'],
    ['google-news', 'https://news.google.com/rss/articles/abc2'],
    ['bing-news', 'https://newsite.test/acme-ai'],
  ]);
  assert.equal(r.data.items[0].publisher, 'TechDaily');
  assert.deepEqual(r.data.capped, { 'google-news': false, 'bing-news': false });
  assert.deepEqual(r.data.partial, []);
});

test('one failing source is partial, both failing is not ok', async () => {
  const partial = await collectNews({ name: 'Acme' }, { fetcher: fakeFetcher([[/news\.google\.com/, { body: google }], [/bing\.com/, { status: 403 }]]), now });
  assert.equal(partial.ok, true);
  assert.deepEqual(partial.data.partial, ['bing-news: HTTP 403']);
  const none = await collectNews({ name: 'Acme' }, { fetcher: fakeFetcher([]), now });
  assert.equal(none.ok, false);
  assert.match(none.error, /google-news: HTTP 404; bing-news: HTTP 404/);
});

test('google cap flagged at 100 items', async () => {
  const items = Array.from({ length: 100 }, (_, i) => `<item><title>Acme ${i}</title><link>https://n.test/${i}</link><pubDate>Mon, 05 Oct 2026 08:00:00 GMT</pubDate></item>`).join('');
  const fetcher = fakeFetcher([[/news\.google\.com/, { body: `<rss><channel>${items}</channel></rss>` }], [/bing\.com/, { body: bing }]]);
  const r = await collectNews({ name: 'Acme' }, { fetcher, now });
  assert.equal(r.data.capped['google-news'], true);
});

test('unwrapBing rejects javascript urls and falls back to original', () => {
  assert.equal(unwrapBing('http://www.bing.com/news/apiclick.aspx?url=javascript%3Aalert(1)'), 'http://www.bing.com/news/apiclick.aspx?url=javascript%3Aalert(1)');
});

test('unwrapBing rejects relative urls and falls back to original', () => {
  assert.equal(unwrapBing('http://www.bing.com/news/apiclick.aspx?url=%2Frelative'), 'http://www.bing.com/news/apiclick.aspx?url=%2Frelative');
});

test('collectNews excludes items with non-http(s) links', async () => {
  const badGoogle = `<?xml version="1.0"?><rss version="2.0"><channel>
    <item><title>Acme bad link</title><link>javascript:alert(1)</link><pubDate>Mon, 05 Oct 2026 08:00:00 GMT</pubDate></item>
    <item><title>Acme good link</title><link>https://news.test/x</link><pubDate>Mon, 05 Oct 2026 08:00:00 GMT</pubDate></item>
  </channel></rss>`;
  const fetcher = fakeFetcher([[/news\.google\.com/, { body: badGoogle }], [/bing\.com/, { body: bing }]]);
  const r = await collectNews({ name: 'Acme' }, { fetcher, now });
  assert.equal(r.ok, true);
  const goodLinks = r.data.items.filter((i) => i.source === 'google-news');
  assert.equal(goodLinks.length, 1);
  assert.equal(goodLinks[0].url, 'https://news.test/x');
});
