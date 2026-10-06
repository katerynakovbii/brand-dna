import { h } from '../components/h.js';
import { card, button, pill, errorBox, sparkline, scoreRing, linkButton, menuButton, progressList } from '../components/ui.js';
import { compareHash } from '../router.js';
import { formatDate, safeHref, displayHost, SENTIMENT_LABELS } from '../format.js';
import { touchpointRows, mentionsView, sourceRows, competitorRows, competitorInputs } from './report-model.js';
import { shareEntry, downloadItems } from './actions.js';

const DASH = '—';
const SECTIONS = [['positioning', 'Positioning'], ['touchpoints', 'Touchpoints'], ['mentions', 'Mentions'], ['competitors', 'Competitors'], ['sources', 'Sources']];

const text = (x) => (typeof x === 'string' && x ? x : null);
const strings = (x) => (Array.isArray(x) ? x.filter((v) => typeof v === 'string' && v) : []);
const section = (key, ...children) => h('div', { id: `sec-${key}`, class: 'report-section' }, ...children);

function summaryCard(report, ctx, { readOnly, entry }) {
  const site = safeHref(report.input?.website);
  const tp = report.touchpoints;
  const score = Number.isFinite(tp?.score) ? tp.score : null;
  const competitors = Array.isArray(report.competitors) ? report.competitors.filter((c) => c && typeof c.name === 'string').length : 0;
  const stat = (value, label) => h('div', { class: 'stat' }, h('strong', { text: String(value) }), h('span', { class: 'muted small', text: label }));
  const shareTarget = entry ?? { id: report.id, report, shareUrl: null };
  return card({ className: 'summary' },
    h('div', { class: 'report-head' },
      h('div', {},
        h('h1', { text: text(report.input?.name) ?? 'Report' }),
        h('div', { class: 'report-meta' },
          site ? h('a', { href: site, text: displayHost(site), rel: 'noopener', target: '_blank' }) : null,
          h('span', { text: formatDate(report.createdAt) }),
          text(report.input?.industry) ? h('span', { text: report.input.industry }) : null,
          report.type === 'competitor' ? pill('Competitor report', 'muted') : null,
          report.status === 'ok' ? pill(report.mode === 'ai' ? 'AI analysis' : 'Rules-based', 'accent') : null)),
      h('div', { class: 'summary-actions no-print' },
        readOnly ? null : button('Share', { primary: true, onClick: () => shareEntry(shareTarget, ctx) }),
        menuButton('Download', downloadItems(report)))),
    report.status === 'failed' ? null : [
      h('p', { class: 'statement', text: text(report.positioning?.statement) ?? 'No positioning statement found on the website.' }),
      h('div', { class: 'summary-stats' },
        stat(score ?? DASH, 'touchpoint score'),
        stat(mentionsView(report.mentions, 30).big, 'mentions · 30 days'),
        stat(competitors, competitors === 1 ? 'competitor' : 'competitors')),
    ]);
}

function sectionNav(targets) {
  return h('nav', { class: 'section-nav no-print', 'aria-label': 'Report sections' },
    SECTIONS.map(([key, label]) => h('button', {
      type: 'button',
      class: 'btn-link',
      text: label,
      onClick: () => targets[key].scrollIntoView({ behavior: 'smooth', block: 'start' }),
    })));
}

function positioningCard(report) {
  const p = report.positioning ?? {};
  const kv = (label, value) => [h('dt', { text: label }), h('dd', { text: text(value) ?? DASH })];
  const diffs = strings(p.differentiators);
  const tags = strings(p.tags);
  const phrases = strings(p.phrases);
  const sentiment = typeof p.newsSentiment === 'string' && Object.hasOwn(SENTIMENT_LABELS, p.newsSentiment) ? SENTIMENT_LABELS[p.newsSentiment] : null;
  return card({ title: 'Positioning' },
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
    body.replaceChildren(...[
      h('div', { class: 'mentions-top' },
        h('div', {}, h('div', { class: 'big-number', text: v.big }), h('div', { class: 'muted small', text: `mentions in the last ${days} days` })),
        v.weekly.length > 1 ? sparkline(v.weekly) : null,
        h('div', { class: 'chips' }, v.bySource.map((s) => pill(`${s.label}: ${s.count}`, 'muted')))),
      v.capped ? h('p', { class: 'muted small', text: 'Google News returns at most 100 results, so the real number may be higher.' }) : null,
      v.headlines.length
        ? h('ul', { class: 'list' }, v.headlines.map((m) => h('li', {}, h('div', { class: 'row-main' },
          m.href ? h('a', { href: m.href, text: m.title }) : h('span', { text: m.title }),
          h('span', { class: 'muted small', text: m.meta })))))
        : h('p', { class: 'muted', text: 'No mentions found in this period.' }),
    ].filter(Boolean));
  }
  show(30);
  return card({ title: 'Mentions', actions: h('div', { class: 'toggle', role: 'group', 'aria-label': 'Time window' }, buttons) }, body);
}

