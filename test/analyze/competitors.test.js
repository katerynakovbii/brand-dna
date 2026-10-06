import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankCompetitors, cleanCandidate, extractCandidates } from '../../collector/analyze/competitors.mjs';

const results = [
  { title: 'Top 10 Acme Alternatives & Competitors - G2', url: 'https://www.g2.com/products/acme/competitors', snippet: 'Popular alternatives include Trello, Asana and Monday.com for remote teams.' },
  { title: 'Asana vs Acme: project management compared', url: 'https://asana.com/compare/acme', snippet: 'Asana and Acme both help teams plan projects.' },
  { title: 'Remote work tools compared: Acme vs Trello', url: 'https://news.google.com/a', snippet: '' },
];

test('extractCandidates finds vs pairs with weight 3', () => {
  const c = extractCandidates('Asana vs Acme: compared');
  assert.ok(c.some((x) => x.name === 'Asana' && x.weight === 3));
});

test('cleanCandidate drops generic words and the brand', () => {
  assert.equal(cleanCandidate('Top Trello', 'Acme'), 'Trello');
  assert.equal(cleanCandidate('Acme Alternatives', 'Acme'), null);
  assert.equal(cleanCandidate("Acme's", 'Acme'), null);
  assert.equal(cleanCandidate('G2', 'Acme'), null);
  assert.equal(cleanCandidate('October', 'Acme'), null);
  assert.equal(cleanCandidate('Monday.com.', 'Acme'), 'Monday.com');
});

test('ranks co-mentioned brands, guesses website from matching domain', () => {
  const r = rankCompetitors({ name: 'Acme', results, industryKeywords: ['teams', 'software'] });
  assert.deepEqual(r.slice(0, 2).map((x) => x.name), ['Asana', 'Trello']);
  assert.equal(r[0].website, 'https://asana.com');
  assert.equal(r[1].website, null);
  assert.equal(r[0].coMentions, 2);
  assert.match(r[0].reason, /Appears alongside Acme in 2 search results/);
  assert.ok(!r.some((x) => /acme|g2|popular|remote/i.test(x.name)));
});

test('no results → empty', () => {
  assert.deepEqual(rankCompetitors({ name: 'Acme', results: [], industryKeywords: [] }), []);
});

test('missing title/snippet/invalid url doesn\'t throw', () => {
  const results = [
    { title: undefined, url: 'not a url', snippet: null },
    { title: 'Asana vs Acme', url: 'https://asana.com', snippet: undefined },
    null,
    42,
    {},
  ];
  assert.doesNotThrow(() => {
    const r = rankCompetitors({ name: 'Acme', results, industryKeywords: [] });
    assert.ok(Array.isArray(r));
  });
});

test('handles undefined industryKeywords', () => {
  const results = [{ title: 'Asana vs Acme', url: 'https://asana.com', snippet: 'test' }];
  assert.doesNotThrow(() => {
    const r = rankCompetitors({ name: 'Acme', results, industryKeywords: undefined });
    assert.ok(Array.isArray(r));
  });
});

test('text join with space prevents domain fusion (G2.Popular)', () => {
  // With space after period, "G2. Popular" splits so G2 and Popular don't fuse
  const candidates = extractCandidates('Foo - G2. Popular alternatives');
  assert.ok(!candidates.some((c) => c.name.includes('G2.Popular')));
  // rankCompetitors joins title and snippet with period+space, preventing fusion
  const results = [{ title: 'X - G2', url: 'https://x.com', snippet: 'Popular alternatives' }];
  const r = rankCompetitors({ name: 'Acme', results, industryKeywords: [] });
  assert.ok(!r.some((c) => c.name.includes('.')));
});
