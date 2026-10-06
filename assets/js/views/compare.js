import { h } from '../components/h.js';
import { card, button, copyButton, downloadBar, errorBox } from '../components/ui.js';
import { renderLoading } from './report.js';
import { recordResult } from '../analysis.js';
import { compareHash, reportHash, absoluteLink } from '../router.js';
import { compareRows } from '../format.js';
import { compareCsv, compareFileName, downloadText } from '../export.js';

const nameOf = (r, fb) => (typeof r?.input?.name === 'string' && r.input.name) ? r.input.name : fb;

function table(a, b, route) {
  const rows = compareRows(a, b);
  const head = (r, id, key) => h('th', { scope: 'col' }, h('a', { href: reportHash(id, key), text: nameOf(r, 'Report') }));
  return h('div', { class: 'compare-table-wrap' },
    h('table', { class: 'compare-table' },
      h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: '' }), head(a, route.a, route.ka), head(b, route.b, route.kb))),
      h('tbody', {}, rows.map((r) => h('tr', { class: r.diff ? 'diff' : '' },
        h('th', { scope: 'row', text: r.label }),
        h('td', { class: r.better === 'a' ? 'better' : '', text: r.a }),
        h('td', { class: r.better === 'b' ? 'better' : '', text: r.b }))))));
}

export async function render(root, route, ctx, signal) {
  const slotA = h('div');
  const slotB = h('div');
  root.append(slotA, slotB);
  let a = null;
  let b = null;

  const done = () => {
    if (signal?.aborted || !a || !b) return;
    slotA.remove();
    slotB.remove();
    const hash = compareHash(route.a, route.ka, route.b, route.kb);
    root.append(
      card({ title: `${nameOf(a, 'A')} vs ${nameOf(b, 'B')}`, actions: h('div', { class: 'no-print' }, copyButton(absoluteLink(hash))) },
        downloadBar([
          button('Download PDF', { onClick: () => window.print() }),
          button('JSON', { onClick: () => downloadText(JSON.stringify({ a, b }, null, 2), compareFileName(a, b, 'json'), 'application/json') }),
          button('CSV (mentions)', { onClick: () => downloadText(compareCsv(a, b), compareFileName(a, b, 'csv'), 'text/csv') }),
        ]),
        b.status === 'failed' || a.status === 'failed' ? errorBox('One of the analyses failed, so some rows are empty.', { actionsUrl: ctx.actionsUrl }) : null,
        table(a, b, route),
        h('p', { class: 'muted small', text: 'Highlighted rows differ. A blue bar marks the higher number.' })));
  };

  await Promise.all([
    renderLoading(slotA, { id: route.a, key: route.ka, ctx, signal, onReady: (r) => { if (signal?.aborted) return; recordResult(ctx.library, r, route.ka); a = r; done(); } }),
    renderLoading(slotB, { id: route.b, key: route.kb, ctx, signal, onReady: (r) => { if (signal?.aborted) return; recordResult(ctx.library, r, route.kb); b = r; done(); } }),
  ]);
}
