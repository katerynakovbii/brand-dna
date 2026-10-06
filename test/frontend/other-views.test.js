import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom, find, byText, makeRoot, tick } from '../helpers/fake-dom.js';
import { makeCtx, sampleReport, ID } from '../helpers/view-ctx.js';

const restore = installFakeDom();
const shared = await import('../../assets/js/views/shared.js');
const compare = await import('../../assets/js/views/compare.js');
const reports = await import('../../assets/js/views/reports.js');
const { createContext } = await import('../../assets/js/context.js');
test.after(restore);

const KEY = 'k'.repeat(43);

test('shared view explains a bad link', async () => {
  const ctx = await makeCtx({ loadShared: async () => ({ ok: false, message: 'This link is incomplete or has expired.' }) });
  const root = makeRoot();
  await shared.render(root, { name: 'shared', id: ID('S'), key: KEY }, ctx);
  assert.match(root.textContent, /This link is incomplete or has expired\./);
});

test('shared view is read-only and can be saved to my reports', async () => {
  const ctx = await makeCtx();
  const root = makeRoot();
  await shared.render(root, { name: 'shared', id: ID('S'), key: KEY }, ctx);
  assert.match(root.textContent, /Shared report/);
  assert.equal(byText(root, 'button', 'Share'), null);
  byText(root, 'button', 'Save to my reports').click();
  await tick();
  await tick();
  assert.equal((await ctx.library.get(ID('P'))).name, 'Acme');
  assert.deepEqual(ctx.calls.navigate, [`#/report/${ID('P')}`]);
});

test('shared view offers to open a report already saved', async () => {
  const ctx = await makeCtx();
  await ctx.library.put(sampleReport());
  const root = makeRoot();
  await shared.render(root, { name: 'shared', id: ID('S'), key: KEY }, ctx);
  assert.ok(find(root, (n) => n.tagName === 'A' && n.getAttribute('href') === `#/report/${ID('P')}`));
  assert.equal(byText(root, 'button', 'Save to my reports'), null);
});

test('compare needs both reports in the library', async () => {
  const ctx = await makeCtx();
  await ctx.library.put(sampleReport());
  const root = makeRoot();
  await compare.render(root, { name: 'compare', a: ID('P'), b: ID('C') }, ctx);
  assert.match(root.textContent, /Run both analyses first\./);
});

test('compare renders both reports side by side', async () => {
  const ctx = await makeCtx();
  await ctx.library.put(sampleReport());
  await ctx.library.put(sampleReport({ id: ID('C'), type: 'competitor', parentId: ID('P'), input: { name: 'Rival', website: 'https://rival.test' } }));
  const root = makeRoot();
  await compare.render(root, { name: 'compare', a: ID('P'), b: ID('C') }, ctx);
  assert.match(root.textContent, /Acme vs Rival/);
  assert.ok(find(root, (n) => n.tagName === 'TABLE'));
});

test('reports page lists every report with backup tools', async () => {
  const ctx = await makeCtx();
  await ctx.library.put(sampleReport());
  await ctx.library.put(sampleReport({ id: ID('C'), type: 'competitor', parentId: ID('P'), input: { name: 'Rival', website: 'https://rival.test' } }));
  const root = makeRoot();
  await reports.render(root, { name: 'reports' }, ctx);
  assert.ok(byText(root, 'a', 'Acme'));
  assert.ok(byText(root, 'a', 'Rival'));
  assert.match(root.textContent, /Competitor of Acme/);
  assert.ok(byText(root, 'button', 'Export'));
  assert.ok(byText(root, 'button', 'Import'));
  assert.match(root.textContent, /Downloaded files are not encrypted\./);
});

test('Remove asks for a second click before deleting', async () => {
  let rerendered = 0;
  const ctx = await makeCtx({ rerender: () => rerendered++ });
  await ctx.library.put(sampleReport());
  const root = makeRoot();
  await reports.render(root, { name: 'reports' }, ctx);
  const btn = byText(root, 'button', 'Remove');
  btn.click();
  await tick();
  assert.ok(await ctx.library.get(ID('P')));
  assert.equal(btn.textContent, 'Click again to remove');
  btn.click();
  await tick();
  assert.equal(await ctx.library.get(ID('P')), null);
  assert.equal(rerendered, 1);
});

test('reports page has an empty state', async () => {
  const ctx = await makeCtx();
  const root = makeRoot();
  await reports.render(root, { name: 'reports' }, ctx);
  assert.match(root.textContent, /No reports yet/);
});

test('createContext wires network helpers through fetchImpl', async () => {
  const urls = [];
  const fetchImpl = async (url) => { urls.push(url); return new Response('', { status: 404 }); };
  const ctx = createContext({ library: {}, fetchImpl, navigate: () => {} });
  const r = await ctx.loadShared(ID('S'), KEY);
  assert.equal(r.ok, false);
  assert.deepEqual(urls, [`/api/share?id=${ID('S')}`]);
  await assert.rejects(ctx.industries(), /industry list/);
});
