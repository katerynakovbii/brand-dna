import { h, s } from './h.js';
import { sparklinePoints, ringDash } from './geometry.js';

export function card({ title, actions = null, className = '' }, ...children) {
  return h('section', { class: `card ${className}`.trim() },
    title || actions ? h('div', { class: 'card-head' }, title ? h('h2', { text: title }) : null, actions) : null,
    ...children);
}

export const pill = (text, tone = 'muted') => h('span', { class: `pill pill-${tone}`, text });

export function button(label, { primary = false, onClick, disabled = false, title, type = 'button' } = {}) {
  return h('button', { type, class: primary ? 'btn btn-primary' : 'btn', onClick, disabled, title, text: label });
}

export const linkButton = (label, href, { primary = false } = {}) =>
  h('a', { class: primary ? 'btn btn-primary' : 'btn', href, text: label });

export function copyButton(text, label = 'Copy link') {
  const btn = button(label, {
    onClick: async () => {
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = 'Copied';
      } catch {
        btn.textContent = 'Copy failed — select the address bar';
      }
      setTimeout(() => { btn.textContent = label; }, 2000);
    },
  });
  return btn;
}

export function sparkline(values, { width = 240, height = 48 } = {}) {
  values = Array.isArray(values) ? values : [];
  return s('svg', { class: 'sparkline', viewBox: `0 0 ${width} ${height}`, width, height, role: 'img', 'aria-label': `Weekly mentions: ${values.join(', ')}` },
    s('polyline', { points: sparklinePoints(values, width, height), fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linejoin': 'round' }));
}

export function scoreRing(score, { size = 96 } = {}) {
  const r = size / 2 - 8;
  score = Number.isFinite(Number(score)) ? score : null;
  const { c, dash } = ringDash(score, r);
  const mid = size / 2;
  return s('svg', { class: 'score-ring', viewBox: `0 0 ${size} ${size}`, width: size, height: size, role: 'img', 'aria-label': `Touchpoint score ${score} of 100` },
    s('circle', { cx: mid, cy: mid, r, class: 'ring-track' }),
    s('circle', { cx: mid, cy: mid, r, class: 'ring-value', 'stroke-dasharray': `${dash} ${c}`, transform: `rotate(-90 ${mid} ${mid})` }),
    s('text', { x: mid, y: mid, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'ring-label' }, String(score ?? '—')));
}

export const notice = (message, tone = 'info') => h('div', { class: `notice notice-${tone}`, role: 'status' }, message);

export function errorBox(message, { onRetry = null } = {}) {
  return h('div', { class: 'notice notice-error', role: 'alert' },
    h('p', { text: message }),
    onRetry ? h('p', {}, button('Try again', { primary: true, onClick: onRetry })) : null);
}

const PROGRESS_LABELS = {
  website: 'Website', socials: 'Social profiles', news: 'News',
  community: 'Community', competitors: 'Competitors', analysis: 'Analysis',
};
const PROGRESS_STAGES = [['website'], ['socials', 'news', 'community', 'competitors'], ['analysis']];
const PROGRESS_ICONS = { pending: '○', running: '', done: '✓', failed: '✕' };
const FINAL = new Set(['done', 'failed']);

// Live checklist of the analysis sources. The first unfinished stage shows as running.
export function progressList() {
  const states = Object.fromEntries(Object.keys(PROGRESS_LABELS).map((k) => [k, 'pending']));
  const rows = {};
  const el = h('ul', { class: 'progress-list', 'aria-live': 'polite' },
    ...Object.entries(PROGRESS_LABELS).map(([key, label]) => {
      rows[key] = { li: h('li'), label };
      return rows[key].li;
    }));
  function render() {
    const stage = PROGRESS_STAGES.find((keys) => keys.some((k) => !FINAL.has(states[k]))) ?? [];
    for (const [key, { li, label }] of Object.entries(rows)) {
      const state = !FINAL.has(states[key]) && stage.includes(key) ? 'running' : states[key];
      li.className = `progress-${state}`;
      li.setAttribute('aria-label', `${label}: ${state}`);
      li.replaceChildren(
        state === 'running' ? h('span', { class: 'spinner', 'aria-hidden': 'true' }) : h('span', { class: 'progress-icon', 'aria-hidden': 'true', text: PROGRESS_ICONS[state] }),
        h('span', { text: label }));
    }
  }
  render();
  return {
    el,
    update(source, state) {
      if (!(source in states) || !FINAL.has(state)) return;
      states[source] = state;
      render();
    },
  };
}

export function toast(message, host = document.body, { ms = 2500 } = {}) {
  const el = h('div', { class: 'toast', role: 'status', text: message });
  host.append(el);
  setTimeout(() => el.remove(), ms);
  return el;
}

export function menuButton(label, items = []) {
  const menu = h('div', { class: 'menu-list', role: 'menu', hidden: true });
  const trigger = h('button', { type: 'button', class: 'btn', 'aria-haspopup': 'true', 'aria-expanded': 'false', text: `${label} ▾` });
  const setOpen = (open) => {
    menu.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
  };
  trigger.addEventListener('click', () => setOpen(menu.hidden));
  for (const item of items) {
    menu.append(h('button', { type: 'button', role: 'menuitem', class: 'menu-item', text: item.label,
      onClick: () => { setOpen(false); item.onClick?.(); } }));
  }
  const wrap = h('div', { class: 'menu' }, trigger, menu);
  wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') { setOpen(false); trigger.focus(); } });
  return wrap;
}

export function downloadBar(buttons = []) {
  return h('div', { class: 'download-bar no-print' }, ...(Array.isArray(buttons) ? buttons : []), h('span', { class: 'muted small', text: 'Downloaded files are not encrypted.' }));
}
