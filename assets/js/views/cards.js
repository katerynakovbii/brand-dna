import { h } from '../components/h.js';
import { card, button, linkButton, pill } from '../components/ui.js';
import { reportHash } from '../router.js';
import { formatDate, safeHref, displayHost } from '../format.js';
import { mentionsView } from './report-model.js';
import { shareEntry } from './actions.js';

// Library entry as a card: brand, domain, date, headline numbers, open / share / remove.
export function reportCard(entry, ctx, { parentName = null } = {}) {
  const r = entry.report ?? {};
  const site = safeHref(entry.website);
  const hash = reportHash(entry.id);
  const score = Number.isFinite(r.touchpoints?.score) ? String(r.touchpoints.score) : '—';

  let armed = false;
  const remove = button('Remove', {
    onClick: async () => {
      if (!armed) {
        armed = true;
        remove.textContent = 'Click again to remove';
        remove.classList?.add('btn-danger');
        return;
      }
      await ctx.library.remove(entry.id);
      ctx.rerender();
    },
  });
  remove.addEventListener('blur', () => {
    armed = false;
    remove.textContent = 'Remove';
    remove.classList?.remove('btn-danger');
  });

  return card({ className: 'report-card' },
    h('div', {},
      h('a', { class: 'card-title', href: hash, text: entry.name || (site ? displayHost(site) : 'Report') }),
      h('div', { class: 'report-meta' },
        site ? h('span', { text: displayHost(site) }) : null,
        h('span', { text: formatDate(entry.date) }),
        entry.type === 'competitor' ? pill(parentName ? `Competitor of ${parentName}` : 'Competitor', 'muted') : null,
        entry.status === 'failed' ? pill('Failed', 'bad') : null)),
    entry.status === 'failed'
      ? null
      : h('div', { class: 'stats' },
        h('span', {}, h('strong', { text: score }), ' touchpoint score'),
        h('span', {}, h('strong', { text: mentionsView(r.mentions, 30).big }), ' mentions · 30 days')),
    h('div', { class: 'row-actions' },
      linkButton('Open', hash, { primary: true }),
      button('Share', { onClick: () => shareEntry(entry, ctx) }),
      remove));
}
