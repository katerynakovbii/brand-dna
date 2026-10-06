import { test } from 'node:test';
import assert from 'node:assert/strict';
import { industries, resolveIndustry } from '../../collector/industries.mjs';
import { computeTouchpoints } from '../../collector/analyze/touchpoints.mjs';

test('resolveIndustry matches key, label, alias, falls back to default', () => {
  assert.equal(resolveIndustry('saas'), 'saas');
  assert.equal(resolveIndustry('SaaS / Software'), 'saas');
  assert.equal(resolveIndustry('Specialty coffee roaster'), 'food');
  assert.equal(resolveIndustry('Underwater basket weaving'), 'default');
  assert.equal(resolveIndustry(''), 'default');
});

test('every industry has label, expected and keywords', () => {
  for (const [k, v] of Object.entries(industries)) {
    assert.ok(v.label && Array.isArray(v.expected) && Array.isArray(v.keywords), k);
  }
});

const website = { source: 'website', ok: true, data: { hasBlog: true, feedUrl: null } };
const socials = {
  source: 'socials', ok: true, data: {
    profiles: [
      { platform: 'linkedin', url: 'https://linkedin.com/company/a', discovered: false, check: 'unverified' },
      { platform: 'x', url: 'https://x.com/a', discovered: true, check: 'reachable' },
      { platform: 'youtube', url: 'https://youtube.com/@a', discovered: false, check: 'unreachable' },
      { platform: 'pinterest', url: 'https://pinterest.com/a', discovered: false, check: 'reachable' },
    ],
  },
};

test('statuses and score for saas', () => {
  const t = computeTouchpoints({ website, socials, websiteUrl: 'https://a.test', industryKey: 'saas', table: industries });
  const by = Object.fromEntries(t.items.map((i) => [i.kind, i.status]));
  assert.deepEqual(by, {
    website: 'live', blog: 'live', newsletter: 'missing', linkedin: 'unverified', x: 'found', youtube: 'broken', pinterest: 'live',
  });
  // expected: website, blog, newsletter, linkedin, x, youtube → present: website, blog, linkedin, x = 4/6
  assert.equal(t.score, 67);
  assert.equal(t.items.find((i) => i.kind === 'x').discovered, true);
});

test('website down → broken; non-expected missing items are omitted', () => {
  const t = computeTouchpoints({
    website: { source: 'website', ok: false, error: 'HTTP 500' },
    socials: { source: 'socials', ok: true, data: { profiles: [] } },
    websiteUrl: 'https://a.test', industryKey: 'food', table: industries,
  });
  assert.equal(t.items.find((i) => i.kind === 'website').status, 'broken');
  assert.equal(t.items.some((i) => i.kind === 'blog'), false, 'blog not expected for food');
  assert.equal(t.score, 0);
});

test('no website given (competitor run) → website missing, not broken', () => {
  const t = computeTouchpoints({
    website: { source: 'website', ok: false, error: 'No website provided' },
    socials: { source: 'socials', ok: true, data: { profiles: [] } },
    websiteUrl: null, industryKey: 'saas', table: industries,
  });
  assert.equal(t.items.find((i) => i.kind === 'website').status, 'missing');
});
