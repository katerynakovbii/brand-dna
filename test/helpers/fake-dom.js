// Just enough DOM for h()/s() and view tests. Installs globalThis.document; call the returned restore().
class FakeNode {
  constructor(tagName, ns = null) {
    this.tagName = tagName.toUpperCase();
    this.namespaceURI = ns;
    this.attributes = {};
    this.children = [];
    this.listeners = {};
    this.style = {};
    this.parentNode = null;
    this._text = '';
  }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; }
  removeAttribute(k) { delete this.attributes[k]; }
  toggleAttribute(k, on) { if (on) this.attributes[k] = ''; else delete this.attributes[k]; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  dispatch(type, extra = {}) {
    const ev = { type, target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra };
    for (const fn of this.listeners[type] ?? []) fn(ev);
    return ev;
  }
  // Like the real DOM, strings become text nodes.
  _adopt(nodes) {
    return nodes.map((n) => {
      if (typeof n !== 'object' || n === null) return { nodeType: 3, textContent: String(n) };
      if (n && typeof n === 'object') { n.parentNode?._drop?.(n); n.parentNode = this; }
      return n;
    });
  }
  _drop(n) { this.children = this.children.filter((c) => c !== n); }
  append(...nodes) { this.children.push(...this._adopt(nodes)); }
  prepend(...nodes) { this.children.unshift(...this._adopt(nodes)); }
  replaceChildren(...nodes) { this.children = this._adopt(nodes); }
  replaceWith(...nodes) {
    const p = this.parentNode;
    if (!p) return;
    const i = p.children.indexOf(this);
    p.children.splice(i, 1, ...p._adopt(nodes));
    this.parentNode = null;
  }
  remove() { this.parentNode?._drop(this); this.parentNode = null; }
  focus() { globalThis.document.activeElement = this; }
  scrollIntoView() { this.scrolled = true; }
  click() { this.dispatch('click'); }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
}

export function installFakeDom() {
  const prev = globalThis.document;
  const body = new FakeNode('body');
  globalThis.document = {
    body,
    activeElement: null,
    createElement: (t) => new FakeNode(t),
    createElementNS: (ns, t) => new FakeNode(t, ns),
    createTextNode: (t) => ({ nodeType: 3, textContent: String(t) }),
  };
  return () => { globalThis.document = prev; };
}

// Test helpers for walking fake trees.
export function findAll(node, pred, out = []) {
  for (const c of node?.children ?? []) {
    if (c && typeof c === 'object' && c.tagName) {
      if (pred(c)) out.push(c);
      findAll(c, pred, out);
    }
  }
  return out;
}
export const find = (node, pred) => findAll(node, pred)[0] ?? null;
export const byText = (node, tag, re) => find(node, (n) => n.tagName === tag.toUpperCase() && (re instanceof RegExp ? re.test(n.textContent) : n.textContent === re));
export const makeRoot = () => globalThis.document.createElement('main');
export const tick = () => new Promise((r) => setTimeout(r, 0));
