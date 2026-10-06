export function parseRoute(hash = '') {
  if (typeof hash !== 'string') return { name: 'notfound' };
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return { name: 'home' };
  if (parts.length === 1 && parts[0] === 'reports') return { name: 'reports' };
  if (parts.length === 2 && parts[0] === 'report') return { name: 'report', id: parts[1] };
  if (parts.length === 3 && parts[0] === 'compare') return { name: 'compare', a: parts[1], b: parts[2] };
  if (parts.length === 2 && parts[0] === 's') return { name: 'shared', id: parts[1], key: new URLSearchParams(query).get('k') ?? '' };
  return { name: 'notfound' };
}

export const reportHash = (id) => `#/report/${id}`;
export const compareHash = (a, b) => `#/compare/${a}/${b}`;
