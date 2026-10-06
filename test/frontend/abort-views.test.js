import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from '../helpers/fake-dom.js';
import { memStorage } from '../helpers/mem-storage.js';
import { createLibrary, safeStorage } from '../../assets/js/library.js';
import { generateWorkflowKeyPair } from '../../shared/crypto.js';

let restore;
let keys;
before(async () => {
  restore = installFakeDom();
  keys = await generateWorkflowKeyPair();
  const Node = globalThis.document.createElement('div').constructor;
  Object.assign(Node.prototype, {
    querySelectorAll() { return []; },
    querySelector() { return null; },
    removeAttribute() {},
  });
});
after(() => restore());

const walk = (n, fn) => { fn(n); for (const c of n.children ?? []) walk(c, fn); };
const findTag = (root, tag) => { let out = null; walk(root, (n) => { if (!out && n.tagName === tag) out = n; }); return out; };

test('new view: aborting while startAnalysis is in flight does not navigate', async () => {
  const { render } = await import('../../assets/js/views/new.js');
  const FormDataPrev = globalThis.FormData;
  globalThis.FormData = class { get(k) { return ({ name: 'Acme', website: 'acme.test', industry: 'SaaS' })[k] ?? ''; } };
  try {
    for (const abort of [true, false]) {
      const s = memStorage();
      const library = createLibrary(safeStorage(() => s));
      const navigated = [];
      let release;
      const gate = new Promise((r) => { release = r; });
      const ctx = {
        hasToken: true,
        repo: { owner: 'o', repo: 'r' },
        github: { dispatch: async () => { await gate; } },
        library,
        industries: async () => ({ saas: { label: 'SaaS' } }),
        publicJwk: async () => keys.publicJwk,
        navigate: (hash) => navigated.push(hash),
      };
      const ac = new AbortController();
      const root = globalThis.document.createElement('div');
      await render(root, {}, ctx, ac.signal);
      const form = findTag(root, 'FORM');
      const submit = form.listeners.submit[0]({ preventDefault() {} });
      await new Promise((r) => setImmediate(r));
      if (abort) ac.abort();
      release();
      await submit;
      assert.equal(library.list().length, 1, 'dispatch happened');
      assert.equal(navigated.length, abort ? 0 : 1);
      if (!abort) assert.match(navigated[0], /^#\/report\/[A-Za-z0-9_-]{22}/);
    }
  } finally {
    globalThis.FormData = FormDataPrev;
  }
});

test('dashboard export card warns that downloads are unencrypted', async () => {
  const { render } = await import('../../assets/js/views/dashboard.js');
  const s = memStorage();
  const ctx = { repo: { owner: 'o', repo: 'r' }, hasToken: false, library: createLibrary(safeStorage(() => s)), fetchText: async () => null, rerender() {} };
  const root = globalThis.document.createElement('div');
  render(root, {}, ctx, new AbortController().signal);
  assert.match(root.textContent, /Downloaded files are not encrypted\. This file contains the private links to every report in it — store it like a password\./);
});
