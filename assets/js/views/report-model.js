import { STATUS_LABELS, SOURCE_LABELS, kindLabel, safeHref, displayHost, formatDate, mentionsLabel } from '../format.js';

const TONES = { live: 'ok', found: 'ok', unverified: 'warn', broken: 'bad', missing: 'muted' };

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const lookup = (map, k) => (typeof k === 'string' && Object.hasOwn(map, k) ? map[k] : null);
const str = (x) => (x == null ? '' : String(x));
const objs = (x) => (Array.isArray(x) ? x.filter(isObj) : []);

export function touchpointRows(touchpoints) {
  return objs(touchpoints?.items).map((i) => {
    const status = str(i.status);
    return {
      label: kindLabel(str(i.kind)),
      status,
      statusLabel: lookup(STATUS_LABELS, status) ?? status,
      tone: lookup(TONES, status) ?? 'muted',
      href: safeHref(i.url),
    };
  });
}

export function mentionsView(mentions, days) {
  const w = isObj(mentions) && isObj(mentions[`d${days}`]) ? mentions[`d${days}`] : null;
  const bySource = isObj(w?.bySource) ? w.bySource : {};
  return {
    days,
    big: mentionsLabel(w),
    capped: !!w?.capped,
    bySource: Object.entries(bySource)
      .filter(([, n]) => Number.isFinite(n))
      .sort((a, b) => b[1] - a[1])
      .map(([k, count]) => ({ label: lookup(SOURCE_LABELS, k) ?? k, count })),
    weekly: Array.isArray(w?.weekly) ? w.weekly.filter(Number.isFinite) : [],
    headlines: objs(w?.top).map((m) => ({
      title: str(m.title),
      href: safeHref(m.url),
      meta: `${lookup(SOURCE_LABELS, m.source) ?? str(m.source)} · ${formatDate(m.date)}`,
    })),
  };
}

export function sourceRows(sources) {
  return objs(sources).map((s) => ({
    label: lookup(SOURCE_LABELS, s.source) ?? str(s.source),
    ok: !!s.ok,
    detail: s.ok ? (s.error ? `Partial: ${str(s.error)}` : 'OK') : str(s.error) || 'Failed',
  }));
}

// `existing` is the library's entry list; a competitor counts as analyzed once a successful run is saved for this report.
export function competitorRows({ report, existing = [] }) {
  const list = Array.isArray(report?.competitors) ? report.competitors : [];
  const entries = objs(existing);
  return list.filter((c) => isObj(c) && typeof c.name === 'string').map((c) => {
    const name = c.name.trim().toLowerCase();
    const href = safeHref(c.website);
    return {
      name: c.name,
      href,
      host: href ? displayHost(href) : '',
      reason: typeof c.reason === 'string' ? c.reason : '',
      coMentions: c.coMentions,
      existing: entries.find((e) => e.type === 'competitor' && e.parentId === report.id && e.status !== 'failed' && str(e.name).trim().toLowerCase() === name) ?? null,
    };
  });
}

export function competitorInputs(report, competitor) {
  return {
    name: competitor.name,
    website: competitor.website ?? '',
    industry: typeof report.input?.industry === 'string' ? report.input.industry : '',
    socials: {},
    type: 'competitor',
    parentId: report.id,
  };
}
