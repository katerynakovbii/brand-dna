import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { openLibrary } from '../../assets/js/store.js';

const id = (c) => c.repeat(22);
const report = (c, over = {}) => ({
  v: 1, id: id(c), type: 'main', parentId: null, createdAt: `2026-10-0${'abc'.indexOf(c) + 1}T00:00:00.000Z`, status: 'ok',
  input: { name: `Brand ${c}`, website: `https://${c}.com/` }, ...over,
});

test('put, list newest first, get, remove', async () => {
  const lib = await openLibrary({ idb: new IDBFactory() });
  assert.equal(lib.persistent, true);
  const e = await lib.put(report('a'));
  assert.deepEqual({ ...e, report: undefined }, { id: id('a'), name: 'Brand a', website: 'https://a.com/', date: '2026-10-01T00:00:00.000Z', type: 'main', parentId: null, status: 'ok', shareUrl: null, report: undefined });
  await lib.put(report('b'));
  assert.deepEqual((await lib.list()).map((x) => x.id), [id('b'), id('a')]);
  assert.equal((await lib.get(id('a'))).report.input.name, 'Brand a');
  assert.equal(await lib.get(id('c')), null);
  await lib.remove(id('a'));
  assert.deepEqual((await lib.list()).map((x) => x.id), [id('b')]);
});

test('data survives reopening the same database', async () => {
  const idb = new IDBFactory();
  await (await openLibrary({ idb })).put(report('a'));
  assert.equal((await (await openLibrary({ idb })).list()).length, 1);
});

test('setShareUrl is kept when the report is saved again', async () => {
  const lib = await openLibrary({ idb: new IDBFactory() });
  await lib.put(report('a'));
  await lib.setShareUrl(id('a'), 'https://x/#/s/a?k=b');
  await lib.put(report('a'));
  assert.equal((await lib.get(id('a'))).shareUrl, 'https://x/#/s/a?k=b');
});

test('export → import into an empty library; duplicates skipped; garbage rejected', async () => {
  const src = await openLibrary({ idb: new IDBFactory() });
  await src.put(report('a'));
  await src.put(report('b'));
  const text = await src.exportJson();
  const dst = await openLibrary({ idb: new IDBFactory() });
  await dst.put(report('a'));
  assert.equal(await dst.importJson(text), 1);
  assert.equal((await dst.list()).length, 2);
  await assert.rejects(dst.importJson('nope'), { message: 'Not a Brand DNA library file.' });
  await assert.rejects(dst.importJson('{"app":"other"}'), { message: 'Not a Brand DNA library file.' });
  assert.equal(await dst.importJson(JSON.stringify({ app: 'brand-dna', v: 2, entries: [{ id: '../x', report: {} }, { report: { id: 'bad' } }] })), 0);
});

test('without IndexedDB the library lives in memory', async () => {
  const lib = await openLibrary({ idb: undefined });
  assert.equal(lib.persistent, false);
  await lib.put(report('a'));
  assert.equal((await lib.list()).length, 1);
  const broken = { open() { throw new Error('SecurityError'); } };
  assert.equal((await openLibrary({ idb: broken })).persistent, false);
});

test('findCompetitor matches by parent and name, ignoring case and failed runs', async () => {
  const lib = await openLibrary({ idb: new IDBFactory() });
  await lib.put(report('b', { type: 'competitor', parentId: id('a'), input: { name: 'Trello', website: null } }));
  await lib.put(report('c', { type: 'competitor', parentId: id('a'), status: 'failed', input: { name: 'Asana', website: null } }));
  assert.equal((await lib.findCompetitor(id('a'), ' trello ')).id, id('b'));
  assert.equal(await lib.findCompetitor(id('a'), 'Asana'), null);
  assert.equal(await lib.findCompetitor(id('z'), 'Trello'), null);
});
