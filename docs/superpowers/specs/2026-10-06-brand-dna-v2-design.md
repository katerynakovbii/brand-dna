# Brand DNA v2 — No-token, one-field design

Date: 2026-10-06
Status: Draft for review
Supersedes: hosting, security, workflow, setup and UI sections of `2026-10-06-brand-dna-design.md`. Collectors (§5), analysis (§6) and report schema (§7) of that spec stay as they are unless changed below.

## 1. Why

v1 needed a GitHub fine-grained token, a workflow key pair, repo secrets and ~3 minutes of polling per report. Nobody has completed a run yet: the token step blocked it. v2 removes all of that.

**Success criteria:**
- Open the URL, paste a website, press Enter, see a full report. No account, token or settings.
- Live progress while it runs; report in ~30–60 s (target, to be measured; hard limit 300 s).
- A report is visible only to the browser that ran it, plus anyone given its private share link.
- Zero cost on Vercel Hobby. Optional AI key (~1–5¢ per report).
- Any single data source failing still yields a report with the gap disclosed (unchanged from v1).

## 2. Architecture

One Vercel project, linked to the GitHub repo (auto-deploy on push to `main`). Static frontend + two Node functions. GitHub Pages and GitHub Actions are no longer used.

```
Browser                                       Vercel Functions (Node 24)
───────                                       ──────────────────────────
#/  website field (+ optional details)
POST /api/analyze {website, name?, industry?, socials?, type, parentId?}
                                  ──────────▶ validate
                                              website collector → fills name / industry / socials if missing
                                              socials, news, community, competitors (parallel)
                                              rules analysis (+ AI if ANTHROPIC_API_KEY)
  ◀── NDJSON stream: progress events, then {type:"report"} or {type:"error"}
save report in IndexedDB (local library)
render #/report/<id>

"Share" pressed:
  key = random AES-256; ciphertext = encrypt(report, key)
POST /api/share {id, ciphertext}  ──────────▶ put to Vercel Blob at shares/<id>.enc
link: #/s/<id>?k=<key>   (key never leaves the browser except inside the link fragment)
open link: GET blob URL → decrypt in browser → render (read-only, "Save to my reports")
```

**Stack:** unchanged — plain HTML + ES modules + one CSS file, no build step, no framework. Functions in `api/` using the existing `collector/` and `shared/` modules. New dependency: `@vercel/blob` (server only).

### 2.1 `POST /api/analyze`

- Body: `{ website, name?, industry?, socials?, type: "main"|"competitor", parentId? }`. Max 8 KB.
- Validation (`shared/schema.js`): `website` required and http(s); `name` and `industry` become optional for `type: "main"` (filled from the site). Competitor runs still need `name`.
- `maxDuration: 300`. Each collector keeps its own 15 s fetch timeout.
- Response: `Content-Type: application/x-ndjson`, one JSON object per line:
  - `{"type":"progress","source":"website","state":"done"|"failed"}` — one per collector, as each finishes. Sources: `website, socials, news, community, competitors, analysis`.
  - `{"type":"detected","name":"…","industry":"saas"}` — after the website step, so the UI can show what it inferred.
  - `{"type":"report","report":{…}}` — last line on success (report schema v1 unchanged except `id` is generated server-side by `newReportId()`).
  - `{"type":"error","message":"…"}` — last line on failure; message is user-safe.
- `buildReport` gets an optional `onProgress(source, state)` callback; it is the only change to the pipeline's interface.
- Logs: no brand names, URLs or report content. Only `analyze ok|failed <ms>`.

### 2.2 Auto-detect (website step)

From the homepage already parsed by `collectWebsite`:
- **Name:** first non-empty of JSON-LD Organization `name`, `og:site_name`, `<title>` up to the first separator (`|`, `–`, `-`, `:`), the domain label capitalised (`acme.com` → `Acme`).
- **Industry:** score every `industries.json` entry by keyword hits in title + description + headings; highest score wins if ≥ 2 hits, else `default` ("Other").
- **Socials:** `socialLinks` already discovered by the collector (v1 already feeds these to the socials collector). User-entered socials take precedence per platform.

User-entered `name` / `industry` always win over detected values.

### 2.3 `POST /api/share`

- Body: `{ id, ciphertext }`; `id` must match `REPORT_ID_RE`; ciphertext ≤ 2 MB and must parse as the v1 encrypted-report envelope.
- Writes `shares/<id>.enc` to Vercel Blob (`access: "public"`, `addRandomSuffix: false`, `allowOverwrite: false`). Returns `{ url }`. Same id twice → `409`, and the client reuses its existing link.
- The blob store only ever holds ciphertext; the key exists only in the share link's `#` fragment, which browsers never send to servers.
- Revoking a link is out of scope (see §8).

### 2.4 Abuse limits

- Vercel Firewall rate-limit rule on `/api/*`: 10 requests / hour / IP for `/api/analyze`, 30 / hour / IP for `/api/share`. Configured in the dashboard; documented in README. If the Hobby plan does not allow both rules, `/api/analyze` takes priority.
- UI shows a friendly message on `429`: "Too many analyses from this network — try again in an hour."
- SSRF protection unchanged (`safeFetch` refuses private / reserved addresses, http(s) only, redirect checks).

