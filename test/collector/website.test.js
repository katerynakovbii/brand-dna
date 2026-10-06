import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHomepage, collectWebsite } from '../../collector/collectors/website.mjs';
import { fakeFetcher } from '../helpers/fake-fetch.js';

const html = readFileSync(new URL('../fixtures/website/home.html', import.meta.url), 'utf8');

test('parseHomepage extracts brand signals', () => {
  const d = parseHomepage(html, 'https://acme.test/');
  assert.equal(d.title, 'Acme | Project management for remote teams');
  assert.equal(d.description, 'Acme helps remote teams plan, track and ship work together.');
  assert.deepEqual(d.h1, ['Project management for remote teams']);
  assert.deepEqual(d.h2, ['Plan sprints in minutes', 'Automation that saves hours']);
  assert.equal(d.og.title, 'Acme — ship work together');
  assert.equal(d.og.siteName, 'Acme');
  assert.equal(d.org.name, 'Acme Inc');
  assert.deepEqual(d.socialLinks.sort(), [
    'https://instagram.com/acmehq',
    'https://twitter.com/acmehq',
    'https://www.linkedin.com/company/acme',
    'https://www.youtube.com/@acme',
  ]);
  assert.equal(d.hasBlog, true);
  assert.equal(d.feedUrl, 'https://acme.test/feed.xml');
  assert.equal(d.lang, 'en');
  assert.match(d.text, /Remote teams use Acme/);
  assert.doesNotMatch(d.text, /should not appear/);
});

test('collectWebsite fetches homepage and sitemap', async () => {
  const fetcher = fakeFetcher([
    ['https://acme.test/', { body: html }],
    ['https://acme.test/sitemap.xml', { body: '<urlset><url><loc>a</loc></url><url><loc>b</loc></url></urlset>' }],
  ]);
  const r = await collectWebsite({ website: 'https://acme.test/' }, { fetcher });
  assert.equal(r.source, 'website');
  assert.equal(r.ok, true);
  assert.equal(r.data.url, 'https://acme.test/');
  assert.equal(r.data.sitemapCount, 2);
});

test('collectWebsite reports HTTP errors and exceptions without throwing', async () => {
  const r1 = await collectWebsite({ website: 'https://down.test/' }, { fetcher: fakeFetcher([['https://down.test/', { status: 503 }]]) });
  assert.deepEqual(r1, { source: 'website', ok: false, error: 'HTTP 503' });
  const r2 = await collectWebsite({ website: 'https://x.test/' }, { fetcher: fakeFetcher([[/x\.test/, new Error('boom')]]) });
  assert.deepEqual(r2, { source: 'website', ok: false, error: 'boom' });
});

test('sitemapCount is null when sitemap is missing', async () => {
  const fetcher = fakeFetcher([['https://acme.test/', { body: html }]]);
  const r = await collectWebsite({ website: 'https://acme.test/' }, { fetcher });
  assert.equal(r.data.sitemapCount, null);
});
