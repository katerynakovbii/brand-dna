import { h } from '../components/h.js';
import { card, button, copyButton, pill, errorBox, runningCard, sparkline, scoreRing, downloadBar, linkButton } from '../components/ui.js';
import { loadReport, pollReport, recordResult, isStale, startAnalysis } from '../analysis.js';
import { reportHash, compareHash, absoluteLink } from '../router.js';
import { formatDate, safeHref, displayHost, SENTIMENT_LABELS } from '../format.js';
import { mentionsCsv, reportJson, fileName, downloadText } from '../export.js';
import { touchpointRows, mentionsView, sourceRows, competitorRows, competitorInputs, validLink } from './report-model.js';

const CANT_OPEN = "This report can't be opened — the link is incomplete or invalid.";
const DASH = '—';

const text = (x) => (typeof x === 'string' && x ? x : null);
const strings = (x) => (Array.isArray(x) ? x.filter((v) => typeof v === 'string' && v) : []);
const msg = (e) => (typeof e?.message === 'string' ? e.message : 'unknown error');

// Shared by report and compare views: resolves a report, polling while its run is in progress.
export async function renderLoading(root, { id, key, ctx, signal, onReady }) {
  if (!validLink(id, key)) return root.append(errorBox(CANT_OPEN));
  const ready = (report) => {
    if (report?.id !== id) return root.append(errorBox(CANT_OPEN));
    return onReady(report);
  };
  let r;
  try {
    r = await loadReport({ id, key, fetchText: ctx.fetchText });
  } catch (e) {
    if (signal?.aborted) return;
    root.append(errorBox(e?.name === 'TokenRejectedError' ? msg(e) : `Couldn't load the report: ${msg(e)}`));
    return;
  }
  if (signal?.aborted) return;
  if (r.state === 'invalid-key') return root.append(errorBox(CANT_OPEN));
  if (r.state === 'ready') return ready(r.report);

  const entry = ctx.library.get(id);
  if (!entry || entry.status !== 'running') return root.append(errorBox('Report not found.'));
  if (isStale(entry)) return root.append(errorBox('No report after 10 minutes. The analysis may have failed to start — check the run on GitHub.', { actionsUrl: ctx.actionsUrl }));

  const running = runningCard({ name: entry.name, actionsUrl: ctx.actionsUrl, startedAt: entry.createdAt });
  root.append(running);
  let p;
  try {
    p = await pollReport({ id, key, fetchText: ctx.fetchText, signal, startedAt: Date.parse(entry.createdAt) });
  } catch (e) {
    if (signal?.aborted) return;
    running.remove();
    return root.append(errorBox(`Couldn't load the report: ${msg(e)}`));
  }
  if (p.state === 'aborted' || signal?.aborted) return;
  running.remove();
  if (p.state === 'ready') return ready(p.report);
  if (p.state === 'invalid-key') return root.append(errorBox(CANT_OPEN));
  if (p.state === 'timeout') return root.append(errorBox('No report after 10 minutes. The analysis may have failed to start — check the run on GitHub.', { actionsUrl: ctx.actionsUrl }));
  root.append(errorBox(text(p.message) ?? 'Something went wrong while loading the report.'));
}

function header(report, key) {
  const hash = reportHash(report.id, key);
  const site = safeHref(report.input?.website);
  return card({},
    h('div', { class: 'report-head' },
      h('div', {},
        h('h1', { text: text(report.input?.name) ?? 'Report' }),
        h('div', { class: 'report-meta' },
          site ? h('a', { href: site, text: displayHost(site) }) : null,
          h('span', { text: formatDate(report.createdAt) }),
          report.type === 'competitor' ? pill('Competitor report', 'muted') : null,
          report.status === 'ok' ? pill(report.mode === 'ai' ? 'AI analysis' : 'Rules-based', 'accent') : null)),
      h('div', { class: 'row-actions no-print' }, copyButton(absoluteLink(hash), 'Copy private link'))),
    downloadBar([
      button('Download PDF', { onClick: () => window.print() }),
      button('JSON', { onClick: () => downloadText(reportJson(report), fileName(report, 'json'), 'application/json') }),
      button('CSV (mentions)', { onClick: () => downloadText(mentionsCsv(report), fileName(report, 'csv'), 'text/csv') }),
    ]));
}

