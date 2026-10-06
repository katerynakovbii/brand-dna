// Report library in IndexedDB. Falls back to memory when the browser blocks storage (e.g. private mode).
import { REPORT_ID_RE } from '../../shared/schema.js';

const DB = 'brand-dna';
const STORE = 'reports';
const NOT_LIBRARY = 'Not a Brand DNA library file.';

const isReport = (r) => !!r && typeof r === 'object' && REPORT_ID_RE.test(String(r.id));

function entryFrom(report, previous = null) {
  return {
    id: report.id,
    name: String(report.input?.name ?? '').slice(0, 100),
    website: report.input?.website ?? null,
    date: typeof report.createdAt === 'string' ? report.createdAt : new Date(0).toISOString(),
    type: report.type === 'competitor' ? 'competitor' : 'main',
    parentId: REPORT_ID_RE.test(String(report.parentId)) ? report.parentId : null,
    status: report.status === 'failed' ? 'failed' : 'ok',
    shareUrl: previous?.shareUrl ?? null,
    report,
  };
}

const done = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

function openDb(idb) {
  return new Promise((resolve, reject) => {
    const req = idb.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('blocked'));
  });
}

function idbBackend(db) {
  const store = (mode) => db.transaction(STORE, mode).objectStore(STORE);
  return {
    all: () => done(store('readonly').getAll()),
    get: async (id) => (await done(store('readonly').get(id))) ?? null,
    put: (entry) => done(store('readwrite').put(entry)),
    remove: (id) => done(store('readwrite').delete(id)),
  };
}

function memoryBackend() {
  const map = new Map();
  return {
    all: async () => [...map.values()],
    get: async (id) => map.get(id) ?? null,
    put: async (entry) => void map.set(entry.id, entry),
    remove: async (id) => void map.delete(id),
  };
}

export async function openLibrary({ idb = globalThis.indexedDB } = {}) {
  let backend = null;
  try {
    if (idb) backend = idbBackend(await openDb(idb));
  } catch {}
  const persistent = !!backend;
  backend ??= memoryBackend();

  const list = async () => (await backend.all()).sort((a, b) => b.date.localeCompare(a.date));
  const lib = {
    persistent,
    list,
    get: (id) => (REPORT_ID_RE.test(String(id)) ? backend.get(id) : Promise.resolve(null)),
    async put(report) {
      if (!isReport(report)) throw new Error('Invalid report.');
      const entry = entryFrom(report, await backend.get(report.id));
      await backend.put(entry);
      return entry;
    },
    async setShareUrl(id, url) {
      const entry = await backend.get(id);
      if (entry) await backend.put({ ...entry, shareUrl: url });
    },
    remove: (id) => backend.remove(id),
    async exportJson() {
      const entries = (await list()).map(({ shareUrl, ...e }) => e);
      return JSON.stringify({ app: 'brand-dna', v: 2, entries }, null, 2);
    },
    async importJson(text) {
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(NOT_LIBRARY);
      }
      if (data?.app !== 'brand-dna' || !Array.isArray(data.entries)) throw new Error(NOT_LIBRARY);
      let added = 0;
      for (const e of data.entries) {
        if (!isReport(e?.report) || (await backend.get(e.report.id))) continue;
        await backend.put(entryFrom(e.report));
        added++;
      }
      return added;
    },
    async findCompetitor(parentId, name) {
      const n = String(name).trim().toLowerCase();
      return (await list()).find((e) => e.type === 'competitor' && e.parentId === parentId && e.status !== 'failed' && e.name.toLowerCase() === n) ?? null;
    },
  };
  return lib;
}
