// Test double for the collector `fetcher` contract. Returns a minimal Response-like object
// (status, ok, headers, finalUrl, text()) — a real Response can't carry LinkedIn's status 999.
function fakeResponse(url, { status = 200, body = '', headers = {}, finalUrl } = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(headers),
    finalUrl: finalUrl ?? url,
    text: async () => body,
  };
}

export function fakeFetcher(routes) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    for (const [pattern, handler] of routes) {
      const hit = typeof pattern === 'string' ? url === pattern : pattern.test(url);
      if (!hit) continue;
      const r = typeof handler === 'function' ? await handler(url) : handler;
      if (r instanceof Error) throw r;
      return fakeResponse(url, r);
    }
    return fakeResponse(url, { status: 404, body: 'not found' });
  };
  fn.calls = calls;
  return fn;
}
