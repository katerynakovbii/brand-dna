import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectSocials } from '../../collector/collectors/socials.mjs';
import { fakeFetcher } from '../helpers/fake-fetch.js';

const og = (t, d) => `<html><head><meta property="og:title" content="${t}"><meta property="og:description" content="${d}"></head></html>`;

test('checks entered and discovered profiles, dedupes, classifies blocks', async () => {
  const fetcher = fakeFetcher([
    ['https://www.instagram.com/acmehq', { status: 200, finalUrl: 'https://www.instagram.com/accounts/login/?next=acmehq', body: 'login' }],
    ['https://www.linkedin.com/company/acme', { status: 999 }],
    ['https://www.facebook.com/acme', { body: og('Acme', 'Acme on Facebook') }],
    ['https://www.tiktok.com/@gone', { status: 404 }],
    ['https://www.youtube.com/@acme', { body: `${og('Acme', 'Videos')}<script>"channelId":"UCabcdefghijklmnopqrstuv"</script>` }],
    [/feeds\/videos\.xml\?channel_id=UCabcdefghijklmnopqrstuv/, { body: `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>V1</title><link rel="alternate" href="https://www.youtube.com/watch?v=1"/><published>2026-10-01T10:00:00Z</published></entry></feed>` }],
  ]);
  const r = await collectSocials(
    { socials: { instagram: 'https://www.instagram.com/acmehq', linkedin: 'https://www.linkedin.com/company/acme', tiktok: 'https://www.tiktok.com/@gone', other: ['https://www.facebook.com/acme'] } },
    { fetcher, discovered: ['https://instagram.com/acmehq/', 'https://www.youtube.com/@acme', 'javascript:x'] },
  );
  assert.equal(r.ok, true);
  const by = Object.fromEntries(r.data.profiles.map((p) => [p.platform, p]));
  assert.equal(r.data.profiles.length, 5, 'instagram deduped across entered/discovered');
  assert.equal(by.instagram.check, 'unverified');
  assert.equal(by.instagram.discovered, false);
  assert.equal(by.linkedin.check, 'unverified');
  assert.equal(by.facebook.check, 'reachable');
  assert.equal(by.facebook.title, 'Acme');
  assert.equal(by.tiktok.check, 'unreachable');
  assert.equal(by.youtube.discovered, true);
  assert.deepEqual(r.data.youtubeVideos, [{ title: 'V1', url: 'https://www.youtube.com/watch?v=1', date: '2026-10-01T10:00:00.000Z' }]);
});

test('network error on blocking platform is unverified, on other is unreachable', async () => {
  const fetcher = fakeFetcher([[/instagram/, new Error('timeout')], [/example\.test/, new Error('timeout')]]);
  const r = await collectSocials({ socials: { instagram: 'https://instagram.com/a', other: ['https://example.test/me'] } }, { fetcher });
  const by = Object.fromEntries(r.data.profiles.map((p) => [p.platform, p.check]));
  assert.deepEqual(by, { instagram: 'unverified', other: 'unreachable' });
});

test('no socials → empty lists', async () => {
  const r = await collectSocials({ socials: {} }, { fetcher: fakeFetcher([]) });
  assert.deepEqual(r.data, { profiles: [], youtubeVideos: [] });
});
