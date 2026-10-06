import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom, find, findAll, byText, makeRoot, tick } from '../helpers/fake-dom.js';
import { makeCtx, sampleReport, ID } from '../helpers/view-ctx.js';

const restore = installFakeDom();
const { render, renderReport } = await import('../../assets/js/views/report.js');
test.after(restore);

async function setup(overrides = {}, report = sampleReport()) {
  const ctx = await makeCtx(overrides);
  await ctx.library.put(report);
  const root = makeRoot();
  await render(root, { name: 'report', id: report.id }, ctx);
  return { ctx, root };
}

test('a report missing from the library says so', async () => {
  const ctx = await makeCtx();
  const root = makeRoot();
  await render(root, { name: 'report', id: ID('Z') }, ctx);
  assert.match(root.textContent, /Report not found in this browser\./);
});

test('summary card shows brand, score, mentions and actions', async () => {
  const { root } = await setup();
  assert.ok(byText(root, 'h1', 'Acme'));
  assert.match(root.textContent, /Project tools for small teams\./);
  assert.match(root.textContent, /Rules-based/);
  assert.ok(byText(root, 'button', 'Share'));
  assert.ok(byText(root, 'button', /Download/));
});

test('section nav scrolls to each section', async () => {
  const { root } = await setup();
  const nav = find(root, (n) => n.tagName === 'NAV');
  const buttons = findAll(nav, (n) => n.tagName === 'BUTTON');
  assert.deepEqual(buttons.map((b) => b.textContent), ['Positioning', 'Touchpoints', 'Mentions', 'Competitors', 'Sources']);
  buttons[3].click();
  const competitors = find(root, (n) => n.getAttribute('id') === 'sec-competitors');
  assert.equal(competitors.scrolled, true);
});

test('Share creates a link once, stores it, copies it and confirms', async () => {
  const { root, ctx } = await setup();
  byText(root, 'button', 'Share').click();
  await tick();
  await tick();
  assert.equal(ctx.calls.share.length, 1);
  assert.equal(ctx.calls.copy[0], `https://app.test/#/s/${ID('S')}?k=${'k'.repeat(43)}`);
  assert.equal((await ctx.library.get(ID('P'))).shareUrl, ctx.calls.copy[0]);
  assert.match(ctx.toastHost.textContent, /Link copied/);
  byText(root, 'button', 'Share').click();
  await tick();
  await tick();
  assert.equal(ctx.calls.share.length, 1);
  assert.equal(ctx.calls.copy.length, 2);
});

test('a failed share shows a toast and keeps the report', async () => {
  const { root, ctx } = await setup({ createShareLink: async () => { throw new Error('share failed (502)'); } });
  byText(root, 'button', 'Share').click();
  await tick();
  await tick();
  assert.match(ctx.toastHost.textContent, /Couldn't create a link — try again/);
  assert.equal((await ctx.library.get(ID('P'))).shareUrl, null);
});

test('Analyze runs a competitor inline, then offers Compare', async () => {
  const competitor = sampleReport({ id: ID('C'), type: 'competitor', parentId: ID('P'), input: { name: 'Rival', website: 'https://rival.test' } });
  const { root, ctx } = await setup({
    runAnalysis: async (args) => {
      ctx.calls.analyze.push(args);
      args.onEvent({ type: 'progress', source: 'website', state: 'done' });
      return { ok: true, report: competitor };
    },
  });
  byText(root, 'button', 'Analyze').click();
  await tick();
  await tick();
  assert.deepEqual(ctx.calls.analyze[0].inputs, { name: 'Rival', website: 'https://rival.test', industry: 'SaaS / Software', socials: {}, type: 'competitor', parentId: ID('P') });
  assert.equal((await ctx.library.get(ID('C'))).parentId, ID('P'));
  byText(root, 'button', 'Compare').click();
  assert.deepEqual(ctx.calls.navigate, [`#/compare/${ID('P')}/${ID('C')}`]);
});

test('a failed competitor run shows the error with a retry', async () => {
  let n = 0;
  const { root } = await setup({ runAnalysis: async () => (++n === 1 ? { ok: false, message: 'The analysis failed. Try again.' } : { ok: false, message: 'still failing' }) });
  byText(root, 'button', 'Analyze').click();
  await tick();
  assert.match(root.textContent, /The analysis failed\. Try again\./);
  byText(root, 'button', 'Try again').click();
  await tick();
  assert.equal(n, 2);
});

test('read-only mode hides Share and competitor actions', async () => {
  const ctx = await makeCtx();
  const root = makeRoot();
  await renderReport(root, sampleReport(), ctx, undefined, { readOnly: true });
  assert.equal(byText(root, 'button', 'Share'), null);
  assert.equal(byText(root, 'button', 'Analyze'), null);
  assert.ok(byText(root, 'button', /Download/));
});

test('renderReport never throws on malformed report data', async () => {
  const ctx = await makeCtx();
  const report = {
    id: ID('P'), status: 'ok', mode: 'rules', input: { name: 5, website: 'javascript:x' },
    positioning: { differentiators: 'x', tags: [1, null, 'a'], phrases: {}, newsSentiment: 'constructor', statement: 7 },
    touchpoints: { score: 'x', items: [null, { kind: 'x', status: 'live', url: 'javascript:1' }], expected: 'x' },
    mentions: { d30: { total: 1, bySource: 'x', weekly: 'x', top: [null] } },
    competitors: [null, { name: 'A', website: 'javascript:1' }], sources: [null],
  };
  await assert.doesNotReject(renderReport(makeRoot(), report, ctx));
  await assert.doesNotReject(renderReport(makeRoot(), { id: ID('P'), status: 'failed', error: 'boom' }, ctx));
});
