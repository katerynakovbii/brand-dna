import { REPORT_ID_RE } from '../../shared/schema.js';

const API = 'https://api.github.com';

export class TokenRejectedError extends Error {
  constructor(status) {
    super(`GitHub token rejected${status ? ` (HTTP ${status})` : ''} — check Settings.`);
    this.name = 'TokenRejectedError';
  }
}

export function repoFromLocation(loc, override = null) {
  if (override?.owner && override?.repo) return { owner: override.owner, repo: override.repo };
  const m = loc.hostname.match(/^([a-z0-9-]+)\.github\.io$/i);
  if (!m) return null;
  const first = loc.pathname.split('/').filter(Boolean)[0];
  return { owner: m[1], repo: first && first !== 'index.html' ? first : `${m[1]}.github.io` };
}

export const actionsUrlFor = ({ owner, repo }) => `https://github.com/${owner}/${repo}/actions/workflows/analyze.yml`;

export function createGithub({ owner, repo, token, fetchImpl = (...a) => globalThis.fetch(...a) }) {
  const base = `${API}/repos/${owner}/${repo}`;
  async function call(path, init = {}) {
    const res = await fetchImpl(`${base}${path}`, {
      cache: 'no-store',
      ...init,
      headers: { authorization: `Bearer ${token}`, 'x-github-api-version': '2022-11-28', ...(init.headers || {}) },
    });
    if (res.status === 401 || res.status === 403) throw new TokenRejectedError(res.status);
    return res;
  }
  const json = { accept: 'application/vnd.github+json' };

  return {
    actionsUrl: actionsUrlFor({ owner, repo }),
    async dispatch({ reportId, payload }) {
      const res = await call('/actions/workflows/analyze.yml/dispatches', {
        method: 'POST',
        headers: { ...json, 'content-type': 'application/json' },
        body: JSON.stringify({ ref: 'main', inputs: { reportId, payload } }),
      });
      if (res.status === 404) throw new TokenRejectedError(404);
      if (!res.ok) throw new Error(`GitHub API error ${res.status}`);
    },
    async fetchReport(id) {
      if (!REPORT_ID_RE.test(String(id))) return null;
      const res = await call(`/contents/reports/${id}.enc?ref=main`, { headers: { accept: 'application/vnd.github.raw' } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`GitHub API error ${res.status}`);
      return res.text();
    },
    async testToken() {
      try {
        const repoRes = await call('', { headers: json });
        if (!repoRes.ok) return { ok: false, message: `Repository ${owner}/${repo} not found for this token.` };
        const wf = await call('/actions/workflows/analyze.yml', { headers: json });
        if (!wf.ok) return { ok: false, message: 'Token can read the repository but not its Actions workflow. Give it Actions: read & write.' };
        // Enabling an already active workflow changes nothing but needs the same write access as starting a run.
        const canRun = await call('/actions/workflows/analyze.yml/enable', { method: 'PUT', headers: json })
          .then((res) => res.ok, (e) => (e instanceof TokenRejectedError ? false : Promise.reject(e)));
        if (!canRun) return { ok: false, message: 'Token can read the workflow but not start it. Set Actions: Read and write on the token.' };
        return { ok: true, message: `Token works for ${owner}/${repo}.` };
      } catch (e) {
        return { ok: false, message: e.message };
      }
    },
  };
}

// For people who open a shared link without a token. Report files are immutable, so caching is harmless.
export async function fetchPublicReport({ id, owner, repo, pageBase, fetchImpl = (...a) => globalThis.fetch(...a) }) {
  if (!REPORT_ID_RE.test(String(id))) return null;
  const urls = [new URL(`reports/${id}.enc`, pageBase).href];
  if (owner && repo) urls.push(`https://raw.githubusercontent.com/${owner}/${repo}/main/reports/${id}.enc`);
  for (const url of urls) {
    try {
      const res = await fetchImpl(url, { cache: 'no-cache' });
      if (res.ok) return await res.text();
    } catch {}
  }
  return null;
}
