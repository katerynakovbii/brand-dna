// /api/share: stores and serves encrypted reports. Only ciphertext ever reaches the server;
// the key lives in the share link's #fragment, which browsers never send.
import { REPORT_ID_RE } from '../shared/schema.js';

export const MAX_CIPHERTEXT = 2 * 1024 * 1024;
const json = (body, status) => Response.json(body, { status });
const path = (id) => `shares/${id}.enc`;
const B64URL = /^[A-Za-z0-9_-]+$/;

function isEnvelope(text) {
  try {
    const e = JSON.parse(text);
    return e?.v === 1 && B64URL.test(e.iv) && B64URL.test(e.ct);
  } catch {
    return false;
  }
}

async function store(request, { put, head }) {
  const text = await request.text();
  if (text.length > MAX_CIPHERTEXT + 1024) return json({ error: 'Report too large to share.' }, 413);
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }
  const { id, ciphertext } = body ?? {};
  if (!REPORT_ID_RE.test(String(id)) || typeof ciphertext !== 'string') return json({ error: 'Invalid request.' }, 400);
  if (ciphertext.length > MAX_CIPHERTEXT) return json({ error: 'Report too large to share.' }, 413);
  if (!isEnvelope(ciphertext)) return json({ error: 'Invalid request.' }, 400);
  try {
    await head(path(id));
    return json({ error: 'Already shared.' }, 409);
  } catch {}
  try {
    await put(path(id), ciphertext, { access: 'public', addRandomSuffix: false, allowOverwrite: false, contentType: 'text/plain' });
  } catch (e) {
    if (/already exists/i.test(e?.message)) return json({ error: 'Already shared.' }, 409);
    console.log('share store failed');
    return json({ error: 'Storage unavailable.' }, 502);
  }
  return json({ ok: true }, 200);
}

async function load(request, { head, fetchImpl }) {
  const id = new URL(request.url).searchParams.get('id');
  if (!REPORT_ID_RE.test(String(id))) return json({ error: 'Not found.' }, 404);
  let url;
  try {
    ({ url } = await head(path(id)));
  } catch {
    return json({ error: 'Not found.' }, 404);
  }
  const res = await fetchImpl(url);
  if (!res.ok) return json({ error: 'Not found.' }, 404);
  return new Response(await res.text(), {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=31536000, immutable' },
  });
}

export function handleShare(request, deps) {
  if (request.method === 'POST') return store(request, deps);
  if (request.method === 'GET') return load(request, deps);
  return new Response(null, { status: 405, headers: { allow: 'GET, POST' } });
}
