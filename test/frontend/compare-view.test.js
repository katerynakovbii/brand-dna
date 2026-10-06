import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from '../helpers/fake-dom.js';

const restore = installFakeDom();
const { render } = await import('../../assets/js/views/compare.js');
const { reportHash } = await import('../../assets/js/router.js');
const { createLibrary, safeStorage } = await import('../../assets/js/library.js');
const { memStorage } = await import('../helpers/mem-storage.js');
const { encryptReport, generateReportKey, newReportId } = await import('../../shared/crypto.js');
test.after(restore);

const root = () => {
  const r = { kids: [], append(...n) { this.kids.push(...n); } };
  return r;
};
const text = (n) => n.textContent ?? '';

// Patch FakeNode to have remove method
const addRemoveToDom = () => {
  const FakeNode = globalThis.document.createElement('div').constructor;
  if (!FakeNode.prototype.remove) {
    FakeNode.prototype.remove = function() {
      // Remove from parent if exists
      if (this.parentNode) {
        const idx = this.parentNode.children.indexOf(this);
        if (idx !== -1) this.parentNode.children.splice(idx, 1);
      }
    };
    FakeNode.prototype.querySelector = function(sel) {
      // Simplified querySelector for tests
      if (sel === 'tbody') return this.children.find((c) => c.tagName === 'TABLE')?.children.find((c) => c.tagName === 'TBODY');
      if (sel === 'table') return this.children.find((c) => c.tagName === 'TABLE');
      if (sel === 'thead th') return null; // Use querySelectorAll instead
      return null;
    };
    FakeNode.prototype.querySelectorAll = function(sel) {
      // Simplified querySelectorAll for tests
      const results = [];
      const walk = (node) => {
        if (!node.tagName) return;
        if (sel === 'thead th' && node.tagName === 'TH' && node.parentNode?.tagName === 'TR' && node.parentNode?.parentNode?.tagName === 'THEAD') {
          results.push(node);
        }
        if (sel === 'tbody tr' && node.tagName === 'TR' && node.parentNode?.tagName === 'TBODY') {
          results.push(node);
        }
        if (sel === 'table' && node.tagName === 'TABLE') results.push(node);
        if (sel === 'tbody' && node.tagName === 'TBODY') results.push(node);
        for (const child of node.children || []) walk(child);
      };
      walk(this);
      return results;
    };
  }
};
addRemoveToDom();

const rep = (over = {}) => ({
  status: 'ok',
  mode: 'rules',
  positioning: { statement: 'S', audience: null, tags: ['premium'], phrases: ['a', 'b'] },
  touchpoints: { score: 50 },
  mentions: { d7: { total: 1, capped: false }, d30: { total: 5, capped: false }, d60: { total: 100, capped: true } },
  ...over,
});

test('render loads two ready reports and displays comparison table', async () => {
  globalThis.location ??= { origin: 'https://x.test', pathname: '/' };
  const m = memStorage();
  const library = createLibrary(safeStorage(() => m));

  const idA = newReportId();
  const keyA = generateReportKey();
  const reportA = { id: idA, input: { name: 'Acme' }, ...rep() };
  const textA = await encryptReport(reportA, keyA);

  const idB = newReportId();
  const keyB = generateReportKey();
  const reportB = { id: idB, input: { name: 'Beta' }, ...rep({ touchpoints: { score: 80 } }) };
  const textB = await encryptReport(reportB, keyB);

  const r = root();
  const route = { a: idA, ka: keyA, b: idB, kb: keyB };
  const fetchText = async (id) => (id === idA ? textA : id === idB ? textB : null);
  const ctx = { library, actionsUrl: null, fetchText };

  await render(r, route, ctx, undefined);

  // Assert card with title 'Acme vs Beta'
  const card = r.kids.find((k) => k.className === 'card');
  assert.ok(card, 'card should be appended');
  // card-head contains h2 with title
  const cardHead = card.children.find((k) => k.className === 'card-head');
  assert.ok(cardHead, 'card should have card-head');
  const titleH2 = cardHead.children.find((k) => k.tagName === 'H2');
  assert.ok(titleH2, 'card should have h2 title');
  assert.match(text(titleH2), /Acme vs Beta/);

  // Assert table headers with linked names and correct hrefs
  // Find table by walking card children
  const findTableInCard = (node) => {
    for (const child of node.children || []) {
      if (child.tagName === 'TABLE') return child;
      if (child.className === 'compare-table-wrap') return child.children.find((c) => c.tagName === 'TABLE');
    }
    return null;
  };
  const table = findTableInCard(card);
  assert.ok(table, 'table should exist');
  const thead = table.children.find((c) => c.tagName === 'THEAD');
  assert.ok(thead, 'thead should exist');
  const headerRow = thead.children[0];
  const headerLinks = headerRow.children.filter((th) => th.children.some((c) => c.tagName === 'A'));
  assert.equal(headerLinks.length, 2, 'should have 2 header links');
  assert.equal(text(headerLinks[0]), 'Acme');
  assert.equal(text(headerLinks[1]), 'Beta');
  const linkA = headerLinks[0].children.find((c) => c.tagName === 'A');
  const linkB = headerLinks[1].children.find((c) => c.tagName === 'A');
  assert.equal(linkA.getAttribute('href'), reportHash(idA, keyA));
  assert.equal(linkB.getAttribute('href'), reportHash(idB, keyB));

  // Assert tbody has rows
  const tbody = table.children.find((c) => c.tagName === 'TBODY');
  assert.ok(tbody, 'tbody should exist');
  const rows = tbody.children.filter((c) => c.tagName === 'TR');
  assert.ok(rows.length > 0, 'tbody should have rows');

  // Assert at least one row with class 'diff' (different values)
  const diffRows = rows.filter((r) => r.className === 'diff');
  assert.ok(diffRows.length > 0, 'should have at least one diff row (touchpoint score differs)');

  // Assert both reports recorded in library
  assert.ok(library.get(idA), 'report A should be recorded in library');
  assert.ok(library.get(idB), 'report B should be recorded in library');
});

