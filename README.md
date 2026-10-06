# Brand DNA

See how a brand shows up online — positioning, owned touchpoints, mentions in the last 7/30/60 days, and likely competitors — then compare it side by side with a competitor. Runs free on GitHub Pages + GitHub Actions.

Reports are **encrypted**. The repository is public, but each report can only be read with its private link (`…/#/report/<id>?k=<key>`). The key part of the link never leaves your browser.

## Setup (once, ~10 minutes)

1. **Create a public repository** from this code and push it. In *Settings → Pages*, deploy from branch `main`, folder `/ (root)`.
2. **Generate the workflow key pair** (Node 24+):
   ```bash
   node scripts/setup.mjs
   ```
   This writes `keys/workflow-public.jwk` and prints a private key between `BEGIN/END WORKFLOW_PRIVATE_KEY` lines.
3. **Add repository secrets** (*Settings → Secrets and variables → Actions*):
   - `WORKFLOW_PRIVATE_KEY` — the printed private key JSON (one line).
   - `ANTHROPIC_API_KEY` — optional. Enables AI analysis (Claude Haiku, about 1–5¢ per report). Without it, rules-based analysis is used.
4. **Commit the public key**: `git add keys/workflow-public.jwk && git commit -m "add workflow key" && git push`.
5. **Create a fine-grained personal access token** at <https://github.com/settings/personal-access-tokens/new>: *Only select repositories* → this repo; permissions **Actions: Read and write**, **Contents: Read-only**.
6. **Open your Pages URL** (`https://<you>.github.io/<repo>/`) → *Settings* → paste the token → *Test token*.

Lost the private key? Run `node scripts/setup.mjs --force`, update the secret and commit the new public key. Old reports stay readable (their keys are in their links).

## Using it

- **New analysis** → fill in name, website, industry and any social links → *Run analysis*. The report appears in about 2 minutes.
- **Copy private link** to share a report. Anyone with the link can read it; nobody without it can.
- **Compare** next to a competitor runs a full analysis of that competitor and opens a side-by-side view.
- **Downloads:** PDF (print dialog → *Save as PDF*), JSON (full report) and CSV (mentions). Downloaded files are not encrypted.
- **My reports** lives in this browser only. Use *Export list* for a backup; *Import list* on another device.

## What's collected

| Area | Sources |
|---|---|
| Positioning | Your homepage (title, headings, meta, structured data); optional Claude analysis |
| Touchpoints | Links on your site + the profiles you enter; checked for reachability. Instagram, LinkedIn, X, Facebook and TikTok block automated checks, so their links show as *Unverified* |
| Mentions | Google News RSS (max 100 per query → shown as `100+`), Bing News RSS, Hacker News, Reddit |
| Competitors | Co-mentions in Google News and DuckDuckGo results for "alternatives" / "vs" searches |

Any source that fails is listed in the report's *Data sources* section; the rest of the report still works.

## Privacy model

- Inputs are encrypted in the browser to the workflow's public key; Actions logs show only ciphertext and a random id.
- Reports are encrypted with a random per-report key that exists only in the private link and your browser's list.
- File names and commit messages contain only the random id.
- Accepted limits: anyone with a link can read that report; a leaked token lets someone start runs (revoke it on GitHub); encrypted files stay in git history; the collector checks that fetched hosts resolve to public addresses, but a DNS-rebinding attacker could still race that check (low risk: runs on a throwaway Actions runner).

## Local development

```bash
npm ci
npm test                                   # unit tests, no network
node collector/run.mjs --dry --name "Acme" --website acme.com --industry saas
python3 -m http.server 8080                # then open http://localhost:8080
```

For local or custom-domain hosting, set `REPO_OVERRIDE` in `assets/js/config.js` to `{ owner: '<you>', repo: '<repo>' }`.
