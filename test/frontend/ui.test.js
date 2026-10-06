import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom, findAll, find, byText } from '../helpers/fake-dom.js';
import { errorBox, scoreRing, sparkline, downloadBar, progressList, toast, menuButton } from '../../assets/js/components/ui.js';

let restore;
before(() => { restore = installFakeDom(); });
after(() => restore());

test('helpers do not throw on missing optional args', () => {
  assert.doesNotThrow(() => errorBox('boom'));
  assert.doesNotThrow(() => scoreRing(undefined));
  assert.doesNotThrow(() => sparkline(null));
  assert.doesNotThrow(() => downloadBar());
  assert.match(downloadBar([]).textContent, /Downloaded files are not encrypted\./);
});

test('errorBox shows message and optional retry action', () => {
  let retried = 0;
  const box = errorBox('boom', { onRetry: () => retried++ });
  assert.equal(box.getAttribute('role'), 'alert');
  assert.match(box.textContent, /boom/);
  byText(box, 'button', 'Try again').click();
  assert.equal(retried, 1);
  assert.equal(byText(errorBox('x'), 'button', 'Try again'), null);
});

const rows = (list) => findAll(list.el, (n) => n.tagName === 'LI');
const labels = (list) => rows(list).map((r) => r.getAttribute('aria-label'));

test('progressList starts with website running and the rest pending', () => {
  const list = progressList();
  assert.deepEqual(labels(list), [
    'Website: running', 'Social profiles: pending', 'News: pending',
    'Community: pending', 'Competitors: pending', 'Analysis: pending',
  ]);
});

test('progressList advances stage by stage', () => {
  const list = progressList();
  list.update('website', 'done');
  assert.deepEqual(labels(list).slice(0, 5), ['Website: done', 'Social profiles: running', 'News: running', 'Community: running', 'Competitors: running']);
  list.update('news', 'failed');
  for (const s of ['socials', 'community', 'competitors']) list.update(s, 'done');
  assert.deepEqual(labels(list).slice(2), ['News: failed', 'Community: done', 'Competitors: done', 'Analysis: running']);
  list.update('analysis', 'done');
  assert.equal(labels(list)[5], 'Analysis: done');
});

test('progressList ignores unknown sources and states', () => {
  const list = progressList();
  assert.doesNotThrow(() => list.update('nope', 'done'));
  list.update('website', 'exploded');
  assert.equal(labels(list)[0], 'Website: running');
});

test('toast appends to host and removes itself', async () => {
  const host = document.createElement('div');
  const el = toast('Link copied', host, { ms: 1 });
  assert.equal(el.parentNode, host);
  assert.equal(el.getAttribute('role'), 'status');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(el.parentNode, null);
});

test('menuButton toggles menu and runs item actions', () => {
  let ran = '';
  const m = menuButton('Download', [{ label: 'JSON', onClick: () => { ran = 'json'; } }, { label: 'CSV', onClick: () => { ran = 'csv'; } }]);
  const trigger = find(m, (n) => n.getAttribute('aria-haspopup') === 'true');
  const menu = find(m, (n) => n.getAttribute('role') === 'menu');
  assert.equal(menu.hidden, true);
  trigger.click();
  assert.equal(menu.hidden, false);
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  byText(menu, 'button', 'CSV').click();
  assert.equal(ran, 'csv');
  assert.equal(menu.hidden, true);
});
