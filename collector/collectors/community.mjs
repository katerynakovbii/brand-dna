import { getJson } from '../safeFetch.mjs';
import { stripHtml } from '../rss.mjs';
import { cleanName } from './news.mjs';
import { isHttpUrl } from '../../shared/platforms.js';

const DAY = 86400000;

async function json(fetcher, url) {
  const r = await getJson(fetcher, url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json;
}

export async function collectCommunity({ name }, { fetcher, now = new Date() }) {
  const q = encodeURIComponent(`"${cleanName(name)}"`);
  const since = Math.floor((now.getTime() - 60 * DAY) / 1000);
  const [hn, rd] = await Promise.allSettled([
    json(fetcher, `https://hn.algolia.com/api/v1/search_by_date?query=${q}&tags=(story,comment)&numericFilters=${encodeURIComponent(`created_at_i>${since}`)}&hitsPerPage=100`),
    json(fetcher, `https://www.reddit.com/search.json?q=${q}&sort=new&t=year&limit=100`),
  ]);
  const partial = [];
  if (hn.status === 'rejected') partial.push(`hackernews: ${hn.reason.message}`);
  if (rd.status === 'rejected') partial.push(`reddit: ${rd.reason.message}`);
  if (partial.length === 2) return { source: 'community', ok: false, error: partial.join('; ') };

  const hits = hn.status === 'fulfilled' ? hn.value.hits || [] : [];
  const hnItems = hits
    .filter((h) => !h.url || isHttpUrl(h.url))
    .map((h) => ({
      date: new Date(h.created_at_i * 1000).toISOString(),
      source: 'hackernews',
      title: (h.title || h.story_title || stripHtml(h.comment_text)).slice(0, 200),
      url: `https://news.ycombinator.com/item?id=${h.objectID}`,
    }));
  const children = rd.status === 'fulfilled' ? rd.value.data?.children || [] : [];
  const rdItems = children
    .map((c) => c.data)
    .filter((d) => d && d.created_utc >= since)
    .map((d) => ({
      date: new Date(d.created_utc * 1000).toISOString(),
      source: 'reddit',
      title: String(d.title).slice(0, 200),
      url: `https://www.reddit.com${d.permalink}`,
    }))
    .filter((i) => isHttpUrl(i.url));

  return {
    source: 'community',
    ok: true,
    data: {
      items: [...hnItems, ...rdItems],
      capped: {
        hackernews: hn.status === 'fulfilled' && (hn.value.nbHits ?? 0) > hits.length,
        reddit: children.length >= 100 && rdItems.length === children.filter((c) => c.data && c.data.created_utc >= since).length,
      },
      partial,
    },
  };
}
