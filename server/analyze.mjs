// POST /api/analyze: validates the request, runs the pipeline and streams NDJSON progress, then the report.
// Logs carry timings only — never brand names, URLs or report content.
import { validateInputs } from '../shared/schema.js';
import { newReportId } from '../shared/crypto.js';

export const MAX_BODY = 8 * 1024;
const json = (body, status) => Response.json(body, { status });

export async function handleAnalyze(request, { buildReport, fetcher, env = {}, newId = newReportId, now = () => new Date(), log = console.log }) {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY) return json({ error: 'Request too large.' }, 413);
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return json({ error: 'Invalid request.' }, 400);
  const v = validateInputs(raw);
  if (!v.ok) return json({ errors: v.errors }, 400);

  const enc = new TextEncoder();
  const started = Date.now();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) => {
        try {
          controller.enqueue(enc.encode(`${JSON.stringify(obj)}\n`));
        } catch {} // client went away
      };
      try {
        const report = await buildReport({
          id: newId(),
          input: v.value,
          now: now(),
          fetcher,
          ai: env.ANTHROPIC_API_KEY ? { apiKey: env.ANTHROPIC_API_KEY } : null,
          onProgress: send,
        });
        send({ type: 'report', report });
        log(`analyze ok ${Date.now() - started}ms`);
      } catch {
        send({ type: 'error', message: 'The analysis failed. Try again.' });
        log(`analyze failed ${Date.now() - started}ms`);
      }
      try {
        controller.close();
      } catch {}
    },
  });
  return new Response(stream, { headers: { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store' } });
}
