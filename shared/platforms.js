const RULES = [
  ['instagram', /(^|\.)instagram\.com$/],
  ['linkedin', /(^|\.)linkedin\.com$/],
  ['x', /(^|\.)(x|twitter)\.com$/],
  ['facebook', /(^|\.)(facebook|fb)\.com$/],
  ['tiktok', /(^|\.)tiktok\.com$/],
  ['youtube', /(^|\.)(youtube\.com|youtu\.be)$/],
  ['pinterest', /(^|\.)pinterest\.[a-z.]+$/],
  ['threads', /(^|\.)threads\.(net|com)$/],
];

export const PLATFORM_LABELS = {
  website: 'Website', blog: 'Blog', newsletter: 'Newsletter / RSS', instagram: 'Instagram',
  linkedin: 'LinkedIn', x: 'X (Twitter)', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube',
  pinterest: 'Pinterest', threads: 'Threads', other: 'Other',
};

// Platforms that usually answer bots with login walls / 999 / 403 / 429.
export const BLOCKING_PLATFORMS = new Set(['instagram', 'linkedin', 'x', 'facebook', 'tiktok', 'threads']);

export function platformOf(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    for (const [name, re] of RULES) if (re.test(host)) return name;
  } catch {}
  return null;
}

export function isHttpUrl(s) {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function normalizeUrl(url) {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|ref$|ocid$)/i.test(k)) u.searchParams.delete(k);
    }
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const path = u.pathname.replace(/\/+$/, '');
    const qs = u.searchParams.toString();
    return `${host}${path}${qs ? `?${qs}` : ''}`;
  } catch {
    return String(url).trim().toLowerCase();
  }
}
