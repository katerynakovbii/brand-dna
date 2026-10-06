# Brand DNA — Design Spec

Date: 2026-10-06
Status: Draft for review

## 1. Purpose

A password-protected web app, hosted free on GitHub Pages, that analyzes how a brand appears online and identifies its competitors.

**Inputs:** company name, website, industry, social profile URLs.

**Outputs (a "report"):**
- Positioning — what the brand says it is, to whom, how it differs, tone of voice.
- Touchpoints — which owned channels exist, are live, are linked, are missing.
- Mentions — count and list of online mentions in the last 7, 30 and 60 days.
- Competitors — top 5 likely competitors inferred from online presence, each with an on-demand full analysis and side-by-side comparison.
- Downloadable as PDF, JSON and CSV.

**Users:** the owner and a small team sharing one set of credentials. Not a public SaaS. Reports are generated on demand; no scheduled monitoring in v1.

**Success criteria:**
- A user logs in, submits a brand, and sees a complete report within ~3 minutes.
- Without the password, nobody can read reports or trigger analyses, even with full access to the public repo.
- Runs at zero cost (AI step optional, ~1–5¢ per report when enabled).
- Any single data source failing still yields a report with the gap disclosed.

## 2. Constraints

- **Static hosting only (GitHub Pages).** No server. Browser cannot scrape third-party sites (CORS).
- **Free GitHub plan ⇒ public repo.** Everything committed is world-readable, so all sensitive data must be encrypted at rest.
- **Free data sources.** No paid APIs required. Optional AI key.

## 3. Architecture

Two halves sharing one crypto module:

```
Browser (GitHub Pages)                      GitHub Actions (Node 24)
──────────────────────                      ────────────────────────
login: user+pass → AES key
  decrypt token.enc → GitHub PAT (memory only)
form: name, site, socials, industry
  encrypt payload ───── workflow_dispatch ──▶ analyze.yml
                         (input: ciphertext)     decrypt w/ secret BRAND_PASSPHRASE
                                                 collectors (parallel)
                                                 analyzer: rules → (+AI if key)
                                                 encrypt → reports/<id>.enc
                                                 update reports/index.enc, commit
poll reports/index.enc (contents API) ◀── committed to main
decrypt → render report
"Compare" → dispatch competitor run → compare view
```

**Stack:** plain HTML + ES modules + one CSS file, no build step, no framework. Collector: Node 24, minimal deps (`cheerio` for HTML parsing, `fast-xml-parser` for RSS). Tests: `node --test`.

### 3.1 Repo layout

```
index.html                 app shell
assets/
  app.css                  styles (incl. print stylesheet)
  js/
    main.js                router + bootstrap
    auth.js                login, session key, token unlock
    github.js              workflow dispatch, fetch encrypted files
    views/                 login.js, dashboard.js, new.js, report.js, compare.js
    components/            cards, sparkline (SVG), score ring (SVG)
    export.js              JSON / CSV / print-PDF
shared/
  crypto.js                PBKDF2 + AES-GCM; runs in browser and Node
  schema.js                report shape + validators
collector/
  run.mjs                  entrypoint (decrypt input → collect → analyze → encrypt → write)
  collectors/              website.mjs, socials.mjs, news.mjs, community.mjs, competitors.mjs
  analyze/                 dedupe.mjs, windows.mjs, touchpoints.mjs, positioning.mjs,
                           competitors.mjs, ai.mjs
  safeFetch.mjs            timeout, UA, private-IP block, http(s) only
  industries.json          industry → keywords, expected touchpoints
scripts/
  setup.mjs                one-time: creates token.enc
token.enc                  encrypted GitHub PAT
reports/
  index.enc                encrypted list of reports
  <id>.enc                 encrypted report
.github/workflows/analyze.yml
test/                      unit tests + fixtures
```

## 4. Security model

- **Key derivation:** `key = PBKDF2-SHA256(password, salt = "brand-dna:" + username, 600 000 iterations) → AES-256-GCM`. Username acts as part of the salt; each encrypted blob additionally has a random 16-byte salt and 12-byte IV, stored as `{v:1, salt, iv, ct}` (base64) JSON.
- **Passphrase string** used everywhere = `username + ":" + password`. The same string is stored as the GitHub secret `BRAND_PASSPHRASE`.
- **token.enc:** fine-grained PAT scoped to this repo only, permissions `Actions: read & write` (dispatch, run status) and `Contents: read` (fetch encrypted reports via API). Created by `scripts/setup.mjs`.
- **Login:** success = `token.enc` decrypts. Wrong credentials → AES-GCM auth failure → "Invalid credentials". Derived key held in `sessionStorage` (exported raw key) so closing the tab logs out; PAT only in memory, re-derived on reload from the session key.
- **Workflow inputs are encrypted** (inputs appear in Actions logs). The workflow never logs decrypted input.
- **Reports at rest** are encrypted with the passphrase. Repo visitors see only ciphertext and timestamps.
- **Rotating password:** change secret, re-run `setup.mjs`. Old reports remain encrypted under the old passphrase; `setup.mjs --reencrypt <old>` re-encrypts them.
- **Downloads are plaintext** by design; UI notes this.

