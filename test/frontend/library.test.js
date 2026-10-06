import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeStorage, createLibrary } from '../../assets/js/library.js';
import { createSettings } from '../../assets/js/settings.js';
import { memStorage } from '../helpers/mem-storage.js';

const entry = (n, extra = {}) => ({
  reportId: String(n).repeat(22).slice(0, 22), reportKey: 'k'.repeat(43), name: `Brand ${n}`, type: 'main',
  parentId: null, createdAt: `2026-10-0${n}T00:00:00.000Z`, status: 'ok', ...extra,
});

test('safeStorage survives throwing storage (Review Focus #5)', () => {
  const throwingGetter = safeStorage(() => { throw new Error('SecurityError'); });
  assert.equal(throwingGetter.get('x'), null);
  assert.equal(throwingGetter.set('x', '1'), false);
  throwingGetter.remove('x');
  const quota = safeStorage(() => ({ getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('QuotaExceeded'); }, removeItem: () => {} }));
  assert.equal(quota.get('x'), null);
  assert.equal(quota.set('x', '1'), false);
  const lib = createLibrary(throwingGetter);
  assert.deepEqual(lib.list(), []);
  assert.doesNotThrow(() => lib.upsert(entry(1)));
});

test('upsert, list newest first, get, remove', () => {
  const store = memStorage();
  const l = createLibrary(safeStorage(() => store));
  l.upsert(entry(1));
  l.upsert(entry(2));
  l.upsert({ ...entry(1), status: 'failed' });
  assert.deepEqual(l.list().map((e) => e.name), ['Brand 2', 'Brand 1']);
  assert.equal(l.get(entry(1).reportId).status, 'failed');
  l.remove(entry(2).reportId);
  assert.equal(l.list().length, 1);
  assert.throws(() => l.upsert({ reportId: 'bad', reportKey: 'bad' }), /invalid/);
});

test('corrupt storage reads as empty; junk entries dropped', () => {
  assert.deepEqual(createLibrary(safeStorage(() => memStorage({ 'brand-dna:library': '{not json' }))).list(), []);
  const mixed = JSON.stringify([entry(1), { reportId: 'x' }, null]);
  assert.equal(createLibrary(safeStorage(() => memStorage({ 'brand-dna:library': mixed }))).list().length, 1);
});

test('export/import adds only missing valid entries', () => {
  const storeA = memStorage();
  const a = createLibrary(safeStorage(() => storeA));
  a.upsert(entry(1));
  a.upsert(entry(2));
  const storeB = memStorage();
  const b = createLibrary(safeStorage(() => storeB));
  b.upsert({ ...entry(1), name: 'Local name' });
  assert.equal(b.importJson(a.exportJson()), 1);
  assert.equal(b.get(entry(1).reportId).name, 'Local name', 'existing entries untouched');
  assert.equal(b.list().length, 2);
  assert.throws(() => b.importJson('nope'), /Not a Brand DNA library file/);
  assert.throws(() => b.importJson('{"foo":1}'), /Not a Brand DNA library file/);
  assert.equal(b.importJson(JSON.stringify([entry(3)])), 1, 'bare arrays accepted');
});

test('findCompetitor matches parent + case-insensitive name, skips failed', () => {
  const store = memStorage();
  const l = createLibrary(safeStorage(() => store));
  const parentId = entry(1).reportId;
  l.upsert(entry(2, { type: 'competitor', parentId, name: 'Trello', status: 'failed' }));
  assert.equal(l.findCompetitor(parentId, 'trello'), null);
  l.upsert(entry(3, { type: 'competitor', parentId, name: 'Trello', status: 'running' }));
  assert.equal(l.findCompetitor(parentId, ' TRELLO ').reportId, entry(3).reportId);
});

test('settings stores token trimmed and clears it', () => {
  const store = memStorage();
  const s = createSettings(safeStorage(() => store));
  assert.equal(s.getToken(), '');
  s.setToken('  github_pat_x  ');
  assert.equal(s.getToken(), 'github_pat_x');
  s.clearToken();
  assert.equal(s.getToken(), '');
});