test('render with aborted signal does not render table or record entries', async () => {
  globalThis.location ??= { origin: 'https://x.test', pathname: '/' };
  const m = memStorage();
  const library = createLibrary(safeStorage(() => m));

  const idA = newReportId();
  const keyA = generateReportKey();
  const reportA = { id: idA, input: { name: 'Acme' }, ...rep() };
  const textA = await encryptReport(reportA, keyA);

  const idB = newReportId();
  const keyB = generateReportKey();
  const reportB = { id: idB, input: { name: 'Beta' }, ...rep() };
  const textB = await encryptReport(reportB, keyB);

  const ac = new AbortController();
  const r = root();
  const route = { a: idA, ka: keyA, b: idB, kb: keyB };
  const fetchText = async (id) => {
    ac.abort();
    return id === idA ? textA : id === idB ? textB : null;
  };
  const ctx = { library, actionsUrl: null, fetchText };

  await render(r, route, ctx, ac.signal);

  // Assert no card is appended
  const card = r.kids.find((k) => k.className === 'card');
  assert.equal(card, undefined, 'no card should be appended when aborted');

  // Assert library has no recorded entries
  assert.equal(library.list().length, 0, 'no entries should be recorded when aborted');
});

test('render handles malformed reports without throwing', async () => {
  globalThis.location ??= { origin: 'https://x.test', pathname: '/' };
  const m = memStorage();
  const library = createLibrary(safeStorage(() => m));

  const idA = newReportId();
  const keyA = generateReportKey();
  const reportA = {
    id: idA,
    status: 'failed',
    input: { name: { x: 1 } },
    positioning: { tags: 'nope' },
    touchpoints: {},
    mentions: {},
  };
  const textA = await encryptReport(reportA, keyA);

  const idB = newReportId();
  const keyB = generateReportKey();
  const reportB = {
    id: idB,
    status: 'ok',
    input: null,
    positioning: {},
    touchpoints: {},
    mentions: {},
  };
  const textB = await encryptReport(reportB, keyB);

  const r = root();
  const route = { a: idA, ka: keyA, b: idB, kb: keyB };
  const fetchText = async (id) => (id === idA ? textA : id === idB ? textB : null);
  const ctx = { library, actionsUrl: null, fetchText };

  // Should not throw
  await render(r, route, ctx, undefined);

  // Assert card exists
  const card = r.kids.find((k) => k.className === 'card');
  assert.ok(card, 'card should be appended');

  // Assert title is exactly 'A vs B' (fallbacks for malformed names)
  const cardHead = card.children.find((k) => k.className === 'card-head');
  const titleH2 = cardHead.children.find((k) => k.tagName === 'H2');
  assert.equal(text(titleH2), 'A vs B');

  // Assert header links read 'Report' (fallback for malformed input)
  const findTableInCard2 = (node) => {
    for (const child of node.children || []) {
      if (child.tagName === 'TABLE') return child;
      if (child.className === 'compare-table-wrap') return child.children.find((c) => c.tagName === 'TABLE');
    }
    return null;
  };
  const table = findTableInCard2(card);
  assert.ok(table, 'table should be present');
  const thead = table.children.find((c) => c.tagName === 'THEAD');
  const headerRow = thead.children[0];
  const headerLinks = headerRow.children.filter((th) => th.children.some((c) => c.tagName === 'A'));
  assert.equal(headerLinks.length, 2);
  assert.equal(text(headerLinks[0]), 'Report');
  assert.equal(text(headerLinks[1]), 'Report');

  // Assert error box is present (one report failed)
  const errorBox = card.children.find((k) => k.className && k.className.includes('error'));
  assert.ok(errorBox, 'error box should be appended');
  assert.match(text(errorBox), /One of the analyses failed/);
});
