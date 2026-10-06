export function parseRoute(hash = '') {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  const q = new URLSearchParams(query);
  if (parts.length === 0) return { name: 'dashboard' };
  if (parts.length === 1 && parts[0] === 'settings') return { name: 'settings' };
  if (parts.length === 1 && parts[0] === 'new') return { name: 'new' };
  if (parts.length === 2 && parts[0] === 'report') return { name: 'report', id: parts[1], key: q.get('k') ?? '' };
  if (parts.length === 2 && parts[0] === 'compare') {
    return { name: 'compare', a: parts[1], ka: q.get('k') ?? '', b: q.get('b') ?? '', kb: q.get('kb') ?? '' };
  }
  return { name: 'notfound' };
}

export const reportHash = (id, key) => `#/report/${id}?k=${key}`;
export const compareHash = (a, ka, b, kb) => `#/compare/${a}?k=${ka}&b=${b}&kb=${kb}`;
export const absoluteLink = (hash, loc = globalThis.location) => `${loc.origin}${loc.pathname}${hash}`;
