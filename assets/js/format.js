import { isHttpUrl, PLATFORM_LABELS } from '../../shared/platforms.js';

const DASH = '—';
const DATE_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export function formatDate(iso) {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? DASH : DATE_FMT.format(t);
}

export const mentionsLabel = (w) => (w ? `${w.total}${w.capped ? '+' : ''}` : DASH);

export const STATUS_LABELS = {
  live: 'Live', found: 'Found on your site', unverified: 'Unverified', broken: 'Broken', missing: 'Missing',
};

export const SOURCE_LABELS = {
  'google-news': 'Google News', 'bing-news': 'Bing News', hackernews: 'Hacker News', reddit: 'Reddit',
  website: 'Website', socials: 'Social profiles', news: 'News', community: 'Community', competitors: 'Competitor search',
};

export const SENTIMENT_LABELS = { positive: 'Positive', neutral: 'Neutral', negative: 'Negative', mixed: 'Mixed', unknown: 'Unknown' };

export const kindLabel = (kind) => PLATFORM_LABELS[kind] ?? kind;
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
  const list = (r, f, n) => (ok(r) && r.positioning?.[f]?.length ? r.positioning[f].slice(0, n).join(', ') : DASH);
  const score = (r) => (ok(r) && r.touchpoints ? r.touchpoints.score : null);
  const win = (r, d) => (ok(r) && r.mentions ? r.mentions[`d${d}`] : null);
  const sa = score(a);
  const sb = score(b);
  return [
    row('Positioning', text(a, 'statement'), text(b, 'statement')),
    row('Audience', text(a, 'audience'), text(b, 'audience')),
    row('Archetypes', list(a, 'tags', 3), list(b, 'tags', 3)),
    row('Touchpoint score', sa == null ? DASH : `${sa}/100`, sb == null ? DASH : `${sb}/100`, sa != null && sb != null ? [sa, sb] : null),
    ...[7, 30, 60].map((d) => {
      const wa = win(a, d);
      const wb = win(b, d);
      return row(`Mentions — ${d} days`, mentionsLabel(wa), mentionsLabel(wb), wa && wb ? [wa.total, wb.total] : null);
    }),
    row('Top phrases', list(a, 'phrases', 5), list(b, 'phrases', 5)),
  ];
}
