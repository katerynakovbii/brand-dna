import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { competitorQueries, parseDuckDuckGo, collectCompetitorSignals } from '../../collector/collectors/competitors.mjs';
import { fakeFetcher } from '../helpers/fake-fetch.js';

const ddg = readFileSync(new URL('../fixtures/competitors/ddg.html', import.meta.url), 'utf8');
const gnews = `<rss><channel><item><title>Remote work tools compared: Acme vs Trello - WorkBlog</title><link>https://news.google.com/a</link><pubDate>Mon, 05 Oct 2026 08:00:00 GMT</pubDate></item></channel></rss>`;

test('queries quote the brand and include industry', () => {
  assert.deepEqual(competitorQueries({ name: '"Acme"', industry: 'SaaS / Software' }), [
    '"Acme" alternatives', '"Acme" vs', 'SaaS / Software companies like "Acme"',
  ]);
});

test('parseDuckDuckGo unwraps redirect links and skips empty results', () => {
  assert.deepEqual(parseDuckDuckGo(ddg), [
    { title: 'Top 10 Acme Alternatives & Competitors - G2', url: 'https://www.g2.com/products/acme/competitors', snippet: 'Popular alternatives include Trello, Asana and Monday.com for remote teams.' },
    { title: 'Asana vs Acme: project management compared', url: 'https://asana.com/compare/acme', snippet: 'Asana and Acme both help teams plan projects.' },
  ]);
});

test('parseDuckDuckGo excludes results with non-http(s) urls', () => {
  const badDdg = `<html><body>
    <div class="result"><h2><a class="result__a" href="javascript:alert(1)">Bad JS</a></h2><a class="result__snippet">Snippet</a></div>
    <div class="result"><h2><a class="result__a" href="//duckduckgo.com/l/?uddg=javascript%3Aalert(1)">Bad JS via uddg</a></h2><a class="result__snippet">Snippet</a></div>
    <div class="result"><h2><a class="result__a" href="https://good.test/x">Good</a></h2><a class="result__snippet">Good snippet</a></div>
  </body></html>`;
  const results = parseDuckDuckGo(badDdg);
  assert.equal(results.length, 1);
  assert.equal(results[0].url, 'https://good.test/x');
});

test('collects from both engines and strips Google publisher suffix', async () => {
  const fetcher = fakeFetcher([[/news\.google\.com/, { body: gnews }], [/duckduckgo\.com/, { body: ddg }]]);
  const r = await collectCompetitorSignals({ name: 'Acme', industry: 'SaaS' }, { fetcher });
  assert.equal(r.ok, true);
  const g = r.data.results.filter((x) => x.engine === 'google-news');
  assert.equal(g.length, 3);
  assert.equal(g[0].title, 'Remote work tools compared: Acme vs Trello');
  assert.equal(r.data.results.filter((x) => x.engine === 'duckduckgo').length, 6);
});

test('all engines failing → not ok', async () => {
  const r = await collectCompetitorSignals({ name: 'Acme', industry: 'SaaS' }, { fetcher: fakeFetcher([]) });
  assert.equal(r.ok, false);
});