function competitorRow(report, row, ctx, signal, readOnly) {
  const actions = h('div', { class: 'row-actions no-print' });
  const status = h('div', { class: 'row-status', 'aria-live': 'polite' });
  const compareBtn = (entryId) => button('Compare', { primary: true, onClick: () => ctx.navigate(compareHash(report.id, entryId)) });

  async function analyze() {
    const progress = progressList();
    actions.replaceChildren(h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('span', { class: 'muted small', text: 'Analyzing…' }));
    status.replaceChildren(progress.el);
    const c = report.competitors.find((x) => x?.name === row.name);
    const r = await ctx.runAnalysis({
      inputs: competitorInputs(report, c),
      onEvent: (e) => { if (e?.type === 'progress') progress.update(e.source, e.state); },
      signal,
    });
    if (signal?.aborted || r.aborted) return;
    if (r.ok) {
      await ctx.library.put(r.report).catch(() => {});
      status.replaceChildren();
      actions.replaceChildren(compareBtn(r.report.id));
      return;
    }
    const message = r.message ?? Object.values(r.errors ?? {}).join(' ') ?? 'The analysis failed.';
    actions.replaceChildren(analyzeBtn());
    status.replaceChildren(errorBox(message || 'The analysis failed.', { onRetry: analyze }));
  }
  const analyzeBtn = () => button('Analyze', { onClick: analyze, title: `Run the same analysis for ${row.name}` });

  if (!readOnly) actions.append(row.existing ? compareBtn(row.existing.id) : analyzeBtn());
  return h('li', { class: 'competitor' },
    h('div', { class: 'row-main' },
      h('strong', { text: row.name }),
      row.href ? h('a', { class: 'small', href: row.href, text: row.host }) : null,
      row.reason ? h('span', { class: 'muted small', text: row.reason }) : null,
      Number.isFinite(row.coMentions) && row.coMentions > 0 ? h('span', { class: 'muted small', text: `Mentioned together ${row.coMentions}×` }) : null),
    actions,
    status);
}

function competitorsCard(report, existing, ctx, signal, readOnly) {
  const rows = competitorRows({ report, existing });
  return card({ title: 'Competitors' },
    rows.length
      ? [
        readOnly ? null : h('p', { class: 'muted small no-print', text: 'Analyze a competitor to compare it side by side.' }),
        h('ul', { class: 'list' }, rows.map((row) => competitorRow(report, row, ctx, signal, readOnly))),
      ]
      : h('p', { class: 'muted', text: 'No competitors could be identified from public data.' }));
}

function sourcesCard(report) {
  return card({ title: 'Data sources', className: 'sources' },
    h('ul', { class: 'list' }, sourceRows(report.sources).map((s) =>
      h('li', {}, h('span', { text: s.label }), h('span', { class: 'row-actions' }, pill(s.ok ? 'OK' : 'Failed', s.ok ? 'ok' : 'bad'), h('span', { class: 'muted small', text: s.ok && s.detail === 'OK' ? '' : s.detail }))))),
    text(report.modeReason) ? h('p', { class: 'muted small', text: report.modeReason }) : null,
    h('p', { class: 'muted small', text: 'Mentions come from Google News, Bing News, Hacker News and Reddit. Social follower counts are not collected because the platforms block automated access.' }));
}

export async function renderReport(root, report, ctx, signal, { readOnly = false, entry = null } = {}) {
  root.append(summaryCard(report, ctx, { readOnly, entry }));
  if (report.status === 'failed') {
    root.append(errorBox(text(report.error) ?? 'The analysis failed.'), h('p', {}, linkButton('New analysis', '#/', { primary: true })));
    return;
  }
  const existing = readOnly ? [] : await ctx.library.list().catch(() => []);
  if (signal?.aborted) return;
  const t = {
    positioning: section('positioning', positioningCard(report)),
    touchpoints: section('touchpoints', touchpointsCard(report)),
    mentions: section('mentions', mentionsCard(report)),
    competitors: section('competitors', competitorsCard(report, existing, ctx, signal, readOnly)),
    sources: section('sources', sourcesCard(report)),
  };
  root.append(sectionNav(t), t.positioning, h('div', { class: 'grid-2' }, t.touchpoints, t.mentions), t.competitors, t.sources);
}

export async function render(root, route, ctx, signal) {
  const entry = await ctx.library.get(route.id).catch(() => null);
  if (signal?.aborted) return;
  if (!entry?.report) {
    root.append(card({ title: 'Report not found' },
      h('p', { text: 'Report not found in this browser. Reports are saved only in the browser that ran them — open a shared link instead, or run the analysis again.' }),
      h('div', { class: 'row-actions' }, linkButton('New analysis', '#/', { primary: true }), linkButton('My reports', '#/reports'))));
    return;
  }
  await renderReport(root, entry.report, ctx, signal, { entry });
}
