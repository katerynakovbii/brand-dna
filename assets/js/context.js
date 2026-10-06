import { createLibrary, safeStorage } from './library.js';
import { createSettings } from './settings.js';
import { repoFromLocation, createGithub, fetchPublicReport, actionsUrlFor } from './github.js';

export function createContext({
  loc = globalThis.location,
  override = null,
  fetchImpl = (...a) => globalThis.fetch(...a),
  storage = safeStorage(),
  navigate = (hash) => { loc.hash = hash; },
  rerender = () => {},
} = {}) {
  const library = createLibrary(storage);
  const settings = createSettings(storage);
  const repo = repoFromLocation(loc, override);
  const token = settings.getToken();
  const github = repo && token ? createGithub({ ...repo, token, fetchImpl }) : null;
  const pageBase = new URL('.', loc.href).href;

  const getJson = async (path, missing) => {
    const res = await fetchImpl(new URL(path, pageBase).href, { cache: 'no-cache' });
    if (!res.ok) throw new Error(missing);
    return res.json();
  };
  let jwk;
  let table;

  return {
    library,
    settings,
    repo,
    github,
    hasToken: !!token,
    actionsUrl: repo ? actionsUrlFor(repo) : null,
    fetchText: async (id) => {
      const pub = () => fetchPublicReport({ id, ...repo, pageBase, fetchImpl });
      if (!github) return pub();
      try {
        return await github.fetchReport(id);
      } catch (e) {
        // An expired or invalid stored token must not block public shared links.
        if (e?.name === 'TokenRejectedError') return pub();
        throw e;
      }
    },
    publicJwk: () =>
      (jwk ??= getJson('keys/workflow-public.jwk', 'Setup incomplete: keys/workflow-public.jwk is missing. Run scripts/setup.mjs (see README).')),
    industries: () => (table ??= getJson('collector/industries.json', 'Could not load the industry list.')),
    navigate,
    rerender,
  };
}
