import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODEL, buildPrompt, parseJsonLoose, validateAi, runAi, mergeCompetitors } from '../../collector/analyze/ai.mjs';

const good = {
  statement: 'Project management for remote teams',
  audience: 'Remote-first companies',
  differentiators: ['Fast planning', '', 'Automation'],
  tone: 'friendly, practical',
  siteSocialConsistency: 'Consistent.',
  newsSentiment: 'Positive',
  competitors: [{ name: 'Asana', website: 'https://asana.com', reason: 'Direct rival' }, { name: 'Trello', website: 'javascript:x', reason: null }, { name: '' }],
};

test('buildPrompt includes brand, truncates site text', () => {
  const p = buildPrompt({
    input: { name: 'Acme', website: 'https://acme.test/', industry: 'saas' },
    site: { title: 'T', description: 'D', h1: [], h2: [], text: 'x'.repeat(10000) },
    profiles: [], headlines: ['Acme raises'], candidates: ['Asana'],
  });
  assert.match(p, /"brand": "Acme"/);
  assert.match(p, /Do not include Acme itself/);
  assert.ok(p.length < 7000);
});

test('parseJsonLoose handles fences and prose', () => {
  assert.deepEqual(parseJsonLoose('Sure:\n```json\n{"a":1}\n```'), { a: 1 });
  assert.throws(() => parseJsonLoose('no json'), /no JSON/);
});

test('validateAi normalizes and filters', () => {
  const r = validateAi(good);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.differentiators, ['Fast planning', 'Automation']);
  assert.equal(r.value.newsSentiment, 'positive');
  assert.deepEqual(r.value.competitors, [
    { name: 'Asana', website: 'https://asana.com/', reason: 'Direct rival' },
    { name: 'Trello', website: null, reason: null },
  ]);
  assert.equal(validateAi({ ...good, statement: '' }).ok, false);
  assert.equal(validateAi({ ...good, competitors: 'x' }).ok, false);
  assert.equal(validateAi({ ...good, newsSentiment: 'ecstatic' }).value.newsSentiment, 'unknown');
});

test('runAi calls Messages API and validates', async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(good) }] }), { status: 200 });
  };
  const r = await runAi({ apiKey: 'sk-test', prompt: 'hi', fetchImpl });
  assert.equal(seen.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(seen.init.headers['x-api-key'], 'sk-test');
  assert.equal(seen.init.headers['anthropic-version'], '2023-06-01');
  assert.equal(seen.body.model, MODEL);
  assert.equal(MODEL, 'claude-haiku-4-5-20251001');
  assert.equal(r.statement, good.statement);
});

test('runAi throws on HTTP error and invalid JSON', async () => {
  await assert.rejects(runAi({ apiKey: 'k', prompt: 'p', fetchImpl: async () => new Response('x', { status: 529 }) }), /HTTP 529/);
  const junk = async () => new Response(JSON.stringify({ content: [{ type: 'text', text: 'I cannot' }] }), { status: 200 });
  await assert.rejects(runAi({ apiKey: 'k', prompt: 'p', fetchImpl: junk }), /no JSON/);
});

test('mergeCompetitors keeps coMentions from rules, drops own brand, max 5', () => {
  const ranked = [{ name: 'Asana', website: 'https://asana.com', reason: 'r', coMentions: 4, score: 9 }];
  const ai = [{ name: 'acme', website: null, reason: 'self' }, { name: 'ASANA', website: null, reason: 'Rival' }, { name: 'Notion', website: 'https://notion.so', reason: 'Docs' }];
  assert.deepEqual(mergeCompetitors(ranked, ai, 'Acme'), [
    { name: 'ASANA', website: 'https://asana.com', reason: 'Rival', coMentions: 4 },
    { name: 'Notion', website: 'https://notion.so', reason: 'Docs', coMentions: 0 },
  ]);
  assert.deepEqual(mergeCompetitors(ranked, [], 'Acme'), [{ name: 'Asana', website: 'https://asana.com', reason: 'r', coMentions: 4 }]);
});

test('validateAi and mergeCompetitors tolerate malformed data', () => {
  const malformed = {
    statement: 'Test',
    audience: 'Everyone',
    differentiators: ['a'],
    tone: 'friendly',
    siteSocialConsistency: 'yes',
    newsSentiment: 'positive',
    competitors: [null, 5, { name: 7 }],
  };
  const r = validateAi(malformed);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.competitors, []);

  // mergeCompetitors with undefined/null inputs
  assert.doesNotThrow(() => mergeCompetitors(undefined, null, 'Acme'));
  assert.deepEqual(mergeCompetitors(undefined, null, 'Acme'), []);

  // mergeCompetitors with malformed ranked/aiList
  assert.doesNotThrow(() => mergeCompetitors([null], [{ name: 'A' }], 'x'));
  assert.deepEqual(mergeCompetitors([null], [{ name: 'A' }], 'x'), [{ name: 'A', website: null, reason: '', coMentions: 0 }]);

  assert.doesNotThrow(() => mergeCompetitors([{ name: 'A' }], [{ name: 7 }], 'x'));
  assert.deepEqual(mergeCompetitors([{ name: 'A' }], [{ name: 7 }], 'x'), []);

  assert.doesNotThrow(() => mergeCompetitors([null, { name: 7 }], null, 'x'));
  assert.deepEqual(mergeCompetitors([null, { name: 7 }], null, 'x'), []);
});

test('validateAi rejects URLs over 300 chars and validates website URLs', () => {
  const longUrl = 'https://' + 'a'.repeat(300) + '.com';
  const good = {
    statement: 'Test',
    audience: 'Everyone',
    differentiators: ['a'],
    tone: 'friendly',
    siteSocialConsistency: 'yes',
    newsSentiment: 'positive',
    competitors: [
      { name: 'Bad', website: longUrl, reason: 'too long' },
      { name: 'Good', website: 'https://example.com', reason: 'valid' },
      { name: 'Malicious', website: 'javascript:1', reason: 'junk' },
    ],
  };
  const r = validateAi(good);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.competitors, [
    { name: 'Bad', website: null, reason: 'too long' },
    { name: 'Good', website: 'https://example.com/', reason: 'valid' },
    { name: 'Malicious', website: null, reason: 'junk' },
  ]);
});

test('mergeCompetitors validates every website with isHttpUrl', () => {
  const ranked = [{ name: 'Safe', website: 'https://safe.com', reason: 'ok', coMentions: 2, score: 5 }];
  const ai = [
    { name: 'Unsafe', website: 'javascript:alert(1)', reason: 'bad' },
    { name: 'Valid', website: 'https://valid.org', reason: 'good' },
    { name: 'Safe', website: null, reason: 'duplicate' },
  ];
  const result = mergeCompetitors(ranked, ai, 'Brand');
  assert.deepEqual(result, [
    { name: 'Unsafe', website: null, reason: 'bad', coMentions: 0 },
    { name: 'Valid', website: 'https://valid.org', reason: 'good', coMentions: 0 },
    { name: 'Safe', website: 'https://safe.com', reason: 'duplicate', coMentions: 2 },
  ]);
});
