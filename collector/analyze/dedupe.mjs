import { normalizeUrl } from '../../shared/platforms.js';

export function titleTokens(t) {
  return new Set(String(t).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 2));
}

export function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export function dedupeMentions(items) {
  const sorted = [...items].sort((a, b) => b.date.localeCompare(a.date));
  const byUrl = new Map();
  for (const it of sorted) {
    const k = normalizeUrl(it.url);
    if (!byUrl.has(k)) byUrl.set(k, it);
  }
  const kept = [];
  for (const it of byUrl.values()) {
    const tokens = titleTokens(it.title);
    if (kept.some((k) => jaccard(k.tokens, tokens) >= 0.8)) continue;
    kept.push({ it, tokens });
  }
  return kept.map((k) => k.it);
}
