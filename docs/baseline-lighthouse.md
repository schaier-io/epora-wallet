# Lighthouse baseline measurements

This report records the first Lighthouse baseline for the trimmed routes (issue #410).
Its tables are a snapshot. They do not predict field data and they are not a target.

VERIFIED on 2026-09-19. Baseline commit: `fc1a4862`.
The `/payee` row was re-measured on 2026-09-19 after the issue #502 fix; see the
"#502 update" section. The other rows are unchanged from the #410 snapshot.

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
| `/payee` | 54 | 5.1 s | 2,110 ms | 0.000 | 1.1 s | 1.2 s |
| `/setup` | 62 | 4.9 s | 863 ms | 0.037 | 1.1 s | 1.2 s |

The LCP element in every run's report:

| Route | LCP element |
| --- | --- |
| `/` | risk-disclaimer paragraph (`div#risk-disclaimer-body > p`) |
| `/user` | risk-disclaimer paragraph (`div#risk-disclaimer-body > p`) |
| `/user/proposals` | risk-disclaimer paragraph (`div#risk-disclaimer-body > p`) |
| `/payee` | content note paragraph (`p.text-sm`, "Payments other wallets send to you a little at a time...") |
| `/setup` | risk-disclaimer paragraph (`div#risk-disclaimer-body > p`) |

## Run spread

VERIFIED: per-run LCP and performance score, run 1 to run 3.

| Route | Run 1 | Run 2 | Run 3 |
| --- | ---: | ---: | ---: |
| `/` | 4.0 s, 59 | 4.0 s, 59 | 5.0 s, 53 |
| `/user` | 5.2 s, 52 | 4.0 s, 59 | 4.0 s, 59 |
| `/user/proposals` | 4.9 s, 62 | 4.0 s, 67 | 4.0 s, 67 |
| `/payee` | 4.9 s, 54 | 5.1 s, 54 | 6.1 s, 50 |
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
| `/payee` | 899,939 | 879 KB |
| `/setup` | 897,240 | 876 KB |

The `/payee` byte count is from the build after the issue #502 fix; the card header and
loading fallback joined the route's first-load graph (+2,649 decoded bytes). The other four
counts are from the #410 build. After the fix, four of the five routes measure within 202
decoded bytes of each other and `/payee` sits 2,497 bytes above `/user`. These are decoded
sizes; the serving layer may compress them.

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
- The `/payee` LCP of about 14.5 s repeated in all 3 runs of the #410 pass and was far
  above the other routes. Issue #502 investigated it, found the cause in our code, and
  fixed it; see the "#502 update" section below.
- Scores come from `--only-categories=performance`, so they are the performance
  category score only.

## #502 update (2026-09-19)

VERIFIED: all numbers in this section come from the saved Lighthouse JSON reports in
`/tmp/lighthouse-i502/` (3 before runs, 3 after runs, 1 proposals cross-check before and
1 after, 1 after run with `--save-assets` for the trace), on the same hardware and Brave
setup as the method above.

### Cause

The `/payee` LCP element was the card's note paragraph ("Payments other wallets send to
you a little at a time...", `CardDescription`). That paragraph rendered only inside
`PayeeView`, and `PayeeView` loaded behind a client-only dynamic import
(`ssr: false`, `src/components/payee/lazy-payee-view.tsx`). The server HTML held only a
spinner and a skeleton, so the paragraph did not exist until the import resolved. That
import's chunk chain (`react-loadable-manifest` for the page) totals 7,407,316 decoded
bytes, 1,866,617 gzipped, dominated by the `@meshsdk/core` serialisation chunk
(5,857,940 decoded bytes). Under the simulated slow 4G the model puts the chunk download
and hydration work about 13 s past first paint, and the paragraph painted then: LCP
14.53, 14.64, 15.05 s at scores 47, 47, 46. Sibling routes keep their LCP on the
risk-disclaimer paragraph, which paints at hydration (~4 s) and never sees a larger
element, because their late-rendering views paint nothing bigger than it.

### Fix

The header (heading plus note paragraph) is static text and does not belong behind the
chunk. `PayeeCardHeader` (`src/components/payee/payee-card-header.tsx`) now holds it, and
`PayeeCardFallback` (`src/components/payee/payee-card-fallback.tsx`) renders the card
shell with that header in both loading states: the server-rendered Suspense fallback
(`src/app/payee/page.tsx`) and the dynamic import's client loading fallback
(`src/components/payee/lazy-payee-view.tsx`). `PayeeView` reuses the same header
component and adds the refresh control. The note paragraph now paints with the server
HTML (verified in the served HTML). React replaces the fallback's nodes at hydration and
again when the view mounts, but the replacement is the same card shell with the same
text, and at the mobile viewport this baseline measures the refresh control wraps below
the header text, so the paragraph's rect stays essentially the same across the swaps
(346 x 100 px in the before-fix report's node record, 344 x 98 px / 33,712 px² in the
after-fix trace, a difference of about 2 percent). The metric
therefore follows the hydration-painted copy of the paragraph. First-load JS for
`/payee` grew by 2,649 decoded bytes to carry the header module.

### Result

`/payee`, 3 runs after the fix: LCP 4.89, 5.10, 6.08 s; scores 54, 54, 50. The LCP
element is still the note paragraph (largest candidate in the trace at 33,712 px², above
the risk-disclaimer paragraph at 29,240 px²), but it now paints from the loading shell at
hydration instead of after the chunk, which is the same mechanism that sets the sibling
routes' LCP. A same-session cross-check run on `/user/proposals` read LCP 4.87 s,
score 62 (before the fix it read 3.99 s, 65 and 4.88 s, 61), so the sibling band is
unchanged and `/payee` now sits in it. The per-run overlap is direct: after-run 1 read
4.89 s against the proposals cross-check's 4.87 s, and the slowest after-run (6.08 s)
was also the run with the suite's highest TBT, a spread the other routes show too.

What the fix does not change: the interactive view still requires the multi-megabyte
chunk, so the time until the real payment list can render is untouched. The improvement
is that the page identifies itself and paints its largest text immediately instead of
showing a bare skeleton for that whole window.

## Raw reports

The 16 Lighthouse JSON reports (15 matrix runs plus the discarded smoke run) were kept
out of git, in `/tmp/lighthouse-i410c/`. `/tmp` does not survive a reboot.
