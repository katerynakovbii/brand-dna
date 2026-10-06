import { getText } from '../safeFetch.mjs';
import { parseFeed } from '../rss.mjs';

export const GOOGLE_CAP = 100;
const DAY = 86400000;

export const cleanName = (name) => String(name).replace(/"/g, '').trim();
export const googleNewsUrl = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
export const bingNewsUrl = (q) => `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&count=100`;

export function unwrapBing(link) {
  try {
    return new URL(link).searchParams.get('url') || link;
  } catch {
    return link;
  }
}

export async function fetchFeed(fetcher, url) {
  const r = await getText(fetcher, url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return parseFeed(r.text);
}

export async function collectNews({ name }, { fetcher, now = new Date() }) {
  const n = cleanName(name);
  const [g, b] = await Promise.allSettled([
    fetchFeed(fetcher, googleNewsUrl(`"${n}" when:60d`)),
    fetchFeed(fetcher, bingNewsUrl(`"${n}"`)),
  ]);
  const partial = [];
  if (g.status === 'rejected') partial.push(`google-news: ${g.reason.message}`);
  if (b.status === 'rejected') partial.push(`bing-news: ${b.reason.message}`);
  if (partial.length === 2) return { source: 'news', ok: false, error: partial.join('; ') };

  const googleRaw = g.status === 'fulfilled' ? g.value : [];
  const lower = n.toLowerCase();
  const googleItems = googleRaw.map((i) => ({ date: i.date, source: 'google-news', title: i.title, url: i.link, publisher: i.source }));
  const bingItems = (b.status === 'fulfilled' ? b.value : [])
    .filter((i) => `${i.title} ${i.description}`.toLowerCase().includes(lower))
    .map((i) => ({ date: i.date, source: 'bing-news', title: i.title, url: unwrapBing(i.link), publisher: null }));

  const minTime = now.getTime() - 60 * DAY;
  const items = [...googleItems, ...bingItems].filter((i) => i.date && i.url && Date.parse(i.date) >= minTime);
  return {
    source: 'news',
    ok: true,
    data: { items, capped: { 'google-news': googleRaw.length >= GOOGLE_CAP, 'bing-news': false }, partial },
  };
}
