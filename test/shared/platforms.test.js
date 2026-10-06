import { test } from 'node:test';
import assert from 'node:assert/strict';
import { platformOf, isHttpUrl, normalizeUrl } from '../../shared/platforms.js';

test('platformOf detects platforms', () => {
  assert.equal(platformOf('https://www.instagram.com/acme'), 'instagram');
  assert.equal(platformOf('https://twitter.com/acme'), 'x');
  assert.equal(platformOf('https://x.com/acme'), 'x');
  assert.equal(platformOf('https://uk.linkedin.com/company/acme'), 'linkedin');
  assert.equal(platformOf('https://youtu.be/abc'), 'youtube');
  assert.equal(platformOf('https://www.pinterest.co.uk/acme'), 'pinterest');
  assert.equal(platformOf('https://notinstagram.com/x'), null);
  assert.equal(platformOf('not a url'), null);
});

test('isHttpUrl accepts only http(s)', () => {
  assert.equal(isHttpUrl('https://a.com'), true);
  assert.equal(isHttpUrl('http://a.com/x'), true);
  assert.equal(isHttpUrl('javascript:alert(1)'), false);
  assert.equal(isHttpUrl('ftp://a.com'), false);
  assert.equal(isHttpUrl(null), false);
});

test('normalizeUrl strips noise', () => {
  assert.equal(normalizeUrl('https://www.Acme.com/news/?utm_source=x&id=2#top'), 'acme.com/news?id=2');
  assert.equal(normalizeUrl('http://acme.com/news/'), 'acme.com/news');
  assert.equal(normalizeUrl('https://acme.com/?fbclid=1&ref=tw'), 'acme.com');
});
