import { REPORT_ID_RE, REPORT_KEY_RE } from '../../shared/schema.js';

const KEY = 'brand-dna:library';
const NOT_LIBRARY = 'Not a Brand DNA library file.';

// localStorage can be missing or throw (private mode, blocked site data, quota). Never let that crash the app.
export function safeStorage(getStorage = () => globalThis.localStorage) {
  let cachedStorage = undefined;
  const store = () => {
    if (cachedStorage !== undefined) return cachedStorage;
    try {
      cachedStorage = getStorage() ?? null;
      return cachedStorage;
    } catch {
      cachedStorage = null;
      return null;
    }
  };
  return {
    get(k) {
      try {
        return store()?.getItem(k) ?? null;
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        const s = store();
        if (!s) return false;
        s.setItem(k, v);
        return true;
      } catch {
        return false;
      }
    },
    remove(k) {
      try {
        store()?.removeItem(k);
      } catch {}
    },
  };
}

const isValid = (e) => !!e && REPORT_ID_RE.test(e.reportId ?? '') && REPORT_KEY_RE.test(e.reportKey ?? '');

function clean(e) {
  return {
    reportId: e.reportId,
    reportKey: e.reportKey,
    name: String(e.name ?? '').slice(0, 100),
    type: e.type === 'competitor' ? 'competitor' : 'main',
    parentId: REPORT_ID_RE.test(e.parentId ?? '') ? e.parentId : null,
    createdAt: typeof e.createdAt === 'string' ? e.createdAt : new Date(0).toISOString(),
    status: ['running', 'ok', 'failed'].includes(e.status) ? e.status : 'ok',
  };
}

export function createLibrary(storage) {
  const read = () => {
    try {
      const arr = JSON.parse(storage.get(KEY) ?? '[]');
      return Array.isArray(arr) ? arr.filter(isValid).map(clean) : [];
    } catch {
      return [];
    }
  };
  const write = (arr) => storage.set(KEY, JSON.stringify(arr));
  const list = () => read().sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    list,
    get: (id) => read().find((e) => e.reportId === id) ?? null,
    upsert(entry) {
      if (!isValid(entry)) throw new Error('invalid library entry');
      const arr = read();
      const i = arr.findIndex((e) => e.reportId === entry.reportId);
      const merged = clean({ ...(i >= 0 ? arr[i] : {}), ...entry });
      if (i >= 0) arr[i] = merged;
      else arr.push(merged);
      write(arr);
      return merged;
    },
    remove(id) {
      write(read().filter((e) => e.reportId !== id));
    },
    exportJson: () => JSON.stringify({ app: 'brand-dna', v: 1, entries: read() }, null, 2),
    importJson(text) {
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(NOT_LIBRARY);
      }
      const entries = Array.isArray(data) ? data : data?.app === 'brand-dna' && Array.isArray(data.entries) ? data.entries : null;
      if (!entries) throw new Error(NOT_LIBRARY);
      const arr = read();
      const have = new Set(arr.map((e) => e.reportId));
      let added = 0;
      for (const e of entries) {
        if (!isValid(e) || have.has(e.reportId)) continue;
        arr.push(clean(e));
        have.add(e.reportId);
        added++;
      }
      write(arr);
      return added;
    },
    findCompetitor(parentId, name) {
      const n = name.trim().toLowerCase();
      return list().find((e) => e.type === 'competitor' && e.parentId === parentId && e.name.toLowerCase() === n && e.status !== 'failed') ?? null;
    },
  };
}
