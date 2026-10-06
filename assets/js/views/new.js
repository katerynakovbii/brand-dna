import { h } from '../components/h.js';
import { card, button, errorBox, notice, linkButton } from '../components/ui.js';
import { startAnalysis } from '../analysis.js';
import { reportHash } from '../router.js';
import { SOCIAL_FIELDS } from '../../../shared/schema.js';

const SOCIAL_LABELS = { instagram: 'Instagram', linkedin: 'LinkedIn', x: 'X (Twitter)', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube' };

export function formToInputs(fd) {
  const v = (k) => fd.get(k) ?? '';
  const socials = Object.fromEntries(SOCIAL_FIELDS.map((f) => [f, v(f)]));
  socials.other = v('other').split('\n').map((l) => l.trim()).filter(Boolean);
  return {
    name: v('name'),
    website: v('website'),
    industry: v('industry') === '__custom' ? v('industryCustom') : v('industry'),
    socials,
  };
}

function field(name, label, input, hint = null) {
  input.id = `f-${name}`;
  input.name = name;
  return h('div', { class: 'field' },
    h('label', { for: input.id, text: label }),
    input,
    hint ? h('span', { class: 'muted small', text: hint }) : null,
    h('span', { class: 'error', id: `e-${name}`, 'aria-live': 'polite' }));
}

export async function render(root, _route, ctx, signal) {
  if (!ctx.hasToken || !ctx.github) {
    root.append(card({ title: 'New analysis' },
      notice(ctx.repo ? 'Add a GitHub token in Settings to run analyses.' : "Couldn't detect the GitHub repository from this address. Set REPO_OVERRIDE in assets/js/config.js."),
      h('p', {}, linkButton('Open Settings', '#/settings', { primary: true }))));
    return;
  }

  let table = {};
  try {
    table = await ctx.industries();
  } catch {}
  if (signal?.aborted) return;
  const custom = h('input', { type: 'text', placeholder: 'Type your industry', maxlength: 60, hidden: true });
  const select = h('select', { required: true },
    h('option', { value: '', text: 'Choose an industry' }),
    Object.entries(table).filter(([k]) => k !== 'default').map(([, v]) => h('option', { value: v.label, text: v.label })),
    h('option', { value: '__custom', text: 'Other — type it' }));
  select.addEventListener('change', () => { custom.hidden = select.value !== '__custom'; });

  const status = h('div');
  const submit = button('Run analysis', { primary: true, type: 'submit' });
  const form = h('form', { class: 'form', novalidate: true },
    field('name', 'Company name *', h('input', { type: 'text', maxlength: 100, required: true, autocomplete: 'organization' })),
    field('website', 'Website *', h('input', { type: 'text', inputmode: 'url', placeholder: 'acme.com', required: true })),
    h('div', { class: 'field' },
      h('label', { for: 'f-industry', text: 'Industry *' }),
      Object.assign(select, { id: 'f-industry', name: 'industry' }),
      Object.assign(custom, { name: 'industryCustom', id: 'f-industryCustom' }),
      h('span', { class: 'error', id: 'e-industry' })),
    h('fieldset', { class: 'fieldset' },
      h('legend', { text: 'Social profiles (optional)' }),
      SOCIAL_FIELDS.map((f) => field(f, SOCIAL_LABELS[f], h('input', { type: 'text', inputmode: 'url', placeholder: `https://…` }))),
      field('other', 'Other links (one per line, up to 5)', h('textarea', { rows: 3 }))),
    h('p', { class: 'muted small', text: 'Your inputs are encrypted in this browser before they are sent. Only the analysis workflow can read them.' }),
    h('div', {}, submit),
    status);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    for (const el of form.querySelectorAll('.error')) el.textContent = '';
    for (const el of form.querySelectorAll('[aria-invalid]')) el.removeAttribute('aria-invalid');
    status.replaceChildren();
    submit.disabled = true;
    submit.textContent = 'Starting…';
    try {
      const publicJwk = await ctx.publicJwk();
      if (signal?.aborted) return;
      const r = await startAnalysis({ inputs: formToInputs(new FormData(form)), github: ctx.github, library: ctx.library, publicJwk });
      if (signal?.aborted) return;
      if (!r.ok) {
        for (const [k, msg] of Object.entries(r.errors)) {
          const target = SOCIAL_FIELDS.includes(k) || ['name', 'website', 'industry', 'other'].includes(k) ? k : null;
          if (target) {
            form.querySelector(`#e-${target}`).textContent = msg;
            form.querySelector(`#f-${target}`)?.setAttribute('aria-invalid', 'true');
          } else status.append(errorBox(msg));
        }
        form.querySelector('[aria-invalid="true"]')?.focus();
        return;
      }
      ctx.navigate(reportHash(r.entry.reportId, r.entry.reportKey));
    } catch (err) {
      if (signal?.aborted) return;
      status.append(errorBox(err.name === 'TokenRejectedError' ? err.message : `Couldn't start the analysis: ${err.message}`));
    } finally {
      if (!signal?.aborted) {
        submit.disabled = false;
        submit.textContent = 'Run analysis';
      }
    }
  });

  root.append(card({ title: 'New analysis' }, form));
}
