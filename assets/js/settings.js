const TOKEN = 'brand-dna:token';

export function createSettings(storage) {
  return {
    getToken: () => storage.get(TOKEN) || '',
    setToken: (t) => storage.set(TOKEN, String(t).trim()),
    clearToken: () => storage.remove(TOKEN),
  };
}