## 3. Storage

- **Local library → IndexedDB** (`brand-dna` DB, store `reports`, key = report id). Holds full reports, not links. Records: `{ id, name, website, date, type, parentId, status, report, shareUrl? }`.
- Export / Import library as JSON stays (now contains full reports; warning text kept: "Downloaded files are not encrypted").
- v1 data in `localStorage` is ignored; no v1 report was ever produced.

## 4. UI / UX

Same visual direction as v1 (white, accent `#97C4FF`, link colour `#2F6FD0`, Roboto) with a proper system:
- Type scale 14 / 16 / 20 / 28 / 40 px; spacing scale 4 / 8 / 12 / 16 / 24 / 32 / 48; radius 12 px cards, 8 px controls.
- Cards with 1 px `#E6E9EF` border, soft shadow; consistent empty, loading (skeleton) and error states.
- Responsive to 360 px; visible focus rings; works with keyboard only.

**Header:** logo + "My reports" + "New analysis". No Settings.

**Routes:**
1. `#/` **Home** — hero: one large input "Company website" + "Analyze" button; "Add details" toggle reveals name, industry (select + free text) and social URL fields, all optional. Below: "Recent reports" as cards (brand, domain, date, touchpoint score, mention count) with open / share / remove actions; empty state explains what a report contains.
2. **Running state** (same page, replaces the form) — brand detected line ("Analyzing **Acme** · SaaS"), checklist of the six sources ticking live (✓ / ✕ / spinner), elapsed time, Cancel. On finish → navigate to the report. On error → message + "Try again" with the inputs kept.
3. `#/report/<id>` — summary card first: brand, domain, date, positioning one-liner, touchpoint score ring, mentions 30-day count, AI/rules badge. Sticky section nav: Positioning · Touchpoints · Mentions · Competitors · Sources. Actions: Share (creates link, copies it, shows "Link copied"), Download (PDF / JSON / CSV menu).
4. Competitors section — 5 cards; each has "Analyze" (runs a competitor analysis inline with the same live checklist) and, once done, "Compare".
5. `#/compare/<a>/<b>` — two columns aligned by row (positioning, touchpoint score, mentions per window, top phrases), differences highlighted; both reports from the local library.
6. `#/s/<id>?k=<key>` — shared report, read-only, banner "Shared report · Save to my reports". Bad/missing key or missing blob → "This link is incomplete or has expired."

Removed: `#/settings`, `#/new` (merged into Home), token banners, "running jobs" polling list.

## 5. Removed from v1

`.github/workflows/analyze.yml`, `collector/job.mjs`, `collector/fail.mjs`, `collector/run.mjs` CI mode (keep `--dry` local CLI), `scripts/setup.mjs`, `scripts/commit-report.sh`, `keys/`, `reports/`, `assets/js/github.js`, `assets/js/views/settings.js`, workflow key-pair functions in `shared/crypto.js` (`generateWorkflowKeyPair`, `encryptForWorkflow`, `decryptFromBrowser`), `.nojekyll`, the `WORKFLOW_PRIVATE_KEY` repo secret, GitHub Pages. Their tests go with them.

## 6. Error handling

| Case | Behaviour |
|---|---|
| Invalid input | 400 with field errors; shown under the fields |
| Website unreachable | report still built; name falls back to domain; source marked failed |
| Collector fails / times out | `ok:false` + reason; footer lists it (unchanged) |
| AI missing / fails | rules mode with `modeReason` (unchanged) |
| Function hits 300 s | stream ends without `report` → UI: "The analysis took too long. Try again." |
| Network drops mid-stream | same as above |
| 429 from firewall | friendly rate-limit message |
| Share upload fails | toast "Couldn't create a link — try again"; report stays local |
| Shared link bad key / missing blob | "This link is incomplete or has expired." |
| IndexedDB unavailable (private mode) | report still shown; banner "This browser can't save reports — use Download or Share." |

## 7. Testing

`node --test`, TDD, no network.
- API: `/api/analyze` handler with injected collectors — progress order, `detected` event, final report, 400 on bad input, error line on pipeline crash, body size limit. `/api/share` with an in-memory blob stub — id validation, size limit, 409 on duplicate.
- Auto-detect: name and industry inference against fixtures.
- Library: IndexedDB wrapper via `fake-indexeddb` (dev dependency) — add, list, remove, export / import.
- Stream client: NDJSON parser handles split chunks, trailing partial line, missing final event.
- Views: home form, running checklist, report summary card, share flow, shared-link view — existing DOM test style.
- Existing collector / analysis / crypto (report encryption) tests stay.
- Manual end-to-end on the deployed URL: one main analysis, one competitor + compare, one share link opened in a private window.

## 8. Out of scope

Accounts / login, revoking or expiring share links, scheduled monitoring, historical trends, paid data APIs, dark mode.

## 9. Setup (README)

1. Import the GitHub repo in Vercel (framework preset: Other, no build command, output = repo root).
2. Storage → create a Blob store and connect it to the project (adds `BLOB_READ_WRITE_TOKEN`).
3. Optional: add `ANTHROPIC_API_KEY` env var.
4. Firewall → add the rate-limit rules from §2.4.
5. Open the deployment URL.
