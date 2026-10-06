const GENERIC = new Set(`top best alternatives alternative competitors competitor vs versus review reviews software free pricing
comparison compare compared the guide how why what new news inc llc ltd app apps tools tool companies company brands brand like
similar sites year today popular remote list lists more other these those and for with our your this that here
january february march april may june july august september october november december
monday tuesday wednesday thursday friday saturday sunday
reddit youtube google facebook instagram linkedin twitter tiktok wikipedia forbes g2 capterra trustpilot medium quora bing`.split(/\s+/).filter(Boolean));

const SEQ = /\b([A-Z][a-zA-Z0-9&.'-]+(?:\s[A-Z][a-zA-Z0-9&.'-]+){0,2})/g;
const VS = /([A-Z][\w&.'-]*(?:\s[A-Z][\w&.'-]*){0,2})\s+(?:vs\.?|versus)\s+([A-Z][\w&.'-]*(?:\s[A-Z][\w&.'-]*){0,2})/g;

export function extractCandidates(text) {
  const out = [];
  for (const m of text.matchAll(VS)) out.push({ name: m[1], weight: 3 }, { name: m[2], weight: 3 });
  // Split on sentence/list punctuation so "G2. Popular" or "Trello, Asana" don't merge into one name.
  for (const seg of text.split(/[.!?,;:]\s+|\s[-–—|&]\s/)) {
    for (const m of seg.matchAll(SEQ)) out.push({ name: m[1], weight: 1 });
  }
  return out;
}

export function cleanCandidate(raw, brand) {
  const words = raw
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[.,:;!?''-]+$/gu, ''))
    .filter(Boolean);
  while (words.length && GENERIC.has(words[0].toLowerCase())) words.shift();
  while (words.length && GENERIC.has(words.at(-1).toLowerCase())) words.pop();
  if (!words.length) return null;
  const name = words.join(' ');
  const n = name.toLowerCase();
  const b = brand.toLowerCase();
  if (name.length < 2 || n.includes(b) || b.includes(n)) return null;
  return name;
}

function domainBase(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return { host, base: host.split('.')[0] };
  } catch {
    return null;
  }
}

export function rankCompetitors({ name, results, industryKeywords }) {
  const agg = new Map();
  for (const r of results) {
    const text = `${String(r.title ?? '')}.${String(r.snippet ?? '')}`;
    const lower = text.toLowerCase();
    const overlap = industryKeywords.some((k) => lower.includes(k)) ? 1.5 : 1;
    const best = new Map();
    for (const c of extractCandidates(text)) {
      const clean = cleanCandidate(c.name, name);
      if (!clean) continue;
      const key = clean.toLowerCase();
      if ((best.get(key)?.weight ?? 0) < c.weight) best.set(key, { name: clean, weight: c.weight });
    }
    const dom = domainBase(r.url);
    for (const [key, { name: display, weight }] of best) {
      const a = agg.get(key) || { name: display, score: 0, coMentions: 0, website: null };
      a.score += weight * overlap;
      a.coMentions += 1;
      if (!a.website && dom && dom.base === key.replace(/[\s.]+/g, '')) a.website = `https://${dom.host}`;
      agg.set(key, a);
    }
  }
  return [...agg.values()]
    .filter((a) => a.score >= 2)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 15)
    .map((a) => ({
      name: a.name,
      website: a.website,
      reason: `Appears alongside ${name} in ${a.coMentions} search result${a.coMentions === 1 ? '' : 's'}`,
      coMentions: a.coMentions,
      score: a.score,
    }));
}
