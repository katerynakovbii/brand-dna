import * as cheerio from 'cheerio';
import { getText } from '../safeFetch.mjs';
import { platformOf, isHttpUrl } from '../../shared/platforms.js';

const SHARE_RE = /\/(sharer|share|intent|dialog)(\.php)?(\/|\?|$)|[?&](u|url)=/i;

export async function collectWebsite({ website }, { fetcher }) {
  try {
    const page = await getText(fetcher, website);
    if (!page.ok) return { source: 'website', ok: false, error: `HTTP ${page.status}` };
    const data = parseHomepage(page.text, page.finalUrl);
    data.url = website;
    data.sitemapCount = await countSitemap(fetcher, page.finalUrl);
    return { source: 'website', ok: true, data };
  } catch (e) {
    return { source: 'website', ok: false, error: e.message };
  }
}

export function parseHomepage(html, baseUrl) {
  const $ = cheerio.load(html);
  const meta = (n) =>
    $(`meta[name="${n}"]`).attr('content')?.trim() || $(`meta[property="${n}"]`).attr('content')?.trim() || null;
  const abs = (href) => {
    try {
      const u = new URL(href, baseUrl).href;
      return isHttpUrl(u) ? u : null;
    } catch {
      return null;
    }
  };
  const texts = (sel, max) => $(sel).map((_, e) => $(e).text().replace(/\s+/g, ' ').trim()).get().filter(Boolean).slice(0, max);

  let org = null;
  $('script[type="application/ld+json"]').each((_, s) => {
    if (org) return;
    try {
      const json = JSON.parse($(s).contents().text());
      const nodes = [json, ...(json['@graph'] || [])].flat();
      const o = nodes.find((n) => n && /Organization|Corporation|LocalBusiness/.test([].concat(n['@type']).join(' ')));
      if (o) org = { name: o.name || null, sameAs: [].concat(o.sameAs || []).filter(isHttpUrl) };
    } catch {}
  });

  const anchors = $('a[href]').map((_, a) => abs($(a).attr('href'))).get().filter(Boolean);
  const socialLinks = [...new Set([...anchors, ...(org?.sameAs || [])])]
    .filter((u) => platformOf(u) && !SHARE_RE.test(u));
  const navText = $('a[href]').map((_, a) => `${$(a).attr('href')} ${$(a).text()}`).get().join(' ').toLowerCase();
  const feedHref = $('link[type="application/rss+xml"], link[type="application/atom+xml"]').first().attr('href');

  const result = {
    finalUrl: baseUrl,
    title: $('title').first().text().trim() || null,
    description: meta('description') || meta('og:description'),
    h1: texts('h1', 5),
    h2: texts('h2', 15),
    og: { title: meta('og:title'), description: meta('og:description'), siteName: meta('og:site_name') },
    org,
    socialLinks,
    hasBlog: /\b(blog|journal|insights|articles)\b/.test(navText),
    feedUrl: feedHref ? abs(feedHref) : null,
    lang: $('html').attr('lang') || null,
  };
  $('script, style, noscript, svg, template').remove();
  result.text = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 20000);
  return result;
}

async function countSitemap(fetcher, baseUrl) {
  try {
    const r = await getText(fetcher, new URL('/sitemap.xml', baseUrl).href);
    if (!r.ok) return null;
    return (r.text.match(/<loc>/g) || []).length;
  } catch {
    return null;
  }
}
