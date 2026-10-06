const STOP = new Set(`a an the and or but of to in on for with by at from as is are was were be been it its this that these those
you your we our us they their them i me my not no yes can will just than then so such into over under about more most very also
all any each other some what which who how when where why do does did have has had get got make made new use using via per
up out off only own same too now here there one two home page menu click learn read sign login log contact cookie cookies
privacy policy terms rights reserved copyright skip content search cart account shop subscribe newsletter email follow
english language free start today see view all get started lets let's while`.split(/\s+/).filter(Boolean));

export const ARCHETYPES = {
  'price-led': ['cheap', 'affordable', 'low cost', 'save', 'savings', 'discount', 'budget', 'best price', 'deal'],
  premium: ['premium', 'luxury', 'exclusive', 'finest', 'crafted', 'bespoke', 'handmade', 'high-end'],
  'enterprise / B2B': ['enterprise', 'business', 'businesses', 'teams', 'b2b', 'companies', 'organizations', 'compliance', 'roi'],
  consumer: ['family', 'everyday', 'home', 'lifestyle', 'personal', 'yourself', 'gift'],
  sustainability: ['sustainable', 'sustainability', 'eco', 'green', 'organic', 'recycled', 'carbon', 'planet', 'ethical'],
  innovation: ['ai', 'innovative', 'innovation', 'smart', 'technology', 'future', 'cutting-edge', 'automation'],
  community: ['community', 'together', 'members', 'join', 'belong'],
};

const EMPTY = { statement: null, audience: null, differentiators: [], tone: null, siteSocialConsistency: null, newsSentiment: null, phrases: [], tags: [] };

function tokenize(text, exclude) {
  return String(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^['-]+|['-]+$/g, ''))
    .map((w) => (w.length < 3 || STOP.has(w) || exclude.has(w) || /^\d+$/.test(w) ? null : w));
}

const boostedText = (site) => [site.title, site.description, ...(site.h1 || []), ...(site.h2 || [])].filter(Boolean).join(' . ');

export function extractPhrases(site, { exclude = [], limit = 10 } = {}) {
  const ex = new Set(exclude.map((x) => x.toLowerCase()));
  const scores = new Map();
  const bump = (k, w) => scores.set(k, (scores.get(k) || 0) + w);
  const add = (text, weight) => {
    const words = tokenize(text, ex);
    words.forEach((a, i) => {
      if (!a) return;
      bump(a, weight);
      const b = words[i + 1];
      if (b) bump(`${a} ${b}`, weight * 1.5);
    });
  };
  add(site.text || '', 1);
  add(boostedText(site), 3);
  const ranked = [...scores.entries()].filter(([, s]) => s >= 2).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const out = [];
  for (const [phrase] of ranked) {
    if (out.length >= limit) break;
    if (!phrase.includes(' ') && out.some((p) => p.split(' ').includes(phrase))) continue;
    out.push(phrase);
  }
  return out;
}

function countHits(text, words) {
  return words.reduce((n, w) => n + (text.match(new RegExp(`\\b${w.replace(/[-]/g, '\\-')}\\b`, 'g')) || []).length, 0);
}

function pickStatement(site, name) {
  const brand = name.toLowerCase();
  const words = (s) => s.split(/\s+/).length;
  const titleParts = (site.title || '').split(/\s[|\-–—:]\s/).map((s) => s.trim()).filter((s) => s.toLowerCase() !== brand);
  const candidates = [site.h1?.[0], ...titleParts, site.og?.title, site.description].filter(Boolean);
  return candidates.find((c) => c.toLowerCase() !== brand && words(c) >= 3 && words(c) <= 30) || candidates[0] || null;
}

export function positioningRules({ site, name }) {
  if (!site) return { ...EMPTY };
  const lower = `${site.text || ''} ${boostedText(site)}`.toLowerCase();
  const tags = Object.entries(ARCHETYPES)
    .map(([tag, words]) => [tag, countHits(lower, words)])
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag]) => tag);
  const audience = tags.includes('enterprise / B2B') ? 'Businesses and teams (B2B)' : tags.includes('consumer') ? 'Consumers' : null;
  const differentiators = (site.h2 || []).filter((h) => { const n = h.split(/\s+/).length; return n >= 2 && n <= 12; }).slice(0, 3);
  return {
    ...EMPTY,
    statement: pickStatement(site, name),
    audience,
    differentiators,
    phrases: extractPhrases(site, { exclude: name.split(/\s+/) }),
    tags,
  };
}
