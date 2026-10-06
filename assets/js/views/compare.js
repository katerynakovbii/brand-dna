import { h } from '../components/h.js';
import { card, errorBox, linkButton, menuButton } from '../components/ui.js';
import { reportHash } from '../router.js';
import { compareRows } from '../format.js';
import { compareCsv, compareFileName, downloadText } from '../export.js';

const nameOf = (r, fb) => (typeof r?.input?.name === 'string' && r.input.name ? r.input.name : fb);

function table(a, b, route) {
  const head = (r, id) => h('th', { scope: 'col' }, h('a', { href: reportHash(id), text: nameOf(r, 'Report') }));
  return h('div', { class: 'compare-table-wrap' },
    h('table', { class: 'compare-table' },
      h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: '' }), head(a, route.a), head(b, route.b))),
      h('tbody', {}, compareRows(a, b).map((r) => h('tr', { class: r.diff ? 'diff' : '' },
        h('th', { scope: 'row', text: r.label }),
        h('td', { class: r.better === 'a' ? 'better' : '', text: r.a }),
        h('td', { class: r.better === 'b' ? 'better' : '', text: r.b }))))));
}

export async function render(root, route, ctx, signal) {
  const [ea, eb] = await Promise.all([route.a, route.b].map((id) => ctx.library.get(id).catch(() => null)));
  if (signal?.aborted) return;
  if (!ea?.report || !eb?.report) {
    root.append(card({ title: 'Comparison not available' },
      h('p', { text: 'Run both analyses first. Open a report and press Analyze next to a competitor.' }),
      linkButton('My reports', '#/reports', { primary: true })));
    return;
  }
  const a = ea.report;
  const b = eb.report;
  root.append(card({
    title: `${nameOf(a, 'A')} vs ${nameOf(b, 'B')}`,
    actions: h('div', { class: 'no-print' }, menuButton('Download', [
      { label: 'PDF (print)', onClick: () => globalThis.print?.() },
      { label: 'JSON', onClick: () => downloadText(JSON.stringify({ a, b }, null, 2), compareFileName(a, b, 'json'), 'application/json') },
      { label: 'CSV (mentions)', onClick: () => downloadText(compareCsv(a, b), compareFileName(a, b, 'csv'), 'text/csv') },
    ])),
  },
  a.status === 'failed' || b.status === 'failed' ? errorBox('One of the analyses failed, so some rows are empty.') : null,
  table(a, b, route),
  h('p', { class: 'no-print' }, h('a', { href: reportHash(route.a), text: `← Back to ${nameOf(a, 'report')}` })),
  h('p', { class: 'muted small', text: 'Highlighted rows differ. A blue bar marks the higher number.' })));
}
