// Actions shared by report cards and the report page.
import { toast } from '../components/ui.js';
import { reportJson, mentionsCsv, fileName, downloadText } from '../export.js';

export async function shareEntry(entry, ctx) {
  let url = entry.shareUrl;
  if (!url) {
    try {
      url = await ctx.createShareLink(entry.report);
    } catch {
      toast("Couldn't create a link — try again", ctx.toastHost);
      return null;
    }
    entry.shareUrl = url;
    await ctx.library.setShareUrl(entry.id, url).catch(() => {});
  }
  try {
    await ctx.copy(url);
    toast('Link copied', ctx.toastHost);
  } catch {
    toast(`Private link: ${url}`, ctx.toastHost, { ms: 10000 });
  }
  return url;
}

export const downloadItems = (report) => [
  { label: 'PDF (print)', onClick: () => globalThis.print?.() },
  { label: 'JSON', onClick: () => downloadText(reportJson(report), fileName(report, 'json'), 'application/json') },
  { label: 'CSV (mentions)', onClick: () => downloadText(mentionsCsv(report), fileName(report, 'csv'), 'text/csv') },
];