## 5. Collectors

Common interface: `collect(input) → Promise<{source, ok, data, error?}>`. Every network call goes through `safeFetch` (15 s timeout, browser-like UA, http/https only, rejects private/loopback IPs). Failures never throw past the collector.

| Collector | Gathers | Method |
|---|---|---|
| website | title, meta description, H1/H2s, Open Graph, schema.org Organization, outbound social links, sitemap URL count, blog/RSS presence, `lang` | fetch + cheerio; `/sitemap.xml`, `/robots.txt` |
| socials | per provided URL: reachable (status), OG title/description; YouTube latest videos via channel RSS | fetch + OG parse |
| news | dated mentions from Google News RSS (`"<name>" when:60d`) and Bing News RSS (`"<name>"`) | RSS parse |
| community | Hacker News stories/comments via Algolia API (`numericFilters=created_at_i>…`); Reddit `search.json?t=…` | JSON APIs |
| competitors | results for `"<name>" alternatives`, `"<name>" vs`, `<industry> companies like <name>` via Google News RSS and DuckDuckGo HTML; candidate brand names extracted | fetch + extraction (rules or AI) |

**Known limits (shown in report footer):** Instagram, LinkedIn, X, TikTok mostly block bots → usually only reachability is known (no follower counts/posts). Reddit often blocks cloud IPs → best effort. Google News RSS caps ~100 items/query → large brands display "100+".

## 6. Analysis

- **Dedupe:** by normalized URL, then by title similarity (token Jaccard ≥ 0.8).
- **Windows:** mentions bucketed into 7 / 30 / 60 days relative to run time. Per window: total, per-source counts, top 10 headlines (newest first), weekly counts for sparkline. If any source hit its cap, total is marked `capped: true` → "100+".
- **Touchpoints:** checklist of website, blog, newsletter/RSS, each social platform. Status per item: `live` (entered + reachable), `found` (discovered on site, not entered — and reachable), `broken` (entered or linked but unreachable), `missing` (expected for industry, absent). Score = live+found / expected (from `industries.json`, default set if unknown industry), shown 0–100.
- **Positioning — rules mode:** value proposition = best of H1 / title / meta description; top 10 phrases via TF-IDF over site text vs. a generic background corpus; matched archetype tags from keyword lists (price-led, premium, enterprise/B2B, consumer, sustainability, innovation, community).
- **Positioning — AI mode:** enabled when `ANTHROPIC_API_KEY` secret exists. Model `claude-haiku-4-5-20251001` for cost. One call with collected data (truncated to budget) → JSON validated against schema: `statement, audience, differentiators[], tone, siteSocialConsistency, newsSentiment`. Invalid/failed → rules mode, with reason recorded.
- **Competitors:** candidates scored by co-occurrence frequency with the brand × industry keyword overlap; own brand and generic words excluded; top 5. AI mode re-ranks and adds `reason` and `website` per competitor. Rules mode `website` is a best guess from result links, may be empty.

## 7. Report schema (summary)

```json
{
  "v": 1, "id": "2026-10-06T10-12-00Z-acme", "type": "main|competitor",
  "parentId": null, "createdAt": "...", "status": "ok|failed", "error": null,
  "mode": "ai|rules", "modeReason": "...",
  "input": { "name", "website", "industry", "socials": { "instagram": "...", ... } },
  "positioning": { "statement", "audience", "differentiators", "tone", "phrases", "tags" },
  "touchpoints": { "score", "items": [{ "kind", "url", "status" }] },
  "mentions": { "d7": {...}, "d30": {...}, "d60": {...}, "items": [{ "date", "source", "title", "url" }] },
  "competitors": [{ "name", "website", "reason", "mentions30" }],
  "sources": [{ "source", "ok", "error" }]
}
```

`reports/index.enc` decrypts to `[{ id, name, type, parentId, createdAt, status }]`.

## 8. Workflow (`analyze.yml`)

