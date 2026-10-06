import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from '../helpers/fake-dom.js';
import { h, s } from '../../assets/js/components/h.js';

let restore;
before(() => { restore = installFakeDom(); });
after(() => restore());

test('text children stay text (Review Focus #1)', () => {
  const el = h('p', { class: 'x' }, '<img src=x onerror=alert(1)>', 3, null, false, ['a', ['b']]);
  assert.equal(el.className, 'x');
  assert.equal(el.textContent, '<img src=x onerror=alert(1)>3ab');
  assert.ok(el.children.every((c) => c.nodeType === 3));
});

test('innerHTML is refused', () => {
  assert.throws(() => h('div', { innerHTML: '<b>x</b>' }), /innerHTML/);
  assert.throws(() => h('div', { outerHTML: 'x' }), /innerHTML/);
});

test('href only allows # and http(s); external links are isolated', () => {
  assert.equal(h('a', { href: 'javascript:alert(1)' }).getAttribute('href'), null);
  assert.equal(h('a', { href: 'data:text/html,x' }).getAttribute('href'), null);
  assert.equal(h('a', { href: '#/settings' }).getAttribute('href'), '#/settings');
  assert.equal(h('a', { href: '#/settings' }).getAttribute('target'), null);
  const ext = h('a', { href: 'https://acme.test/' });
  assert.equal(ext.getAttribute('href'), 'https://acme.test/');
  assert.equal(ext.getAttribute('target'), '_blank');
  assert.equal(ext.getAttribute('rel'), 'noopener noreferrer');
});

test('props, events, style', () => {
  let clicked = 0;
  const el = h('button', { onClick: () => clicked++, disabled: true, 'aria-label': 'Go', style: { width: '10px' }, text: 'Go' });
  el.listeners.click[0]();
  assert.equal(clicked, 1);
  assert.equal(el.disabled, true);
  assert.equal(el.getAttribute('aria-label'), 'Go');
  assert.equal(el.style.width, '10px');
  assert.equal(el.textContent, 'Go');
});

test('s() builds SVG elements in the SVG namespace', () => {
  const svg = s('svg', { viewBox: '0 0 10 10' }, s('circle', { r: 4 }));
  assert.equal(svg.namespaceURI, 'http://www.w3.org/2000/svg');
  assert.equal(svg.getAttribute('viewBox'), '0 0 10 10');
  assert.equal(svg.children[0].getAttribute('r'), '4');
});
