import * as cheerio from 'cheerio';
import { getText } from '../safeFetch.mjs';
import { parseFeed } from '../rss.mjs';
import { platformOf, normalizeUrl, isHttpUrl, BLOCKING_PLATFORMS } from '../../shared/platforms.js';

const BLOCK_STATUS = new Set([401, 403, 429, 999]);
const LOGIN_PATH = /\/(login|accounts\/login|authwall|checkpoint)/i;

export async function collectSocials({ socials = {} }, { fetcher, discovered = [] }) {
  const entered = Object.values(socials).flat().filter(isHttpUrl);
  const seen = new Set();
  const targets = [];
  const add = (url, isDiscovered) => {
    if (!isHttpUrl(url)) return;
    const key = normalizeUrl(url);
    if (seen.has(key)) return;
    seen.add(key);
    targets.push({ url, discovered: isDiscovered });
  };
  entered.forEach((u) => add(u, false));
  discovered.forEach((u) => add(u, true));

  const profiles = await Promise.all(targets.map((t) => checkProfile(t, fetcher)));
  const yt = profiles.find((p) => p.platform === 'youtube' && p.channelId);
  const youtubeVideos = yt ? await youtubeFeed(yt.channelId, fetcher) : [];
  return { source: 'socials', ok: true, data: { profiles: profiles.map(({ channelId, ...p }) => p), youtubeVideos } };
}

async function checkProfile({ url, discovered }, fetcher) {
  const platform = platformOf(url) || 'other';
  const base = { platform, url, discovered, status: null, title: null, description: null, channelId: null };
  try {
    const page = await getText(fetcher, url);
    const walled = BLOCK_STATUS.has(page.status) || LOGIN_PATH.test(new URL(page.finalUrl).pathname);
    if (BLOCKING_PLATFORMS.has(platform) && walled) return { ...base, check: 'unverified', status: page.status };
    if (!page.ok) return { ...base, check: 'unreachable', status: page.status };
    const $ = cheerio.load(page.text);
    const metaContent = (p) => $(`meta[property="${p}"]`).attr('content')?.trim() || null;
    return {
      ...base,
      check: 'reachable',
      status: page.status,
      title: metaContent('og:title') || $('title').first().text().trim() || null,
      description: metaContent('og:description'),
      channelId: platform === 'youtube' ? page.text.match(/"channelId":"(UC[\w-]{22})"/)?.[1] ?? null : null,
    };
  } catch {
    return { ...base, check: BLOCKING_PLATFORMS.has(platform) ? 'unverified' : 'unreachable' };
  }
}

async function youtubeFeed(channelId, fetcher) {
  try {
    const r = await getText(fetcher, `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
    if (!r.ok) return [];
    return parseFeed(r.text).slice(0, 5).map((e) => ({ title: e.title, url: e.link, date: e.date }));
  } catch {
    return [];
  }
}
