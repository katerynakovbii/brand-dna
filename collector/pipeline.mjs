import { collectWebsite } from './collectors/website.mjs';
import { collectSocials } from './collectors/socials.mjs';
import { collectNews } from './collectors/news.mjs';
import { collectCommunity } from './collectors/community.mjs';
import { collectCompetitorSignals } from './collectors/competitors.mjs';
import { dedupeMentions } from './analyze/dedupe.mjs';
import { bucketMentions } from './analyze/windows.mjs';
import { computeTouchpoints } from './analyze/touchpoints.mjs';
import { positioningRules } from './analyze/positioning.mjs';
import { rankCompetitors } from './analyze/competitors.mjs';
import { buildPrompt, runAi, mergeCompetitors } from './analyze/ai.mjs';
import { industries, resolveIndustry } from './industries.mjs';
import { SCHEMA_VERSION } from '../shared/schema.js';

export const defaultCollectors = {
  website: collectWebsite,
  socials: collectSocials,
  news: collectNews,
  community: collectCommunity,
  competitors: collectCompetitorSignals,
};

async function safe(source, fn) {
  try {
    return await fn();
  } catch (e) {
    return { source, ok: false, error: e.message };
  }
}

const meaningful = (v) => v != null && !(Array.isArray(v) && v.length === 0);

export async function buildReport({ id, input, fetcher, now = new Date(), collectors = defaultCollectors, ai = null }) {
  const website = input.website
    ? await safe('website', () => collectors.website(input, { fetcher }))
    : { source: 'website', ok: false, error: 'No website provided' };
  const discovered = website.ok ? website.data.socialLinks : [];
  const [socials, news, community, competitors] = await Promise.all([
    safe('socials', () => collectors.socials(input, { fetcher, discovered })),
    safe('news', () => collectors.news(input, { fetcher, now })),
    safe('community', () => collectors.community(input, { fetcher, now })),
    safe('competitors', () => collectors.competitors(input, { fetcher })),
  ]);

  const items = dedupeMentions([...(news.ok ? news.data.items : []), ...(community.ok ? community.data.items : [])]);
  const capped = { ...(news.ok ? news.data.capped : {}), ...(community.ok ? community.data.capped : {}) };
  const mentions = { ...bucketMentions(items, { now, capped }), items: items.slice(0, 300) };

  const industryKey = resolveIndustry(input.industry);
  const touchpoints = computeTouchpoints({ website, socials, websiteUrl: input.website, industryKey, table: industries });
  const site = website.ok ? website.data : null;
  let positioning = positioningRules({ site, name: input.name });
  const ranked = rankCompetitors({
    name: input.name,
    results: competitors.ok ? competitors.data.results : [],
    industryKeywords: industries[industryKey].keywords,
  });
  let competitorList = mergeCompetitors(ranked, [], input.name);
  let mode = 'rules';
  let modeReason = 'No ANTHROPIC_API_KEY configured — rules-based analysis.';

  if (ai?.apiKey) {
    try {
      const prompt = buildPrompt({
        input,
        site,
        profiles: socials.ok ? socials.data.profiles : [],
        headlines: items.slice(0, 40).map((i) => i.title),
        candidates: ranked.map((r) => r.name),
      });
      const { competitors: aiCompetitors, ...fields } = await (ai.run ?? runAi)({ apiKey: ai.apiKey, prompt, fetchImpl: ai.fetchImpl });
      positioning = { ...positioning, ...Object.fromEntries(Object.entries(fields).filter(([, v]) => meaningful(v))) };
      competitorList = mergeCompetitors(ranked, aiCompetitors, input.name);
      mode = 'ai';
      modeReason = null;
    } catch (e) {
      modeReason = `AI analysis unavailable (${e.message}) — rules-based analysis.`;
    }
  }

  const sources = [website, socials, news, community, competitors].map((r) => ({
    source: r.source,
    ok: r.ok,
    error: r.error ?? (r.data?.partial?.length ? r.data.partial.join('; ') : null),
  }));

  return {
    v: SCHEMA_VERSION,
    id,
    type: input.type,
    parentId: input.parentId,
    createdAt: now.toISOString(),
    status: 'ok',
    error: null,
    mode,
    modeReason,
    input,
    industryKey,
    positioning,
    touchpoints,
    mentions,
    competitors: competitorList,
    sources,
  };
}
