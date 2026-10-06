import { parseRoute } from './router.js';
import { createContext } from './context.js';
import { REPO_OVERRIDE } from './config.js';
import { errorBox } from './components/ui.js';
import * as dashboard from './views/dashboard.js';
import * as settings from './views/settings.js';
import * as newView from './views/new.js';
import * as report from './views/report.js';
import * as compare from './views/compare.js';
import * as notfound from './views/notfound.js';

const views = { dashboard, settings, new: newView, report, compare, notfound };
const root = document.getElementById('app');
let controller = null;

function render() {
  controller?.abort();
  controller = new AbortController();
  const route = parseRoute(location.hash);
  const ctx = createContext({ override: REPO_OVERRIDE, rerender: render });
  for (const a of document.querySelectorAll('[data-nav]')) {
    a.toggleAttribute('aria-current', a.dataset.nav === route.name);
  }
  root.replaceChildren();
  window.scrollTo(0, 0);
  Promise.resolve()
    .then(() => views[route.name].render(root, route, ctx, controller.signal))
    .catch((e) => {
      console.error(e);
      root.replaceChildren(errorBox(`Something went wrong: ${e.message}`));
    });
}

window.addEventListener('hashchange', render);
render();
