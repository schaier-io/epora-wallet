# Lighthouse baseline measurements

This report records the first Lighthouse baseline for the trimmed routes (issue #410).
Its tables are a snapshot. They do not predict field data and they are not a target.

VERIFIED on 2026-09-19. Baseline commit: `fc1a4862`.

## Method

VERIFIED: all five routes were measured against a local production build.

- Build: `pnpm build` in `code/dApp` (Next.js 16.3.5, Turbopack), served with `next start` on `localhost:3000`.
- Tool: `npx lighthouse@latest`, Lighthouse 13.5.0, `--only-categories=performance`.
- Browser: Google Chrome is not installed on this machine. The runs drove
  Brave Browser 152.1.94.121 (Chromium 152) headless through `CHROME_PATH`.
- Device preset: Lighthouse mobile default. `--formFactor=mobile`,
  `--screenEmulation.mobile`, `--throttling-method=simulate`. The emulated device is a
  Moto G Power (2022), Android 11, slow 4G (host user agent: HeadlessChrome/152.0.0.0).
- Runs: 3 runs per route, one after the other, plus one discarded smoke run on `/`.
  The table reports the median of the 3 runs. Per-run values are in the next section.

## Results (median of 3 runs)

VERIFIED: values come from the saved Lighthouse JSON reports (location below).

| Route | Performance score | LCP | TBT | CLS | FCP | Speed Index |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `/` | 59 | 4.0 s | 2,209 ms | 0.018 | 1.2 s | 1.4 s |
| `/user` | 59 | 4.0 s | 2,245 ms | 0.018 | 1.2 s | 1.3 s |
| `/user/proposals` | 67 | 4.0 s | 901 ms | 0.000 | 1.1 s | 1.1 s |
| `/payee` | 47 | 14.5 s | 2,165 ms | 0.000 | 1.1 s | 1.1 s |
| `/setup` | 62 | 4.9 s | 863 ms | 0.037 | 1.1 s | 1.2 s |

The LCP element in every run's report:

| Route | LCP element |
| --- | --- |
| `/` | risk-disclaimer paragraph (`div#risk-disclaimer-body > p`) |
| `/user` | risk-disclaimer paragraph (`div#risk-disclaimer-body > p`) |
| `/user/proposals` | risk-disclaimer paragraph (`div#risk-disclaimer-body > p`) |
| `/payee` | content paragraph (`p.text-sm`, "Payments other wallets send to you a little at a time...") |
| `/setup` | risk-disclaimer paragraph (`div#risk-disclaimer-body > p`) |

## Run spread

VERIFIED: per-run LCP and performance score, run 1 to run 3.

| Route | Run 1 | Run 2 | Run 3 |
| --- | ---: | ---: | ---: |
| `/` | 4.0 s, 59 | 4.0 s, 59 | 5.0 s, 53 |
| `/user` | 5.2 s, 52 | 4.0 s, 59 | 4.0 s, 59 |
| `/user/proposals` | 4.9 s, 62 | 4.0 s, 67 | 4.0 s, 67 |
| `/payee` | 14.5 s, 47 | 14.4 s, 47 | 14.5 s, 47 |
| `/setup` | 5.8 s, 60 | 4.9 s, 62 | 4.9 s, 62 |

TBT was more stable than LCP. Route medians sit between 863 ms and 2,245 ms.

## First-load JavaScript

VERIFIED evidence: `node scripts/check-bundle-budget.mjs` after the build.
It reads `.next/diagnostics/route-bundle-stats.json` and prints decoded (uncompressed)
first-load JS per route. The budget script checks a sixth route (/_not-found) that the table below does not list. Output: `Bundle budget OK: 6 routes checked`.

| Route | First-load JS (bytes) | First-load JS |
| --- | ---: | ---: |
| `/` | 897,442 | 876 KB |
| `/user` | 897,442 | 876 KB |
| `/user/proposals` | 897,308 | 876 KB |
| `/payee` | 897,290 | 876 KB |
| `/setup` | 897,240 | 876 KB |

All five routes measure within 202 decoded bytes of each other (897,240 to 897,442).
The near-identical sizes indicate one shared client entry. These are decoded sizes;
the serving layer may compress them.

## Caveats

- Local hardware, no CDN. The server ran on the same Apple Silicon Mac that drove the
  browser, over loopback. Lighthouse's simulated throttling models a slow 4G mobile
  network and a slower CPU on top of that fast local run, but a real deployment adds
  network, CDN, and server latency that this setup cannot see.
  The host benchmark index was 4262 to 4372 across the 16 runs.
- Brave, not Chrome. No Google Chrome install exists on this machine. Brave is
  Chromium 152 and Lighthouse drove it headless, but it is not the stock Chrome binary.
- LCP here measures the shell, not wallet data. All five routes are dynamic
  (server-rendered on demand). The runs had no authenticated session and no interaction.
  On four routes the largest paint is the fixed risk-disclaimer text, so LCP reflects
  when the shell painted, not when account data views rendered. The routes behind
  dynamic boundaries render skeletons first; what hydration adds after the measured
  window is not part of these numbers.
- The `/payee` LCP of about 14.5 s repeated in all 3 runs and is far above the other
  routes. This pass records it and does not explain it. It was not investigated.
- Scores come from `--only-categories=performance`, so they are the performance
  category score only.

## Raw reports

The 16 Lighthouse JSON reports (15 matrix runs plus the discarded smoke run) were kept
out of git, in `/tmp/lighthouse-i410c/`. `/tmp` does not survive a reboot.
