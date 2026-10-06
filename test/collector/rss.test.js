import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFeed, stripHtml } from '../../collector/rss.mjs';

test('parses RSS 2.0 items', () => {
  const items = parseFeed(readFileSync(new URL('../fixtures/news/google.xml', import.meta.url), 'utf8'));
  assert.equal(items.length, 3);
  assert.equal(items[0].title, 'Acme raises Series B - TechDaily');
  assert.equal(items[0].link, 'https://news.google.com/rss/articles/abc1');
  assert.equal(items[0].date, '2026-10-04T09:00:00.000Z');
  assert.equal(items[0].source, 'TechDaily');
  assert.equal(items[0].description, 'Acme raises Series B');
});

test('parses Atom entries (YouTube style)', () => {
  const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
    <entry><title>Video one</title><link rel="alternate" href="https://www.youtube.com/watch?v=1"/><published>2026-10-01T10:00:00+00:00</published></entry>
  </feed>`;
  assert.deepEqual(parseFeed(xml), [{ title: 'Video one', link: 'https://www.youtube.com/watch?v=1', date: '2026-10-01T10:00:00.000Z', source: null, description: '' }]);
});

test('single item, bad dates and junk are tolerated', () => {
  const xml = '<rss><channel><item><title>2024</title><link>https://a.test</link><pubDate>nope</pubDate></item></channel></rss>';
  assert.deepEqual(parseFeed(xml), [{ title: '2024', link: 'https://a.test', date: null, source: null, description: '' }]);
  assert.deepEqual(parseFeed('<html>not a feed</html>'), []);
});

test('stripHtml removes tags and collapses whitespace', () => {
  assert.equal(stripHtml('<b>Hi</b>\n <i>there</i>'), 'Hi there');
});
