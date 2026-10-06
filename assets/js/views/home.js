import { h } from '../components/h.js';
import { card, button, linkButton, errorBox, notice, progressList } from '../components/ui.js';
import { reportHash } from '../router.js';
import { displayHost } from '../format.js';
import { SOCIAL_FIELDS } from '../../../shared/schema.js';
import { reportCard } from './cards.js';

const SOCIAL_LABELS = { instagram: 'Instagram', linkedin: 'LinkedIn', x: 'X (Twitter)', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube' };
const RECENT = 6;
const EMPTY = 'Paste a company website to see its positioning, channels, online mentions and closest competitors.';
export const NOT_PERSISTENT = "This browser can't save reports — use Download or Share.";

// `get(name)` returns a form field's value as a string.
export function formToInputs(get) {
  const socials = Object.fromEntries(SOCIAL_FIELDS.map((f) => [f, get(f)]));
  socials.other = get('other').split('\n').map((l) => l.trim()).filter(Boolean);
  return {
    website: get('website'),
    name: get('name'),
    industry: get('industry') === '__custom' ? get('industryCustom') : get('industry'),
    socials,
    type: 'main',
  };
}

const clock = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function heroForm(ctx, signal, table) {
  const fields = {};
  const errors = {};
  const field = (name, label, input, hint = null) => {
    Object.assign(input, { id: `f-${name}` });
    input.setAttribute('name', name);
    input.setAttribute('aria-describedby', `e-${name}`);
    fields[name] = input;
    errors[name] = h('span', { class: 'error', id: `e-${name}` });
    return h('div', { class: 'field' }, h('label', { for: `f-${name}`, text: label }), input, hint ? h('span', { class: 'muted small', text: hint }) : null, errors[name]);
  };

  const website = h('input', { type: 'text', inputmode: 'url', placeholder: 'acme.com', autocomplete: 'url', 'aria-label': 'Company website', spellcheck: 'false' });
  website.setAttribute('name', 'website');
  website.setAttribute('aria-describedby', 'e-website');
  fields.website = website;
  errors.website = h('p', { class: 'error', id: 'e-website' });

  const custom = h('input', { type: 'text', placeholder: 'Type the industry', maxlength: 60 });
  const industry = h('select', {},
    h('option', { value: '', text: 'Detect automatically' }),
    Object.entries(table).filter(([k]) => k !== 'default').map(([, v]) => h('option', { value: v.label, text: v.label })),
    h('option', { value: '__custom', text: 'Other — type it' }));

  const customField = field('industryCustom', 'Custom industry', custom);
  customField.hidden = true;
  industry.addEventListener('change', () => { customField.hidden = industry.value !== '__custom'; });
  const details = h('div', { class: 'details', id: 'details', hidden: true },
    field('name', 'Company name', h('input', { type: 'text', maxlength: 100, autocomplete: 'organization' }), 'Leave empty to use the name from the website.'),
    h('div', {}, field('industry', 'Industry', industry), customField),
    SOCIAL_FIELDS.map((f) => field(f, SOCIAL_LABELS[f] ?? f, h('input', { type: 'text', inputmode: 'url', placeholder: 'https://…' }))),
    field('other', 'Other links (one per line, up to 5)', h('textarea', { rows: 3 })));
  const toggle = h('button', { type: 'button', class: 'btn-link', 'aria-expanded': 'false', 'aria-controls': 'details', text: 'Add details (optional)' });
  const setDetails = (open) => {
    details.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? 'Hide details' : 'Add details (optional)';
  };
  toggle.addEventListener('click', () => setDetails(details.hidden));

  const status = h('div', { 'aria-live': 'polite' });
  const form = h('form', { class: 'hero-form', novalidate: true },
    h('div', { class: 'hero-input' }, website, button('Analyze', { primary: true, type: 'submit' })),
    errors.website,
    h('div', {}, toggle),
    details,
    status);
  const running = h('div');

  const get = (k) => String(fields[k]?.value ?? '');
  const clearErrors = () => {
    for (const [k, el] of Object.entries(errors)) {
      el.textContent = '';
      fields[k].removeAttribute('aria-invalid');
    }
    status.replaceChildren();
  };

  function showErrors(errs) {
    let first = null;
    for (const [k, message] of Object.entries(errs)) {
      if (errors[k]) {
        errors[k].textContent = message;
        fields[k].setAttribute('aria-invalid', 'true');
        if (k !== 'website') setDetails(true);
        first ??= fields[k];
      } else status.append(errorBox(message));
    }
    first?.focus();
  }

  async function start() {
    clearErrors();
    const inputs = formToInputs(get);
    const run = new AbortController();
    const stop = () => run.abort();
    signal?.addEventListener('abort', stop);

    const progress = progressList();
    const host = displayHost(inputs.website.trim()) || inputs.website.trim();
    const detected = h('p', { class: 'detected' }, 'Analyzing ', h('strong', { text: host }), '…');
    const elapsed = h('span', { class: 'muted small', 'aria-label': 'Elapsed time', text: '0:00' });
    const started = Date.now();
    const timer = setInterval(() => { elapsed.textContent = clock(Date.now() - started); }, 1000);
    form.hidden = true;
    running.replaceChildren(card({ className: 'running' },
      detected,
      progress.el,
      h('div', { class: 'running-foot' }, h('span', { class: 'muted small' }, 'Usually takes under a minute · ', elapsed), button('Cancel', { onClick: stop }))));

    const onEvent = (e) => {
      if (e?.type === 'progress') progress.update(e.source, e.state);
      else if (e?.type === 'detected') {
        detected.replaceChildren('Analyzing ', h('strong', { text: String(e.name ?? host) }), e.industry ? ` · ${e.industry}` : '', '…');
      }
    };

    let r;
    try {
      r = await ctx.runAnalysis({ inputs, onEvent, signal: run.signal });
    } finally {
      clearInterval(timer);
      signal?.removeEventListener('abort', stop);
    }
    if (signal?.aborted) return;
    running.replaceChildren();
    form.hidden = false;
    if (r.ok) {
      await ctx.library.put(r.report).catch(() => {});
      if (!signal?.aborted) ctx.navigate(reportHash(r.report.id));
      return;
    }
    if (r.aborted) return website.focus();
    if (r.errors) return showErrors(r.errors);
    status.replaceChildren(errorBox(r.message, { onRetry: start }));
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    start();
  });
  return { form, running };
}

export async function render(root, _route, ctx, signal) {
  const [table, entries] = await Promise.all([ctx.industries().catch(() => ({})), ctx.library.list().catch(() => [])]);
  if (signal?.aborted) return;
  const { form, running } = heroForm(ctx, signal, table);
  const mains = entries.filter((e) => e.type === 'main');

  root.append(...[
    h('section', { class: 'hero' },
      h('h1', { text: 'Know any brand in a minute' }),
      h('p', { class: 'lead', text: 'Positioning, channels, mentions and competitors — from just a website.' }),
      form,
      running),
    ctx.library.persistent ? null : notice(NOT_PERSISTENT, 'warn'),
    h('div', { class: 'section-title' },
      h('h2', { text: 'Recent reports' }),
      entries.length > Math.min(mains.length, RECENT) ? linkButton('View all', '#/reports') : null),
    mains.length
      ? h('div', { class: 'report-grid' }, mains.slice(0, RECENT).map((e) => reportCard(e, ctx)))
      : h('p', { class: 'empty', text: EMPTY }),
  ].filter(Boolean));
}
