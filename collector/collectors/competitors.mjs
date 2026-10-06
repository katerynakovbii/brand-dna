import * as cheerio from 'cheerio';
import { getText } from '../safeFetch.mjs';
import { fetchFeed, googleNewsUrl, cleanName } from './news.mjs';
import { isHttpUrl } from '../../shared/platforms.js';

export function competitorQueries({ name, industry }) {
  const n = cleanName(name);
  return [`"${n}" alternatives`, `"${n}" vs`, `${industry} companies like "${n}"`];
}

function unwrapDdg(href) {
  try {
    const u = new URL(href, 'https://duckduckgo.com');
    const unwrapped = u.searchParams.get('uddg') || u.href;
    return isHttpUrl(unwrapped) ? unwrapped : '';
  } catch {
    return '';
  }
}

export function parseDuckDuckGo(html) {
  const $ = cheerio.load(html);
  return $('.result')
    .map((_, r) => {
      const a = $(r).find('.result__a').first();
      const href = a.attr('href');
      return {
        title: a.text().replace(/\s+/g, ' ').trim(),
        url: href ? unwrapDdg(href) : '',
        snippet: $(r).find('.result__snippet').text().replace(/\s+/g, ' ').trim(),
      };
    })
    .get()
    .filter((x) => x.title && x.url);
}

async function google(fetcher, query) {
  const items = await fetchFeed(fetcher, googleNewsUrl(query));
  return items.map((i) => ({ query, engine: 'google-news', title: i.title.replace(/\s+-\s+[^-]+$/, ''), url: i.link, snippet: i.description }));
}

async function duck(fetcher, query) {
  const r = await getText(fetcher, `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return parseDuckDuckGo(r.text).map((x) => ({ query, engine: 'duckduckgo', ...x }));
}

export async function collectCompetitorSignals(input, { fetcher }) {
  const jobs = competitorQueries(input).flatMap((q) => [
    ['google-news', google(fetcher, q)],
    ['duckduckgo', duck(fetcher, q)],
  ]);
  const settled = await Promise.allSettled(jobs.map(([, p]) => p));
  const results = [];
  const failures = [];
  settled.forEach((s, i) => {
    if (s.status === 'fulfilled') results.push(...s.value);
    else failures.push(`${jobs[i][0]}: ${s.reason.message}`);
  });
  if (failures.length === jobs.length) return { source: 'competitors', ok: false, error: [...new Set(failures)].join('; ') };
  return { source: 'competitors', ok: true, data: { results, partial: [...new Set(failures)] } };
}
