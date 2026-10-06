import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectCommunity } from '../../collector/collectors/community.mjs';
import { fakeFetcher } from '../helpers/fake-fetch.js';

const now = new Date('2026-10-06T00:00:00Z');
const ts = (iso) => Date.parse(iso) / 1000;

const hn = {
  nbHits: 2,
  hits: [
    { objectID: '101', created_at_i: ts('2026-10-01T00:00:00Z'), title: 'Show HN: Acme', url: 'https://acme.test' },
    { objectID: '102', created_at_i: ts('2026-09-20T00:00:00Z'), title: null, story_title: null, comment_text: 'I use <i>Acme</i> daily' },
  ],
};
const reddit = {
  data: {
    children: [
      { data: { title: 'Anyone tried Acme?', permalink: '/r/pm/comments/1/x/', created_utc: ts('2026-10-02T00:00:00Z') } },
      { data: { title: 'Ancient Acme thread', permalink: '/r/pm/comments/2/y/', created_utc: ts('2026-01-01T00:00:00Z') } },
    ],
  },
};

test('collects HN and Reddit within 60 days', async () => {
  const fetcher = fakeFetcher([
    [/hn\.algolia\.com/, { body: JSON.stringify(hn) }],
    [/reddit\.com\/search\.json/, { body: JSON.stringify(reddit) }],
  ]);
  const r = await collectCommunity({ name: 'Acme' }, { fetcher, now });
  assert.equal(r.ok, true);
  assert.deepEqual(r.data.items, [
    { date: '2026-10-01T00:00:00.000Z', source: 'hackernews', title: 'Show HN: Acme', url: 'https://news.ycombinator.com/item?id=101' },
    { date: '2026-09-20T00:00:00.000Z', source: 'hackernews', title: 'I use Acme daily', url: 'https://news.ycombinator.com/item?id=102' },
    { date: '2026-10-02T00:00:00.000Z', source: 'reddit', title: 'Anyone tried Acme?', url: 'https://www.reddit.com/r/pm/comments/1/x/' },
  ]);
  assert.deepEqual(r.data.capped, { hackernews: false, reddit: false });
  const hnUrl = new URL(fetcher.calls.find((u) => u.includes('algolia')));
  assert.equal(hnUrl.searchParams.get('query'), '"Acme"');
  assert.equal(hnUrl.searchParams.get('numericFilters'), `created_at_i>${ts('2026-08-07T00:00:00Z')}`);
});

test('reddit blocked → partial; both blocked → not ok', async () => {
  const p = await collectCommunity({ name: 'Acme' }, { fetcher: fakeFetcher([[/hn\.algolia\.com/, { body: JSON.stringify(hn) }], [/reddit/, { status: 403 }]]), now });
  assert.equal(p.ok, true);
  assert.deepEqual(p.data.partial, ['reddit: HTTP 403']);
  const n = await collectCommunity({ name: 'Acme' }, { fetcher: fakeFetcher([]), now });
  assert.equal(n.ok, false);
});

test('hn capped when nbHits exceeds returned hits', async () => {
  const fetcher = fakeFetcher([[/hn\.algolia\.com/, { body: JSON.stringify({ ...hn, nbHits: 500 }) }], [/reddit/, { body: JSON.stringify({ data: { children: [] } }) }]]);
  const r = await collectCommunity({ name: 'Acme' }, { fetcher, now });
  assert.equal(r.data.capped.hackernews, true);
});

test('excludes items with non-http(s) urls', async () => {
  const hnWithBadUrl = {
    nbHits: 2,
    hits: [
      { objectID: '201', created_at_i: ts('2026-10-01T00:00:00Z'), title: 'Show HN: Acme', url: 'javascript:alert(1)' },
      { objectID: '202', created_at_i: ts('2026-10-01T00:00:00Z'), title: 'Show HN: Acme Good', url: 'https://acme.test' },
    ],
  };
  const redditWithBadUrl = {
    data: {
      children: [
        { data: { title: 'Acme thread bad', permalink: 'javascript:void(0)', created_utc: ts('2026-10-02T00:00:00Z') } },
        { data: { title: 'Acme thread good', permalink: '/r/pm/comments/1/x/', created_utc: ts('2026-10-02T00:00:00Z') } },
      ],
    },
  };
  const fetcher = fakeFetcher([
    [/hn\.algolia\.com/, { body: JSON.stringify(hnWithBadUrl) }],
    [/reddit\.com\/search\.json/, { body: JSON.stringify(redditWithBadUrl) }],
  ]);
  const r = await collectCommunity({ name: 'Acme' }, { fetcher, now });
  assert.equal(r.ok, true);
  assert.equal(r.data.items.length, 2);
  assert.deepEqual(r.data.items.map((i) => i.url), [
    'https://news.ycombinator.com/item?id=202',
    'https://www.reddit.com/r/pm/comments/1/x/',
  ]);
});