function positioningCard(report) {
  const p = report.positioning ?? {};
  const kv = (label, value) => [h('dt', { text: label }), h('dd', { text: text(value) ?? DASH })];
  const diffs = strings(p.differentiators);
  const tags = strings(p.tags);
  const phrases = strings(p.phrases);
  const sentiment = typeof p.newsSentiment === 'string' && Object.hasOwn(SENTIMENT_LABELS, p.newsSentiment) ? SENTIMENT_LABELS[p.newsSentiment] : null;
  return card({ title: 'Positioning' },
    h('p', { class: 'statement', text: text(p.statement) ?? 'No positioning statement found on the website.' }),
    h('dl', { class: 'kv' },
      kv('Audience', p.audience),
      kv('Differentiators', diffs.length ? diffs.join(' · ') : null),
      kv('Tone of voice', p.tone),
      kv('Site vs. social', p.siteSocialConsistency),
      kv('News sentiment', sentiment)),
    tags.length ? [h('h3', { text: 'Archetypes' }), h('div', { class: 'chips' }, tags.map((t) => pill(t, 'accent')))] : null,
    phrases.length ? [h('h3', { text: 'Top phrases' }), h('div', { class: 'chips' }, phrases.map((t) => pill(t, 'muted')))] : null,
    report.mode === 'rules' ? h('p', { class: 'muted small', text: 'Tone, site/social consistency and sentiment are filled in when AI analysis is enabled.' }) : null);
}

function touchpointsCard(report) {
  const tp = report.touchpoints;
  return card({ title: 'Touchpoints' },
    h('div', { class: 'touch-wrap' },
      h('div', {}, scoreRing(Number.isFinite(tp?.score) ? tp.score : 0), h('p', { class: 'muted small', text: `${Array.isArray(tp?.expected) ? tp.expected.length : 0} channels expected for this industry` })),
      h('ul', { class: 'list' }, touchpointRows(tp).map((r) =>
        h('li', {},
          h('div', { class: 'row-main' }, h('strong', { text: r.label }), r.href ? h('a', { class: 'small', href: r.href, text: displayHost(r.href) || r.href }) : null),
          pill(r.statusLabel, r.tone))))),
    h('p', { class: 'muted small', text: '“Unverified” means the platform blocks automated checks, so the link could not be confirmed.' }));
}

function mentionsCard(report) {
  const body = h('div');
  const buttons = [7, 30, 60].map((d) => h('button', { type: 'button', text: `${d} days`, 'aria-pressed': 'false', onClick: () => show(d) }));
  function show(days) {
    buttons.forEach((b, i) => b.setAttribute('aria-pressed', String([7, 30, 60][i] === days)));
    const v = mentionsView(report.mentions, days);
    body.replaceChildren(
      h('div', { class: 'mentions-top' },
        h('div', {}, h('div', { class: 'big-number', text: v.big }), h('div', { class: 'muted small', text: `mentions in the last ${days} days` })),
        v.weekly.length > 1 ? sparkline(v.weekly) : null,
        h('div', { class: 'chips' }, v.bySource.map((s) => pill(`${s.label}: ${s.count}`, 'muted')))),
      v.capped ? h('p', { class: 'muted small', text: 'Google News returns at most 100 results, so the real number may be higher.' }) : null,
      v.headlines.length
        ? h('ul', { class: 'list' }, v.headlines.map((m) => h('li', {}, h('div', { class: 'row-main' },
          m.href ? h('a', { href: m.href, text: m.title }) : h('span', { text: m.title }),
          h('span', { class: 'muted small', text: m.meta })))))
        : h('p', { class: 'muted', text: 'No mentions found in this period.' }));
  }
  show(30);
  return card({ title: 'Mentions', actions: h('div', { class: 'toggle', role: 'group', 'aria-label': 'Time window' }, buttons) }, body);
}

