// Shared by the browser (form validation) and /api/analyze (re-validation).
export const SCHEMA_VERSION = 1;
export const REPORT_ID_RE = /^[A-Za-z0-9_-]{22}$/;
export const REPORT_KEY_RE = /^[A-Za-z0-9_-]{43}$/;
export const SOCIAL_FIELDS = ['instagram', 'linkedin', 'x', 'facebook', 'tiktok', 'youtube'];
const MAX_OTHER = 5;

export function normalizeWebsite(raw) {
  let s = String(raw ?? '').trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  let u;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  let host = u.hostname;
  // Strip trailing dot
  if (host.endsWith('.')) host = host.slice(0, -1);
  // Reject empty labels (e.g., '.com', 'a..com')
  if (!host || host.includes('..') || host.startsWith('.') || host.endsWith('.')) return null;
  if (!host.includes('.') || /^[\d.]+$/.test(host) || host.startsWith('[')) return null;
  return u.href;
}

export function validateInputs(raw = {}) {
  raw = raw ?? {};
  const errors = {};
  const type = raw.type === 'competitor' ? 'competitor' : 'main';
  const parentId = raw.parentId ?? null;
  if (type === 'competitor' && !REPORT_ID_RE.test(String(parentId))) errors.parentId = 'Competitor reports need a parent report.';
  if (type === 'main' && parentId !== null) errors.parentId = 'Only competitor reports have a parent.';

  const name = String(raw.name ?? '').trim();
  if (!name && type === 'competitor') errors.name = 'Enter the company name.';
  else if (name.length > 100) errors.name = 'Name is too long (max 100 characters).';

  const websiteRaw = String(raw.website ?? '').trim();
  const website = normalizeWebsite(websiteRaw);
  if (websiteRaw && !website) errors.website = 'Enter a valid website address, e.g. acme.com.';
  else if (!websiteRaw && type === 'main') errors.website = 'Enter the website.';

  const industry = String(raw.industry ?? '').trim();
  if (industry.length > 60) errors.industry = 'Industry is too long (max 60 characters).';

  const rawSocials = raw.socials ?? {};
  const socials = {};
  for (const field of SOCIAL_FIELDS) {
    const v = String(rawSocials[field] ?? '').trim();
    if (!v) continue;
    const u = normalizeWebsite(v);
    if (u) socials[field] = u;
    else errors[field] = 'Enter a full profile URL.';
  }
  const other = [].concat(rawSocials.other ?? []).map((v) => String(v).trim()).filter(Boolean);
  const otherUrls = other.map(normalizeWebsite);
  if (other.length > MAX_OTHER) errors.other = `Up to ${MAX_OTHER} other links.`;
  else if (otherUrls.some((u) => !u)) errors.other = 'Each other link must be a valid URL.';
  else if (otherUrls.length) socials.other = otherUrls;

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { name, website, industry, socials, type, parentId: type === 'competitor' ? parentId : null } };
}

export function failedReport({ id, input = null, error, now = new Date() }) {
  return {
    v: SCHEMA_VERSION,
    id,
    type: input?.type === 'competitor' ? 'competitor' : 'main',
    parentId: input?.parentId ?? null,
    createdAt: now.toISOString(),
    status: 'failed',
    error: String(error),
    mode: 'rules',
    modeReason: null,
    input,
    industryKey: null,
    positioning: null,
    touchpoints: null,
    mentions: null,
    competitors: [],
    sources: [],
  };
}
