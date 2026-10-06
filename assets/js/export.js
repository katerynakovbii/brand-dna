export function csvEscape(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // stop spreadsheets from evaluating formulas
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const line = (cells) => cells.map(csvEscape).join(',');

export function mentionsCsv(report) {
  const rows = (report.mentions?.items ?? []).map((m) => line([m.date, m.source, m.title, m.url]));
  return [line(['date', 'source', 'title', 'url']), ...rows].join('\r\n') + '\r\n';
}

export function compareCsv(a, b) {
  const rows = [a, b].flatMap((r) => (r.mentions?.items ?? []).map((m) => line([r.input?.name ?? '', m.date, m.source, m.title, m.url])));
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

const day = (r) => (r.createdAt ?? '').slice(0, 10) || 'undated';

export const fileName = (report, ext) => `brand-dna-${slug(report.input?.name)}-${day(report)}.${ext}`;
export const compareFileName = (a, b, ext) => `brand-dna-compare-${slug(a.input?.name)}-vs-${slug(b.input?.name)}-${day(a)}.${ext}`;

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
