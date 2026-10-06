import { isHttpUrl } from '../../shared/platforms.js';

export const MODEL = 'claude-haiku-4-5-20251001';
const SENTIMENTS = ['positive', 'neutral', 'negative', 'mixed', 'unknown'];

export function buildPrompt({ input, site, profiles, headlines, candidates }) {
  const data = {
    brand: input.name,
    website: input.website,
    industry: input.industry,
    site: site
      ? { title: site.title, description: site.description, h1: site.h1, h2: site.h2, text: (site.text || '').slice(0, 4000) }
      : null,
    socialProfiles: profiles.map((p) => ({ platform: p.platform, check: p.check, title: p.title, description: p.description })),
    recentHeadlines: headlines.slice(0, 40),
    competitorCandidates: candidates.slice(0, 15),
  };
  return `You are a brand analyst. Analyze the brand below using only the collected data.

Return ONLY a JSON object, no prose, with exactly these keys:
{
  "statement": "one-sentence positioning statement as the brand presents itself",
  "audience": "who the brand targets",
  "differentiators": ["up to 5 short phrases"],
  "tone": "2-4 words describing the voice, e.g. 'confident, technical'",
  "siteSocialConsistency": "one sentence: does the social presence match the website message? 'unknown' if no social data",
  "newsSentiment": "positive | neutral | negative | mixed | unknown",
  "competitors": [{"name": "Brand", "website": "https://... or null", "reason": "short reason"}]
}
List up to 8 real direct competitors, best first. Prefer names from competitorCandidates when they are real competitors; ignore words that are not brands. Do not include ${input.name} itself.

Collected data:
${JSON.stringify(data, null, 2)}`;
}

export function parseJsonLoose(text) {
  const s = String(text);
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON object in AI response');
  return JSON.parse(s.slice(start, end + 1));
}

const str = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

export function validateAi(obj) {
  if (!obj || typeof obj !== 'object') return { ok: false, error: 'AI response is not an object' };
  const statement = str(obj.statement, 400);
  if (!statement) return { ok: false, error: 'AI response missing statement' };
  if (!Array.isArray(obj.competitors)) return { ok: false, error: 'AI response missing competitors' };
  const sentiment = String(obj.newsSentiment ?? 'unknown').toLowerCase();

  const validateWebsite = (w) => {
    if (typeof w !== 'string' || w.trim().length === 0) return null;
    if (w.length > 300) return null;
    if (!isHttpUrl(w)) return null;
    try {
      return new URL(w).href;
    } catch {
      return null;
    }
  };

  return {
    ok: true,
    value: {
      statement,
      audience: str(obj.audience, 300),
      differentiators: (Array.isArray(obj.differentiators) ? obj.differentiators : []).map((d) => str(d, 120)).filter(Boolean).slice(0, 5),
      tone: str(obj.tone, 80),
      siteSocialConsistency: str(obj.siteSocialConsistency, 300),
      newsSentiment: SENTIMENTS.includes(sentiment) ? sentiment : 'unknown',
      competitors: obj.competitors
        .filter((c) => c && str(c.name, 80))
        .slice(0, 8)
        .map((c) => ({ name: str(c.name, 80), website: validateWebsite(c.website), reason: str(c.reason, 200) })),
    },
  };
}

export async function runAi({ apiKey, prompt, fetchImpl = globalThis.fetch, timeoutMs = 60000 }) {
  let res;
  try {
    res = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 1500, messages: [{ role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new Error('AI request failed');
  }
  if (!res.ok) throw new Error(`Anthropic API HTTP ${res.status}`);
  const body = await res.json();
  const text = (body?.content || []).filter((b) => b?.type === 'text').map((b) => b.text).join('');
  const v = validateAi(parseJsonLoose(text));
  if (!v.ok) throw new Error(v.error);
  return v.value;
}

export function mergeCompetitors(ranked, aiList, brand) {
  const own = String(brand ?? '').trim().toLowerCase();

  // Filter ranked to safe entries
  const safeRanked = (ranked || []).filter((r) => r && typeof r === 'object' && typeof r.name === 'string' && r.name.trim());

  // If no AI list, return filtered ranked with website validation
  if (!aiList?.length) {
    return safeRanked.slice(0, 5).map(({ name, website, reason, coMentions }) => ({
      name,
      website: isHttpUrl(website) ? website : null,
      reason,
      coMentions,
    }));
  }

  // Filter aiList to safe entries
  const safeAi = (aiList || []).filter((c) => c && typeof c === 'object' && typeof c.name === 'string' && c.name.trim());

  const byName = new Map(safeRanked.map((r) => [r.name.toLowerCase(), r]));
  return safeAi
    .filter((c) => c.name.toLowerCase() !== own)
    .slice(0, 5)
    .map((c) => {
      const r = byName.get(c.name.toLowerCase());
      return {
        name: c.name,
        website: isHttpUrl(c.website) ? c.website : (isHttpUrl(r?.website) ? r.website : null),
        reason: c.reason ?? r?.reason ?? '',
        coMentions: r?.coMentions ?? 0,
      };
    });
}
