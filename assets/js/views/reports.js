import { h } from '../components/h.js';
import { card, button, linkButton, notice, errorBox } from '../components/ui.js';
import { downloadText } from '../export.js';
import { reportCard } from './cards.js';
import { NOT_PERSISTENT } from './home.js';

function backupCard(ctx, signal) {
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  const status = h('div', { 'aria-live': 'polite' });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const n = await ctx.library.importJson(await file.text());
      if (signal?.aborted) return;
      status.replaceChildren(notice(`Imported ${n} report${n === 1 ? '' : 's'}.`));
      if (n) ctx.rerender();
    } catch (e) {
      if (!signal?.aborted) status.replaceChildren(errorBox(e.message));
    }
  });
  return card({ title: 'Back up or move reports' },
    h('p', { class: 'muted', text: 'Reports live only in this browser. Export them to keep a copy or open them in another browser.' }),
    h('div', { class: 'row-actions' },
      button('Export', { onClick: async () => downloadText(await ctx.library.exportJson(), 'brand-dna-reports.json', 'application/json') }),
      button('Import', { onClick: () => fileInput.click() }),
      fileInput),
    h('p', { class: 'muted small', text: 'Downloaded files are not encrypted.' }),
    status);
}

export async function render(root, _route, ctx, signal) {
  const entries = await ctx.library.list().catch(() => []);
  if (signal?.aborted) return;
  const names = new Map(entries.map((e) => [e.id, e.name]));
  root.append(...[
    h('div', { class: 'section-title' }, h('h1', { text: 'My reports' }), linkButton('New analysis', '#/', { primary: true })),
    ctx.library.persistent ? null : notice(NOT_PERSISTENT, 'warn'),
    entries.length
      ? h('div', { class: 'report-grid' }, entries.map((e) => reportCard(e, ctx, { parentName: e.parentId ? names.get(e.parentId) : null })))
      : h('p', { class: 'empty', text: 'No reports yet. Paste a website on the home page to run your first analysis.' }),
    backupCard(ctx, signal),
  ].filter(Boolean));
}
