import { runAnalysis } from './api.js';
import { createShareLink, loadShared } from './share.js';

// Everything views need from the outside world, in one injectable object.
export function createContext({
  library,
  fetchImpl = (...a) => globalThis.fetch(...a),
  navigate = (hash) => { globalThis.location.hash = hash; },
  rerender = () => {},
  origin = globalThis.location?.origin,
} = {}) {
  let table;
  return {
    library,
    navigate,
    rerender,
    toastHost: globalThis.document?.body,
    industries: () => (table ??= fetchImpl('/collector/industries.json')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Could not load the industry list.'))))
      .catch((e) => { table = null; throw e; })),
    runAnalysis: (args) => runAnalysis({ ...args, fetchImpl }),
    createShareLink: (report) => createShareLink(report, { fetchImpl, origin }),
    loadShared: (id, key) => loadShared(id, key, { fetchImpl }),
    copy: (text) => globalThis.navigator.clipboard.writeText(text),
  };
}
