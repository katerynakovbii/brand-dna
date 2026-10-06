import { h } from '../components/h.js';
import { card, button, linkButton, copyButton, pill, notice, errorBox } from '../components/ui.js';
import { reportHash, absoluteLink } from '../router.js';
import { pollReport, recordResult, isStale } from '../analysis.js';
import { formatDate } from '../format.js';
import { downloadText } from '../export.js';

function statusPill(entry) {
  if (entry.status === 'running') return isStale(entry) ? pill('Timed out', 'bad') : pill('Running…', 'accent');
  return entry.status === 'failed' ? pill('Failed', 'bad') : pill('Ready', 'ok');
}

function entryRow(entry, ctx, parentName) {
  const hash = reportHash(entry.reportId, entry.reportKey);
  return h('li', {},
    h('div', { class: 'row-main' },
      h('a', { href: hash }, h('strong', { text: entry.name })),
      h('span', { class: 'muted small' },
        formatDate(entry.createdAt),
        entry.type === 'competitor' ? ` · Competitor${parentName ? ` of ${parentName}` : ''}` : '')),
    h('div', { class: 'row-actions' },
      statusPill(entry),
      copyButton(absoluteLink(hash)),
      button('Remove', {
        title: 'Remove from this list (the encrypted report stays in the repository)',
        onClick: () => {
          if (confirm(`Remove “${entry.name}” from your list? Keep the private link if you want to open it later.`)) {
            ctx.library.remove(entry.reportId);
            ctx.rerender();
          }
        },
      })));
}

export const shouldRerender = (state) => state === 'ready' || state === 'timeout';

function watchRunning(ctx, signal) {
  for (const e of ctx.library.list().filter((x) => x.status === 'running' && !isStale(x))) {
    pollReport({ id: e.reportId, key: e.reportKey, fetchText: ctx.fetchText, signal, startedAt: Date.parse(e.createdAt) })
      .then((r) => {
        if (r.state === 'ready') recordResult(ctx.library, r.report, e.reportKey);
        if (!signal.aborted && shouldRerender(r.state)) ctx.rerender();
      })
      .catch(() => {});
  }
}

export function render(root, _route, ctx, signal) {
  if (!ctx.repo) root.append(notice("Couldn't detect the GitHub repository from this address. Set REPO_OVERRIDE in assets/js/config.js.", 'warn'));
  else if (!ctx.hasToken) root.append(notice(h('span', {}, 'Add a GitHub token in ', h('a', { href: '#/settings', text: 'Settings' }), ' to run analyses.'), 'warn'));

  const entries = ctx.library.list();
  const names = new Map(entries.map((e) => [e.reportId, e.name]));
  const stale = entries.some((e) => e.status === 'running' && isStale(e));

  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  const importStatus = h('div', { 'aria-live': 'polite' });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      const n = ctx.library.importJson(await file.text());
      importStatus.replaceChildren(notice(`Imported ${n} report${n === 1 ? '' : 's'}.`));
      if (n) setTimeout(() => { if (!signal.aborted) ctx.rerender(); }, 800);
    } catch (e) {
      importStatus.replaceChildren(errorBox(e.message));
    }
  });

  root.append(
    card({ title: 'My reports', actions: ctx.hasToken ? linkButton('New analysis', '#/new', { primary: true }) : null },
      entries.length
        ? h('ul', { class: 'list' }, entries.map((e) => entryRow(e, ctx, e.parentId ? names.get(e.parentId) : null)))
        : h('p', { class: 'muted', text: 'No reports yet. Start a new analysis or open a private link someone shared with you.' }),
      stale ? errorBox('Some analyses did not finish within 10 minutes.', { actionsUrl: ctx.actionsUrl }) : null),
    card({ title: 'Back up your list' },
      h('p', { class: 'muted', text: 'This list lives only in this browser. Reports can be opened only with their private links, so export the list to keep a backup — if browser data is cleared, the links are gone.' }),
      h('div', { class: 'row-actions' },
        button('Export list', { onClick: () => downloadText(ctx.library.exportJson(), 'brand-dna-library.json', 'application/json') }),
        button('Import list', { onClick: () => fileInput.click() }),
        fileInput),
      importStatus),
  );
  watchRunning(ctx, signal);
}
