import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReport } from '../../collector/pipeline.mjs';

const now = new Date('2026-10-06T00:00:00Z');
const input = { name: 'Acme', website: 'https://acme.test/', industry: 'SaaS / Software', socials: {}, type: 'main', parentId: null };
const day = (n) => new Date(now.getTime() - n * 86400000).toISOString();

function fakes(overrides = {}) {
  const calls = {};
  const base = {
    website: async (inp) => { calls.website = inp; return { source: 'website', ok: true, data: {
      title: 'Acme | Project management for remote teams', description: 'Acme helps remote teams ship.', h1: ['Project management for remote teams'],
      h2: ['Plan sprints in minutes'], og: {}, org: null, socialLinks: ['https://x.com/acme'], hasBlog: true, feedUrl: null, lang: 'en',
      text: 'Remote teams use Acme. Remote teams plan projects. Business teams automate.', url: inp.website, sitemapCount: 3 } }; },
    socials: async (_inp, { discovered }) => { calls.discovered = discovered; return { source: 'socials', ok: true, data: { profiles: [
      { platform: 'x', url: 'https://x.com/acme', discovered: true, check: 'reachable', status: 200, title: null, description: null }], youtubeVideos: [] } }; },
    news: async () => ({ source: 'news', ok: true, data: { items: [
      { date: day(1), source: 'google-news', title: 'Acme raises Series B funding', url: 'https://n.test/1' },
      { date: day(2), source: 'bing-news', title: 'Acme raises Series B funding', url: 'https://n.test/2' }], capped: { 'google-news': false, 'bing-news': false }, partial: ['bing-news: HTTP 403'] } }),
    community: async () => ({ source: 'community', ok: true, data: { items: [
      { date: day(20), source: 'reddit', title: 'Anyone tried Acme?', url: 'https://reddit.test/1' }], capped: { hackernews: false, reddit: false }, partial: [] } }),
    competitors: async () => ({ source: 'competitors', ok: true, data: { results: [
      { title: 'Asana vs Acme: compared', url: 'https://asana.com/x', snippet: 'Asana and Acme help teams.' }], partial: [] } }),
  };
  return { collectors: { ...base, ...overrides }, calls };
}

test('assembles a rules-mode report from collector output', async () => {
  const { collectors, calls } = fakes();
  const r = await buildReport({ id: 'i'.repeat(22), input, now, collectors, fetcher: null });
  assert.deepEqual(calls.discovered, ['https://x.com/acme']);
  assert.equal(r.v, 1);
  assert.equal(r.status, 'ok');
  assert.equal(r.mode, 'rules');
  assert.match(r.modeReason, /No ANTHROPIC_API_KEY/);
  assert.equal(r.industryKey, 'saas');
  assert.equal(r.createdAt, now.toISOString());
  assert.equal(r.positioning.statement, 'Project management for remote teams');
  assert.equal(r.mentions.d7.total, 1, 'duplicate headline deduped');
  assert.equal(r.mentions.d30.total, 2);
  assert.equal(r.mentions.items.length, 2);
  assert.equal(r.touchpoints.items.find((i) => i.kind === 'x').status, 'found');
  assert.equal(r.competitors[0].name, 'Asana');
  assert.deepEqual(r.sources.map((s) => [s.source, s.ok, s.error]), [
    ['website', true, null], ['socials', true, null], ['news', true, 'bing-news: HTTP 403'],
    ['community', true, null], ['competitors', true, null],
  ]);
});

test('a throwing collector becomes a failed source, report still ok', async () => {
  const { collectors } = fakes({ news: async () => { throw new Error('kaboom'); } });
  const r = await buildReport({ id: 'i'.repeat(22), input, now, collectors, fetcher: null });
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.sources.find((s) => s.source === 'news'), { source: 'news', ok: false, error: 'kaboom' });
  assert.equal(r.mentions.d30.total, 1);
});

test('no website → website collector skipped', async () => {
  const { collectors, calls } = fakes();
  const r = await buildReport({ id: 'i'.repeat(22), input: { ...input, website: null }, now, collectors, fetcher: null });
  assert.equal(calls.website, undefined);
  assert.deepEqual(r.sources[0], { source: 'website', ok: false, error: 'No website provided' });
  assert.equal(r.positioning.statement, null);
});

test('AI mode merges AI fields over rules and re-ranks competitors', async () => {
  const { collectors } = fakes();
  let prompt;
  const run = async (args) => { prompt = args.prompt; return {
    statement: 'AI statement', audience: null, differentiators: [], tone: 'calm', siteSocialConsistency: 'ok', newsSentiment: 'positive',
    competitors: [{ name: 'Notion', website: null, reason: 'Docs' }] }; };
  const r = await buildReport({ id: 'i'.repeat(22), input, now, collectors, fetcher: null, ai: { apiKey: 'k', run } });
  assert.match(prompt, /Acme raises Series B/);
  assert.equal(r.mode, 'ai');
  assert.equal(r.modeReason, null);
  assert.equal(r.positioning.statement, 'AI statement');
  assert.equal(r.positioning.tone, 'calm');
  assert.deepEqual(r.positioning.differentiators, ['Plan sprints in minutes'], 'empty AI list keeps rules value');
  assert.deepEqual(r.competitors, [{ name: 'Notion', website: null, reason: 'Docs', coMentions: 0 }]);
});

test('AI failure falls back to rules with reason', async () => {
  const { collectors } = fakes();
  const r = await buildReport({ id: 'i'.repeat(22), input, now, collectors, fetcher: null, ai: { apiKey: 'k', run: async () => { throw new Error('HTTP 529'); } } });
  assert.equal(r.mode, 'rules');
  assert.match(r.modeReason, /HTTP 529/);
});
