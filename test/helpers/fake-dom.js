// Just enough DOM for h()/s() tests. Installs globalThis.document; call the returned restore().
class FakeNode {
  constructor(tagName, ns = null) {
    this.tagName = tagName.toUpperCase();
    this.namespaceURI = ns;
    this.attributes = {};
    this.children = [];
    this.listeners = {};
    this.style = {};
    this._text = '';
  }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
}

export function installFakeDom() {
  const prev = globalThis.document;
  globalThis.document = {
    createElement: (t) => new FakeNode(t),
    createElementNS: (ns, t) => new FakeNode(t, ns),
    createTextNode: (t) => ({ nodeType: 3, textContent: String(t) }),
  };
  return () => { globalThis.document = prev; };
}