- Trigger: `workflow_dispatch` with inputs `payload` (ciphertext) and `requestId`.
- `concurrency: brand-dna-commit` (queued, not cancelled).
- Steps: checkout → setup Node 24 → `npm ci` → `node collector/run.mjs` → commit `reports/` with pull-rebase-retry (3 attempts).
- `if: failure()` step writes an encrypted `{status:"failed", error}` report for `requestId` so the UI stops waiting.
- `permissions: contents: write`.
- Pages deploy from `main` branch root (classic Pages) serves the app only. Reports are read by the browser through the GitHub contents API (`GET /repos/{owner}/{repo}/contents/reports/...`, `Accept: application/vnd.github.raw`) with the PAT — avoids Pages' ~10 min CDN cache and rebuild delay.

## 9. UI

**Visual design:** light mode only. Font **Roboto** (Google Fonts, weights 400/500/700; fallback `system-ui, sans-serif`). Primary color **#97C4FF** used for buttons, accents, chart fills, active states, score ring. Because #97C4FF is light, text placed on it is dark (`#0B1F3A`); links and text accents use a darker derived shade (`#2F6FD0`) for contrast ≥ 4.5:1. Neutral off-white background, white cards, subtle borders. Responsive down to ~400 px.

**Routes (hash-based):**
1. `#/login` — username + password. Error: "Invalid credentials".
2. `#/` dashboard — past reports (brand, date, type, status), running jobs with spinner, "New analysis" button, Logout.
3. `#/new` — name\*, website\*, industry\* (select + free text), social URLs (Instagram, LinkedIn, X, Facebook, TikTok, YouTube, other). Client-side URL validation. Submit → dispatch → "Running… ~2 min" card; polls index every 15 s, timeout 10 min, then shows link to Actions runs.
4. `#/report/<id>` — header (brand, site, date, mode badge, download buttons); Positioning card; Touchpoints card (score ring + checklist); Mentions card (7/30/60 toggle, big number, per-source counts, sparkline, headlines); Competitors card (5 rows + Compare); Data sources footer (status + limits).
5. `#/compare/<a>/<b>` — two columns, aligned rows: positioning, touchpoint score, mentions per window, top phrases; differences highlighted. Download buttons.

**Compare flow:** Compare on competitor → if a competitor report for that name + parent exists, open it; else dispatch run with `{name, website, industry: parent's}` and `type: competitor`, show running state, then open compare.

**Downloads:**
- PDF: print stylesheet (hide nav/buttons, cards avoid page breaks) + `window.print()`.
- JSON: full decrypted report as Blob.
- CSV: mentions (`date,source,title,url`), RFC 4180 quoting.
- Note beside buttons: "Downloaded files are not encrypted."

## 10. Error handling

| Case | Behavior |
|---|---|
| Collector fails/timeout/blocked | `ok:false` + reason; report still built; footer lists it |
| AI missing/fails/invalid JSON | rules mode, `modeReason` set |
| Workflow crashes | failure step writes encrypted failed report; UI shows error + Actions link |
| PAT rejected (401/403) | "GitHub token rejected — re-run setup" |
| Wrong `BRAND_PASSPHRASE` secret | decrypt fails → clear Actions log error, no report; UI times out with Actions link |
| Invalid inputs | validated in browser and in workflow; http(s) only; private IPs refused |
| Concurrent runs | concurrency group + pull-rebase-retry |

## 11. Testing

`node --test`, TDD.
- crypto: browser-format ↔ Node round-trip, wrong password rejects, tampered ciphertext rejects.
- each collector: against saved HTML/RSS/JSON fixtures; no network in tests (`safeFetch` injectable).
- analyzer: dedupe, window bucketing, cap flag, touchpoint statuses/score, competitor ranking, AI response validation + fallback (mocked client).
- frontend pure modules: formatters, CSV export, view-model builders.
- safeFetch: rejects private IPs and non-http schemes.
- Manual e2e: `node collector/run.mjs --dry --name ... --website ...` prints plaintext report locally.

## 12. Setup (README)

1. Fork/create repo (public), enable Pages from `main` / root.
2. Create fine-grained PAT: this repo only, Actions read & write, Contents read.
3. `node scripts/setup.mjs` → prompts username, password, PAT → writes `token.enc`; prints value for `BRAND_PASSPHRASE`.
4. Add secrets `BRAND_PASSPHRASE` and optional `ANTHROPIC_API_KEY`.
5. Commit `token.enc`, push. Open the Pages URL.

## 13. Out of scope (v1)

Scheduled monitoring, multiple user accounts, follower counts for blocked platforms, sentiment in rules mode, historical trend across reports, paid data APIs.
