import { isHttpUrl, PLATFORM_LABELS } from '../../shared/platforms.js';

const DASH = '—';
const DATE_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export function formatDate(iso) {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? DASH : DATE_FMT.format(t);
}

export const mentionsLabel = (w) => (Number.isFinite(w?.total) ? `${w.total}${w.capped ? '+' : ''}` : DASH);

export const STATUS_LABELS = {
  live: 'Live', found: 'Found on your site', unverified: 'Unverified', broken: 'Broken', missing: 'Missing',
};

export const SOURCE_LABELS = {
  'google-news': 'Google News', 'bing-news': 'Bing News', hackernews: 'Hacker News', reddit: 'Reddit',
  website: 'Website', socials: 'Social profiles', news: 'News', community: 'Community', competitors: 'Competitor search',
};

export const SENTIMENT_LABELS = { positive: 'Positive', neutral: 'Neutral', negative: 'Negative', mixed: 'Mixed', unknown: 'Unknown' };

export const kindLabel = (kind) => (Object.hasOwn(PLATFORM_LABELS, kind) ? PLATFORM_LABELS[kind] : kind);
export const safeHref = (url) => (isHttpUrl(url) ? url : null);

export function displayHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function row(label, a, b, nums = null) {
  let better = null;
  if (nums && nums[0] !== nums[1]) better = nums[0] > nums[1] ? 'a' : 'b';
  return { label, a, b, diff: a !== b, better };
}

export function compareRows(a, b) {
  const ok = (r) => r?.status === 'ok';
  const text = (r, f) => (ok(r) && r.positioning?.[f]) || DASH;
  const list = (r, f, n) => {
    if (!ok(r) || !Array.isArray(r.positioning?.[f])) return DASH;
    const filtered = r.positioning[f].filter((x) => typeof x === 'string');
    return filtered.length ? filtered.slice(0, n).join(', ') : DASH;
  };
  const score = (r) => (ok(r) && r.touchpoints ? r.touchpoints.score : null);
  const win = (r, d) => (ok(r) && r.mentions ? r.mentions[`d${d}`] : null);
  const sa = score(a);
  const sb = score(b);
  const saN = Number.isFinite(sa) ? sa : null;
  const sbN = Number.isFinite(sb) ? sb : null;
  return [
    row('Positioning', text(a, 'statement'), text(b, 'statement')),
    row('Audience', text(a, 'audience'), text(b, 'audience')),
    row('Archetypes', list(a, 'tags', 3), list(b, 'tags', 3)),
    row('Touchpoint score', saN == null ? DASH : `${saN}/100`, sbN == null ? DASH : `${sbN}/100`, saN != null && sbN != null ? [saN, sbN] : null),
    ...[7, 30, 60].map((d) => {
      const wa = win(a, d);
      const wb = win(b, d);
      const waN = Number.isFinite(wa?.total) ? wa.total : null;
      const wbN = Number.isFinite(wb?.total) ? wb.total : null;
      return row(`Mentions — ${d} days`, mentionsLabel(wa), mentionsLabel(wb), waN != null && wbN != null ? [waN, wbN] : null);
    }),
    row('Top phrases', list(a, 'phrases', 5), list(b, 'phrases', 5)),
  ];
}
