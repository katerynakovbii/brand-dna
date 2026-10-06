import { XMLParser } from 'fast-xml-parser';

// parseTagValue:false keeps titles like "2024" or "1e5" as strings.
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text', parseTagValue: false });
const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const text = (v) => (v == null ? '' : typeof v === 'object' ? String(v['#text'] ?? '') : String(v)).trim();

export function stripHtml(s) {
  return String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function toIso(s) {
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export function parseFeed(xml) {
  let doc;
  try {
    doc = parser.parse(xml);
  } catch {
    return [];
  }
  if (doc.rss) {
    return arr(doc.rss.channel?.item).map((i) => ({
      title: stripHtml(text(i.title)),
      link: text(i.link),
      date: toIso(text(i.pubDate)),
      source: text(i.source) || null,
      description: stripHtml(text(i.description)),
    }));
  }
  if (doc.feed) {
    return arr(doc.feed.entry).map((e) => ({
      title: stripHtml(text(e.title)),
      link: arr(e.link).find((l) => !l['@_rel'] || l['@_rel'] === 'alternate')?.['@_href'] ?? '',
      date: toIso(text(e.published || e.updated)),
      source: null,
      description: stripHtml(text(e['media:group']?.['media:description'] ?? e.summary)),
    }));
  }
  return [];
}
