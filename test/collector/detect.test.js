import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectName, detectIndustry } from '../../collector/detect.mjs';
import { industries } from '../../collector/industries.mjs';

test('detectName prefers JSON-LD org, then og:site_name, then title', () => {
  assert.equal(detectName({ org: { name: 'Acme Inc' }, og: { siteName: 'X' }, title: 'Y' }, 'https://acme.com'), 'Acme Inc');
  assert.equal(detectName({ org: null, og: { siteName: 'Acme' }, title: 'Y' }, 'https://acme.com'), 'Acme');
  assert.equal(detectName({ org: null, og: {}, title: 'Acme | Project tools' }, 'https://acme.com'), 'Acme');
  assert.equal(detectName({ org: null, og: {}, title: 'Acme – Project tools' }, 'https://acme.com'), 'Acme');
});

test('detectName falls back to domain', () => {
  assert.equal(detectName(null, 'https://www.acme-labs.co.uk/'), 'Acme-labs');
  assert.equal(detectName({ org: null, og: {}, title: '   ' }, 'https://acme.com/'), 'Acme');
  assert.equal(detectName(null, 'not a url'), 'Brand');
});

test('detectIndustry needs at least two keyword hits', () => {
  const site = { title: 'Acme software platform', description: 'Cloud automation API', h1: [], h2: [] };
  assert.equal(detectIndustry(site, industries), 'saas');
  assert.equal(detectIndustry({ title: 'Acme app', description: '', h1: [], h2: [] }, industries), 'default');
  assert.equal(detectIndustry({ title: null, description: null }, industries), 'default');
  assert.equal(detectIndustry(null, industries), 'default');
});
