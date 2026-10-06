import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from '../helpers/fake-dom.js';
import { runningCard, errorBox, scoreRing, sparkline, downloadBar } from '../../assets/js/components/ui.js';

let restore;
before(() => { restore = installFakeDom(); });
after(() => restore());

test('helpers do not throw on missing optional args', () => {
  assert.doesNotThrow(() => runningCard());
  assert.doesNotThrow(() => runningCard({ name: 'Acme' }));
  assert.doesNotThrow(() => errorBox('boom'));
  assert.doesNotThrow(() => scoreRing(undefined));
  assert.doesNotThrow(() => sparkline(null));
  assert.doesNotThrow(() => downloadBar());
  assert.match(downloadBar([]).textContent, /Downloaded files are not encrypted\./);
});

test('errorBox only links http(s) actions urls', () => {
  const link = (el) => el.children[1]?.children[0];
  assert.equal(link(errorBox('x', { actionsUrl: 'javascript:alert(1)' }))?.getAttribute('href') ?? null, null);
  assert.equal(link(errorBox('x', { actionsUrl: 'https://github.com/o/r/actions' })).getAttribute('href'), 'https://github.com/o/r/actions');
});
