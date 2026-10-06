import { test } from 'node:test';
import assert from 'node:assert/strict';
import { positioningRules, extractPhrases } from '../../collector/analyze/positioning.mjs';

const site = {
  title: 'Acme | Project management for remote teams',
  description: 'Acme helps remote teams plan, track and ship work together.',
  h1: ['Project management for remote teams'],
  h2: ['Plan sprints in minutes', 'Automation that saves hours', 'Pricing'],
  og: { title: null },
  text: 'Remote teams use Acme to plan projects. Remote teams love the project timeline. Enterprise teams scale with Acme automation and integrations for business workflow.',
};

test('phrases favour repeated, boosted terms and exclude brand + stopwords', () => {
  const p = extractPhrases(site, { exclude: ['acme'] });
  assert.ok(p.includes('remote teams'), p.join(','));
  assert.ok(!p.some((x) => x.includes('acme')));
  assert.ok(!p.includes('the'));
  assert.ok(p.length <= 10);
});

test('rules positioning', () => {
  const r = positioningRules({ site, name: 'Acme' });
  assert.equal(r.statement, 'Project management for remote teams');
  assert.ok(r.tags.includes('enterprise / B2B'));
  assert.equal(r.audience, 'Businesses and teams (B2B)');
  assert.deepEqual(r.differentiators, ['Plan sprints in minutes', 'Automation that saves hours']);
  assert.equal(r.tone, null);
});

test('statement falls back to title part without brand', () => {
  const r = positioningRules({ site: { ...site, h1: ['Acme'], description: null }, name: 'Acme' });
  assert.equal(r.statement, 'Project management for remote teams');
});

test('no site → empty positioning', () => {
  assert.deepEqual(positioningRules({ site: null, name: 'Acme' }), {
    statement: null, audience: null, differentiators: [], tone: null, siteSocialConsistency: null, newsSentiment: null, phrases: [], tags: [],
  });
});
