import { safeHref } from './format.js';

export function csvEscape(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // stop spreadsheets from evaluating formulas
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const line = (cells) => cells.map(csvEscape).join(',');

const items = (r) => (Array.isArray(r?.mentions?.items) ? r.mentions.items.filter((m) => m && typeof m === 'object') : []);

export function mentionsCsv(report) {
  const rows = items(report).map((m) => line([String(m.date ?? ''), String(m.source ?? ''), String(m.title ?? ''), safeHref(m.url) ?? '']));
  return [line(['date', 'source', 'title', 'url']), ...rows].join('\r\n') + '\r\n';
}

export function compareCsv(a, b) {
  const rows = [a, b].flatMap((r) => items(r).map((m) => line([String(r?.input?.name ?? 'brand'), String(m.date ?? ''), String(m.source ?? ''), String(m.title ?? ''), safeHref(m.url) ?? ''])));
  return [line(['brand', 'date', 'source', 'title', 'url']), ...rows].join('\r\n') + '\r\n';
}

export const reportJson = (report) => JSON.stringify(report, null, 2);

export function slug(s) {
  return (
    String(s ?? '')
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'report'
  );
}

const day = (r) => (typeof r?.createdAt === 'string' ? r.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10));

export const fileName = (report, ext) => `brand-dna-${slug(report?.input?.name)}-${day(report)}.${ext}`;
export const compareFileName = (a, b, ext) => `brand-dna-compare-${slug(a?.input?.name)}-vs-${slug(b?.input?.name)}-${day(a)}.${ext}`;

export function downloadText(text, name, mime, doc = globalThis.document) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = doc.createElement('a');
  a.href = url;
  a.download = name;
  doc.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
