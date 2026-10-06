import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom, find, findAll, byText, makeRoot, tick } from '../helpers/fake-dom.js';
import { makeCtx, sampleReport, ID } from '../helpers/view-ctx.js';

const restore = installFakeDom();
const { render, formToInputs } = await import('../../assets/js/views/home.js');
test.after(restore);

const input = (root, name) => find(root, (n) => (n.tagName === 'INPUT' || n.tagName === 'SELECT' || n.tagName === 'TEXTAREA') && n.getAttribute('name') === name);
const form = (root) => find(root, (n) => n.tagName === 'FORM');
const submit = async (root, website = 'acme.test') => {
  input(root, 'website').value = website;
  form(root).dispatch('submit');
  await tick();
};

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

test('formToInputs keeps blanks optional and maps the custom industry', () => {
  const values = { website: ' acme.test ', name: '', industry: '__custom', industryCustom: 'Pet food', other: 'https://a.test\n\n https://b.test ' };
  const inputs = formToInputs((k) => values[k] ?? '');
  assert.equal(inputs.website, ' acme.test ');
  assert.equal(inputs.industry, 'Pet food');
  assert.equal(inputs.type, 'main');
  assert.deepEqual(inputs.socials.other, ['https://a.test', 'https://b.test']);
  assert.equal(formToInputs(() => '').industry, '');
});

test('home shows the hero form and an explanatory empty state', async () => {
  const ctx = await makeCtx();
  const root = makeRoot();
  await render(root, { name: 'home' }, ctx);
  assert.ok(input(root, 'website'));
  assert.ok(byText(root, 'button', 'Analyze'));
  assert.match(root.textContent, /Paste a company website to see its positioning, channels, online mentions and closest competitors\./);
  assert.match(root.textContent, /This browser can't save reports — use Download or Share\./);
});

test('details are hidden until "Add details" is pressed', async () => {
  const ctx = await makeCtx();
  const root = makeRoot();
  await render(root, { name: 'home' }, ctx);
  const details = find(root, (n) => n.getAttribute('class') === 'details' || n.className === 'details');
  assert.equal(details.hidden, true);
  const toggle = byText(root, 'button', /Add details/);
  toggle.click();
  assert.equal(details.hidden, false);
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.ok(input(root, 'name'));
  assert.ok(input(root, 'industry'));
});

test('a successful run shows live progress, saves the report and opens it', async () => {
  const gate = deferred();
  const ctx = await makeCtx({
    runAnalysis: async (args) => {
      ctx.calls.analyze.push(args);
      args.onEvent({ type: 'progress', source: 'website', state: 'done' });
      args.onEvent({ type: 'detected', name: 'Acme', industry: 'SaaS / Software' });
      await gate.promise;
      return { ok: true, report: sampleReport() };
    },
  });
  const root = makeRoot();
  await render(root, { name: 'home' }, ctx);
  await submit(root);
  assert.equal(ctx.calls.analyze[0].inputs.website, 'acme.test');
  assert.equal(ctx.calls.analyze[0].inputs.type, 'main');
  assert.match(root.textContent, /Analyzing Acme · SaaS \/ Software/);
  const labels = findAll(root, (n) => n.tagName === 'LI').map((n) => n.getAttribute('aria-label')).filter(Boolean);
  assert.ok(labels.includes('Website: done'));
  assert.ok(labels.includes('News: running'));
  assert.ok(byText(root, 'button', 'Cancel'));
  gate.resolve();
  await tick();
  await tick();
  assert.equal((await ctx.library.get(ID('P'))).name, 'Acme');
  assert.deepEqual(ctx.calls.navigate, [`#/report/${ID('P')}`]);
});

test('field errors show under the field and keep the form', async () => {
  const ctx = await makeCtx({ runAnalysis: async () => ({ ok: false, errors: { website: 'Enter a valid website address.' } }) });
  const root = makeRoot();
  await render(root, { name: 'home' }, ctx);
  await submit(root, 'nope');
  assert.match(root.textContent, /Enter a valid website address\./);
  assert.equal(input(root, 'website').getAttribute('aria-invalid'), 'true');
  assert.equal(form(root).hidden, false);
  assert.deepEqual(ctx.calls.navigate, []);
});

test('a failed run shows the message, keeps the input and retries', async () => {
  let n = 0;
  const ctx = await makeCtx({ runAnalysis: async () => (++n === 1 ? { ok: false, message: 'The analysis failed. Try again.' } : { ok: true, report: sampleReport() }) });
  const root = makeRoot();
  await render(root, { name: 'home' }, ctx);
  await submit(root, 'acme.test');
  assert.match(root.textContent, /The analysis failed\. Try again\./);
  assert.equal(input(root, 'website').value, 'acme.test');
  byText(root, 'button', 'Try again').click();
  await tick();
  await tick();
  assert.equal(n, 2);
  assert.deepEqual(ctx.calls.navigate, [`#/report/${ID('P')}`]);
});

test('Cancel aborts the run and brings the form back', async () => {
  let signal;
  const ctx = await makeCtx({
    runAnalysis: ({ signal: s }) => {
      signal = s;
      return new Promise((resolve) => s.addEventListener('abort', () => resolve({ ok: false, aborted: true })));
    },
  });
  const root = makeRoot();
  await render(root, { name: 'home' }, ctx);
  await submit(root);
  byText(root, 'button', 'Cancel').click();
  await tick();
  assert.equal(signal.aborted, true);
  assert.equal(form(root).hidden, false);
  assert.equal(byText(root, 'button', 'Cancel'), null);
});

test('leaving the page aborts a running analysis without navigating', async () => {
  let signal;
  const ctx = await makeCtx({
    runAnalysis: ({ signal: s }) => {
      signal = s;
      return new Promise((resolve) => s.addEventListener('abort', () => resolve({ ok: false, aborted: true })));
    },
  });
  const page = new AbortController();
  const root = makeRoot();
  await render(root, { name: 'home' }, ctx, page.signal);
  await submit(root);
  page.abort();
  await tick();
  assert.equal(signal.aborted, true);
  assert.deepEqual(ctx.calls.navigate, []);
});

test('recent reports list main reports as cards', async () => {
  const ctx = await makeCtx();
  await ctx.library.put(sampleReport());
  await ctx.library.put(sampleReport({ id: ID('C'), type: 'competitor', parentId: ID('P'), input: { name: 'Rival', website: 'https://rival.test' } }));
  const root = makeRoot();
  await render(root, { name: 'home' }, ctx);
  assert.ok(byText(root, 'a', 'Acme'));
  assert.equal(byText(root, 'a', 'Rival'), null);
  assert.match(root.textContent, /72/);
});
