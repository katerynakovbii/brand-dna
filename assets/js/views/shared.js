import { h } from '../components/h.js';
import { card, button, linkButton, errorBox } from '../components/ui.js';
import { reportHash } from '../router.js';
import { renderReport } from './report.js';

const skeleton = () => h('div', { 'aria-busy': 'true', 'aria-label': 'Loading report' },
  h('div', { class: 'skeleton skeleton-card' }), h('div', { class: 'skeleton skeleton-card' }));

export async function render(root, route, ctx, signal) {
  const loading = skeleton();
  root.append(loading);
  const r = await ctx.loadShared(route.id, route.key).catch((e) => ({ ok: false, message: e?.message ?? 'Could not open this link.' }));
  if (signal?.aborted) return;
  loading.remove();
  if (!r.ok) {
    root.append(card({ title: "Can't open this report" },
      errorBox(r.message ?? 'Could not open this link.'),
      h('p', {}, linkButton('Analyze a brand', '#/', { primary: true }))));
    return;
  }
  const report = r.report;
  const saved = await ctx.library.get(report.id).catch(() => null);
  if (signal?.aborted) return;
  const action = saved
    ? linkButton('Open in my reports', reportHash(report.id), { primary: true })
    : button('Save to my reports', {
      primary: true,
      onClick: async () => {
        await ctx.library.put(report);
        if (!signal?.aborted) ctx.navigate(reportHash(report.id));
      },
    });
  root.append(h('div', { class: 'banner no-print' },
    h('div', {}, h('strong', { text: 'Shared report' }), h('span', { class: 'muted small', text: ' · read-only copy opened from a private link' })),
    action));
  await renderReport(root, report, ctx, signal, { readOnly: true });
}
