# Brand DNA

Paste a company website and get its positioning, owned channels, mentions over the last 7/30/60 days and likely competitors in about a minute. Then analyze a competitor and compare the two side by side.

No sign-up, no tokens. Reports are saved in your browser. **Share** creates a private link: the report is encrypted in your browser, and the key lives only in the link.

## Deploy (once, ~5 minutes)

1. Import this GitHub repo in [Vercel](https://vercel.com/new). Framework preset **Other**, no build command, output directory = repo root.
2. **Storage → Create → Blob**, connect it to the project (adds `BLOB_READ_WRITE_TOKEN`). Needed for share links only.
3. Optional: add the `ANTHROPIC_API_KEY` environment variable. It enables AI analysis (Claude Haiku, about 1–5¢ per report). Without it, rules-based analysis is used.
4. **Firewall → Rules → Rate limit**:
   - `/api/analyze`: 10 requests per hour per IP.
   - `/api/share`: 30 requests per hour per IP. If your plan allows only one rule, keep the analyze one.
5. Redeploy, then open the deployment URL.

Every push to `main` deploys automatically.

## Using it

- **Home:** paste a website and press *Analyze*. Name, industry and social profiles are detected from the site. *Add details* lets you set them yourself.
- **Report:** jump between sections, *Share* (copies a private link), *Download* (PDF, JSON, CSV).
- **Competitors:** *Analyze* next to a competitor runs it in place, then *Compare* opens a side-by-side view.
- **My reports:** everything saved in this browser. *Export* makes a backup file; *Import* restores it on another device. Downloaded files are not encrypted.

## What's collected

| Area | Sources |
|---|---|
| Positioning | Homepage (title, headings, meta, structured data); optional Claude analysis |
| Touchpoints | Links on the site + any profiles you enter, checked for reachability. Instagram, LinkedIn, X, Facebook and TikTok block automated checks, so they show as *Unverified* |
| Mentions | Google News RSS (max 100 per query → `100+`), Bing News RSS, Hacker News, Reddit |
| Competitors | Co-mentions in Google News and DuckDuckGo "alternatives" / "vs" searches |

A source that fails is listed in the report's *Data sources* section; the rest of the report still works.

## Privacy

- Analysis inputs go to the `/api/analyze` function and are not stored. Logs contain only `analyze ok|failed <ms>`.
- Reports are stored in your browser (IndexedDB).
- Share links: the browser encrypts the report (AES-256-GCM) with a random key and uploads only ciphertext to Vercel Blob. The key is in the link's `#` fragment, which browsers never send to servers. Anyone with the link can read the report; links cannot be revoked yet.
- The collector refuses private and reserved addresses (SSRF protection).

## Local development

```bash
npm ci
npm test                                                  # unit tests, no network
node collector/run.mjs --website acme.com                 # print one report as JSON
npx vercel dev                                            # app + functions on localhost
```
