import { parseRoute } from './router.js';
import { createContext } from './context.js';
import { openLibrary } from './store.js';
import { errorBox } from './components/ui.js';
import * as home from './views/home.js';
import * as reports from './views/reports.js';
import * as report from './views/report.js';
import * as compare from './views/compare.js';
import * as shared from './views/shared.js';
import * as notfound from './views/notfound.js';

const views = { home, reports, report, compare, shared, notfound };
const root = document.getElementById('app');
const library = await openLibrary();
const ctx = createContext({ library, rerender: render });
let controller = null;

function render() {
  controller?.abort();
  controller = new AbortController();
  const { signal } = controller;
  const route = parseRoute(location.hash);
  for (const a of document.querySelectorAll('[data-nav]')) {
    if (a.dataset.nav === route.name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  root.replaceChildren();
  window.scrollTo(0, 0);
  Promise.resolve()
    .then(() => views[route.name].render(root, route, ctx, signal))
    .catch((e) => {
      if (signal.aborted) return;
      console.error(e);
      root.replaceChildren(errorBox(`Something went wrong: ${e.message}`, { onRetry: render }));
    });
}

window.addEventListener('hashchange', render);
render();
