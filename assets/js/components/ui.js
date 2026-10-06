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

export function errorBox(message, { actionsUrl = null } = {}) {
  return h('div', { class: 'notice notice-error', role: 'alert' },
    h('p', { text: message }),
    actionsUrl ? h('p', {}, h('a', { href: actionsUrl, text: 'Open the analysis runs on GitHub' })) : null);
}

export function runningCard({ name, actionsUrl, startedAt } = {}) {
  return card({ title: name ? `Analyzing ${name}…` : 'Analyzing…', className: 'running' },
    h('div', { class: 'running-row' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }),
      h('p', { text: 'Collecting public data. This usually takes about 2 minutes; the page updates by itself.' })),
    Number.isFinite(new Date(startedAt ?? NaN).getTime())
      ? h('p', { class: 'muted', text: `Started ${new Date(startedAt).toLocaleTimeString()}.` })
      : null,
    actionsUrl ? h('p', {}, h('a', { href: actionsUrl, text: 'Watch the run on GitHub' })) : null);
}

export function downloadBar(buttons = []) {
  return h('div', { class: 'download-bar no-print' }, ...(Array.isArray(buttons) ? buttons : []), h('span', { class: 'muted small', text: 'Downloaded files are not encrypted.' }));
}