function competitorsCard(report, key, ctx, signal) {
  const status = h('div', { 'aria-live': 'polite' });
  const rows = competitorRows({ report, library: ctx.library, hasToken: !!ctx.github });

  async function onCompare(row, btn) {
    if (row.existing) return ctx.navigate(compareHash(report.id, key, row.existing.reportId, row.existing.reportKey));
    btn.disabled = true;
    btn.textContent = 'Starting…';
    try {
      const c = report.competitors.find((x) => x?.name === row.name);
      const publicJwk = await ctx.publicJwk();
      if (signal?.aborted) return;
      const r = await startAnalysis({ inputs: competitorInputs(report, c), github: ctx.github, library: ctx.library, publicJwk });
      if (signal?.aborted) return;
      if (!r.ok) throw new Error(Object.values(r.errors).join(' '));
      ctx.navigate(compareHash(report.id, key, r.entry.reportId, r.entry.reportKey));
    } catch (e) {
      if (signal?.aborted) return;
      status.replaceChildren(errorBox(e?.name === 'TokenRejectedError' ? msg(e) : `Couldn't start the competitor analysis: ${msg(e)}`));
      btn.disabled = false;
      btn.textContent = 'Compare';
    }
  }

  return card({ title: 'Competitors' },
    rows.length
      ? h('ul', { class: 'list' }, rows.map((row) => {
        const btn = button(row.action === 'open' ? 'Open comparison' : 'Compare', {
          primary: row.action !== 'disabled',
          disabled: row.action === 'disabled',
          title: row.action === 'disabled' ? 'Add a GitHub token in Settings to analyze competitors' : null,
        });
        btn.addEventListener('click', () => onCompare(row, btn));
        return h('li', {},
          h('div', { class: 'row-main' },
            h('strong', { text: row.name }),
            row.href ? h('a', { class: 'small', href: row.href, text: row.host }) : null,
            h('span', { class: 'muted small', text: row.reason })),
          h('div', { class: 'row-actions no-print' }, btn));
      }))
      : h('p', { class: 'muted', text: 'No competitors could be identified from public data.' }),
    !ctx.github && rows.some((r) => r.action === 'disabled') ? h('p', { class: 'muted small no-print' }, 'Add a GitHub token in ', h('a', { href: '#/settings', text: 'Settings' }), ' to analyze competitors.') : null,
    status);
}

function sourcesCard(report) {
  return card({ title: 'Data sources', className: 'sources' },
    h('ul', { class: 'list' }, sourceRows(report.sources).map((s) =>
      h('li', {}, h('span', { text: s.label }), h('span', { class: 'row-actions' }, pill(s.ok ? 'OK' : 'Failed', s.ok ? 'ok' : 'bad'), h('span', { class: 'muted small', text: s.ok && s.detail === 'OK' ? '' : s.detail }))))),
    text(report.modeReason) ? h('p', { class: 'muted small', text: report.modeReason }) : null,
    h('p', { class: 'muted small', text: 'Mentions come from Google News, Bing News, Hacker News and Reddit. Social follower counts are not collected because the platforms block automated access.' }));
}

export function renderReport(root, report, key, ctx, signal) {
  root.append(header(report, key));
  if (report.status === 'failed') {
    root.append(errorBox(text(report.error) ?? 'The analysis failed.', { actionsUrl: ctx.actionsUrl }));
    if (ctx.github && report.input) root.append(h('p', {}, linkButton('Start a new analysis', '#/new', { primary: true })));
    return;
  }
  root.append(positioningCard(report), h('div', { class: 'grid-2' }, touchpointsCard(report), mentionsCard(report)), competitorsCard(report, key, ctx, signal), sourcesCard(report));
}

export async function render(root, route, ctx, signal) {
  await renderLoading(root, {
    id: route.id,
    key: route.key,
    ctx,
    signal,
    onReady: (report) => {
      recordResult(ctx.library, report, route.key);
      if (signal?.aborted) return;
      renderReport(root, report, route.key, ctx, signal);
    },
  });
}
