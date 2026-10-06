import { isHttpUrl } from '../../../shared/platforms.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const BOOL_PROPS = new Set(['value', 'checked', 'disabled', 'selected', 'hidden', 'multiple', 'required']);

function appendChildren(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
}

// The only way views create DOM. Text is always text; there is deliberately no HTML escape hatch.
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (k === 'innerHTML' || k === 'outerHTML') throw new Error('h(): innerHTML is not allowed');
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'href') {
      const href = String(v);
      if (href.startsWith('#')) el.setAttribute('href', href);
      else if (isHttpUrl(href)) {
        el.setAttribute('href', href);
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      }
    } else if (BOOL_PROPS.has(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  appendChildren(el, children);
  return el;
}

export function s(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs ?? {})) if (v != null) el.setAttribute(k, String(v));
  appendChildren(el, children);
  return el;
}
