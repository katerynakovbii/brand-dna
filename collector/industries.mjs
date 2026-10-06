import industries from './industries.json' with { type: 'json' };

export { industries };

export function resolveIndustry(text, table = industries) {
  const t = String(text || '').toLowerCase().trim();
  if (!t) return 'default';
  if (Object.hasOwn(table, t)) return t;
  for (const [key, v] of Object.entries(table)) if (v.label.toLowerCase() === t) return key;
  const words = new Set(t.split(/[^a-z0-9-]+/).filter(Boolean));
  for (const [key, v] of Object.entries(table)) if ((v.aliases || []).some((a) => words.has(a))) return key;
  return 'default';
}
