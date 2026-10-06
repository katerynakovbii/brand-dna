// Fills in brand name and industry when the user only gave a website.
const SEP = /\s+[|–—\-:·]\s+/;
const clip = (s) => (typeof s === 'string' ? s.trim().slice(0, 100) : '');

export function detectName(site, websiteUrl) {
  const fromTitle = clip(site?.title).split(SEP)[0].trim();
  for (const c of [site?.org?.name, site?.og?.siteName, fromTitle]) if (clip(c)) return clip(c);
  try {
    const label = new URL(websiteUrl).hostname.replace(/^www\./, '').split('.')[0];
    return label ? label.charAt(0).toUpperCase() + label.slice(1) : 'Brand';
  } catch {
    return 'Brand';
  }
}

export function detectIndustry(site, table) {
  if (!site) return 'default';
  const text = [site.title, site.description, ...(site.h1 ?? []), ...(site.h2 ?? [])].filter(Boolean).join(' ').toLowerCase();
  const words = new Set(text.split(/[^a-z0-9-]+/).filter(Boolean));
  let best = 'default';
  let bestScore = 1;
  for (const [key, v] of Object.entries(table)) {
    const score = (v.keywords ?? []).filter((k) => words.has(k)).length;
    if (score > bestScore) {
      best = key;
      bestScore = score;
    }
  }
  return best;
}
