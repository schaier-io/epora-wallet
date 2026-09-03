# E2E Test Findings — Epora Wallet (dev build)

**Date:** 2026-09-02 · **Surface:** localhost:3100 (dev, includes merged PRs #91–#104) · **Network:** preprod
**Wallet:** "Audit wallet" (STT unit `67c11430…93c` + `a3937f21…fac`) · **Signer:** eternl wallet "test (#0)"

## Verified working

- Flow 1 create, 2 add-funds, 3 send, 4 tidy, 5 co-signer threshold (earlier sessions).
- **Flow 8 scheduled payments:** create 5 ₳/day payment → on-chain state forward verified
  (datum round-trips: name, payee, start/stop all exact). Accrual proration is exact
  (due 0.03125 ₳ = 5 ₳ × 9/1440 min). Payout tx signed + submitted; payee received
  **exactly 2.777777 ₳** on-chain (tx `e21e1935d9…6d599b`); fully-paid + expired payment
  correctly retires from the count (2 payments → 1).
- **Flow 9 proof-of-life:** set 30-day check-in, deadline 02/10/2026 17:09:16 CEST.
  Settings tx `99b305da2a…7aa0bb` landed; on-chain datum verified:
  `proofOfLifeUnlockTime = 1790953756535` ("some"), `proofOfLifeIncrement = 2592000000` ("some").
- Expected-error UX works as designed: the ledger-rejected payout appeared as a calm blue
  banner, no console spam.

## Findings

### 1. [High] Stale wallet detection after submit (intermittent)
After the first manage tx (`44b98d63dd…`), the sidebar stayed **"0 payments" for 15+ minutes**
through several "Reload wallet funds" clicks; only a full page reload picked it up.
After the payout tx, "Paid so far" also stayed stale until reload. The second manage tx
(`0f6d14dd…`) *did* update live, so it's a race.

- **Cause (code path):** the post-submit re-detect calls
  `refreshDetectedTokens({ keepSelection: true })`, which deliberately skips the tick when
  the new state UTxO isn't indexed yet ("a later tick picks up the new State") — but no
  later tick exists. The sidebar **Reload wallet funds** button does not re-run token
  detection either.
- **Suggest:** bounded retry re-detect after submit; make the Reload button call
  `refreshDetectedTokens()`; re-derive "Paid so far" from the new state after a pay tx.

### 2. [High] Dust payouts are unpayable, and the error advice can't be followed
A 5 ₳/day schedule over a 9-minute window accrued 0.03125 ₳. The payout tx was signed and
submitted, and the **ledger rejected it** (output below min-UTxO). The banner advises:
> "If you staged a very small payout, raise it and try again."

…but the form enforces *"Payout amount cannot exceed the currently due amount"*, so the
advice is impossible to follow. Short/low-rate schedules produce payouts that can never be
paid. Evidence: state UTxO `44b98d63dd…` stayed unspent; payee received nothing.

- **Suggest:** preflight min-UTxO — warn at schedule creation ("this schedule accrues less
  than the network minimum per payout") and/or in the Pay tab before building; consider
  merging payouts to the same payee address, or letting the funding wallet top the payout
  output up to min-UTxO; reword the banner when the payout is capped by the due amount.

### 3. [Medium] Review-receipt wording/data bugs (Update wallet settings)
The receipt the user reviews before signing showed:
- **"PROOF OF LIFE off — 02/10/2026, 17:09:16"** — the change turns proof of life **on**;
  "off" is wrong (should be "on" / "no check-in required until …").
- **"TIMER EXTENSION unset — 2592000000"** — self-contradictory ("unset" plus a value), and
  the value is raw milliseconds; should read "30 days".

### 4. [Medium] 4-minute transaction validity window
`VALIDITY_WINDOW_FUTURE_MS = 240_000` (`src/lib/mesh/transactions/internals/constants.ts`)
makes every tx expire 4 minutes after build. Observed: the settings tx prompt showed
**"Transaction has expired"** with Sign disabled in eternl before the user could sign.
Rebuild-and-sign-immediately worked.

- **Suggest:** widen to 10–15 minutes; optionally show remaining validity in the review panel.

### 5. [Medium] Activity misclassifies the manage tx as "Wallet created"
Adding a payment to the existing wallet rendered as **"Created / Wallet created / New
wallet"** in Activity. Likely the activity IO payload omits the state input at the STT
script address (making `sttCreated` fire: STT out with no STT in), or the `sttUnit` passed
differs from the detected unit. Expected "Wallet updated"/forward-style classification.

> **UPDATE (2 Sept evening, epora.io verify round):** root cause found — it is the same
> as #10b's. Every tx input was normalized with the *containing tx's* hash as its source
> ref, ref-dedupe collapsed distinct inputs, and the classifier's input-side facts were
> garbage (wallet/state inputs looked empty → "created"/"top-up" guesses). With the
> input-source fix (PR #136) the live repro classifies the payout tx as **"Sent"** and
> the tidy tx as **"Tidied"**; the phantom "Wallet created" rows disappear.

### 6. [Medium] Date picker opens nothing visible
"Show date picker" popupbuttons (Starts/Stops in scheduled payments, claim-after in
settings) produce no visible calendar (tried AXPress and raw clicks). Workaround during
testing: "Now" buttons + wall-clock waits. Pre-existing backlog item, reconfirmed today.

### 7. [Low] Stale `?wallet=` URL param diverges from the detected wallet
The URL param names an older Aug-24-era STT unit (`…4a54e323…`) while the app operates on
the detected unit (`…a3937f21…`). The app correctly follows the detected token, but a shared
deep link silently points at the wrong wallet. Consider syncing the param on detect or
surfacing the mismatch.

### 8. [Info] Expired prompts linger in eternl
eternl keeps expired requests in its queue with Sign disabled (behavior of eternl, not
Epora), which compounds finding #4 — the user sees a prompt that can never succeed.

### 9. [High] Send funds bounces back to Home for a valid allowance spender
Connected as **test 2** (payment key `03c422c5…`, address `addr_test1qq…uqtu9ru2`), the
dApp opens the **"Epora flow test"** smart wallet — which is *correct*: the on-chain datum
lists exactly two participants, User 0 admin = `27c006ce…` (eternl "test", the owner) and
User 1 = `03c422c5…` (test 2) with preset `limited-withdrawal` and a **3 ₯/day allowance**.
The Home card correctly advertises "Send funds — Use your allowance" (capability map:
`hasDirectUserMatch` → `use-allowance`), but clicking it **redirects straight back to
Wallet home** — no editor, no explanation. The home-level capability check and the
route-level role gate disagree for the same key. This blocks both the allowance-send flow
(Flow 7) and staging a proposal as the spender (Flow 6).

- **Suggest:** audit the send route's role gate (PR #67/#69 gating family) so it resolves
  the connected key the same way `resolveTokenCapabilityMap` does; if the gate must deny,
  show why instead of silently returning Home.

### 10. [Medium] Balance chart renders empty with no loading state, then fills in
On first open of a wallet (observed on "Epora flow test" as test 2) the balance chart area
showed the frame — range pills, "WALLET BALANCE" headline (18.00 ₳), x-axis ticks
("1 Sept / 2 Sept / 2 Sept"), legend — but **no line/area**, and it only drew "after a
while". Two contributing mechanisms, both in code:

- The chart derives from `wealthSeriesForAssetAtom`, which returns `[]` until
  `recentWalletActivityEventsAtom` (async fetch) resolves; the section then `return null`s
  entirely. There is **no loading/skeleton state** anywhere between "no data yet" and
  "data", so the section pops in late or renders partially, reading as broken.
- The series is computed against `renderNowMsAtom` (interval-driven). When the first
  render lands before the data/interval tick, the empty plot can persist until the next
  tick forces a re-render — matching "after a while it showed again".

Also minor: with few same-day events the x-axis repeats the same day label ("2 Sept",
"2 Sept") — consider time-level ticks for short ranges.

- **Suggest:** add a skeleton/loading state driven by the activity-fetch loading atoms, and
  re-render the chart immediately when the series transitions from empty to non-empty
  rather than waiting for the next `renderNowMs` tick.

**Refinement (second repro, screenshot):** the section can render with data present —
x-ticks ("1 Sept / 2 Sept / 2 Sept"), legend "ADA 18.00 ₳" — while the **line/area path is
never drawn**. The data bindings read correctly (`multi.rows` carry `[entry.id]`, matching
`Area dataKey`), so the prime suspect is the recharts **mount animation**: the `Area`s do
not set `isAnimationActive={false}` (only the `Tooltip` does — precedent already in this
file), and an interrupted entry animation inside a `ResponsiveContainer` leaves the path
empty until an unrelated re-render (the next `renderNowMs` tick) redraws it.

- **Suggest:** set `isAnimationActive={false}` on both `Area` branches; keep the skeleton
  from above for the genuinely-loading window.

**Separate data smell (needs its own look):** in the empty-chart state the legend reported
**18.00 ₳** while the wallet holds **9.00 ₳** ("Only ADA inside this wallet"). The
event-derived series ends at 2× the actual balance — a possible transaction double-count
(created/top-up pair or consolidate pair) in this wallet's activity feed, i.e. the same
class of bug the `oneEventPerTransaction` dedupe fixed for the other wallet. Worth
re-checking the dedupe against this wallet's 7-event history.

### 10b. [High] CONFIRMED: balance series double-counts consolidated funds (18 ₯ shown, 9 ₯ real)

Reproduced end-to-end with the app's own fetchers + derivation against the live chain
("Epora flow test", lock address `addr_test1wr8443…npqrz7`): **series final value = 18**,
actual on-chain balance = **9**. Root cause found:

- Tx `f244b12b56…` (23:47) **consolidated** the wallet: it consumed 9 ₯ at the lock
  address (the 4 ₯ initial top-up + 5 ₯ top-up UTxOs) and paid back 9 ₯ — **net 0**.
- The activity feed counted it as **"Top-up +9 ₯"** — the input side was missed, because
  the derivation ran on a **partial tx payload**. The same tx enters the feed from three
  fetch paths (`fetchAddressTransactions` on the lock address, on the STT script address,
  and `fetchTransactionsByHash` detail), and their payloads differ: the by-hash detail
  carries **all 6 inputs** (incl. 9 ₯ at the wallet address); the address-listing variants
  carry only 2–3. `mergeAndSortTransactions` replaces an entry only when the new one is
  **strictly newer** (slot/time) — identical slots mean the **first, possibly partial,
  payload wins** and the complete detail is discarded.
- With the partial payload, `inputsAtAddress` misses the 9 ₯ inputs →
  `calculateAssetDelta` returns outputs-only → phantom +9. Per-tx dedupe (`oneEventPerTransaction`)
  is not the issue — it keeps one event per tx correctly; the kept event itself is wrong.

- **Suggest:** in `mergeAndSortTransactions`, on a slot/time tie prefer the payload with
  more complete IO (e.g., more inputs+outputs, or inputs that carry addresses); or in
  `useWalletActivity`, always let the by-hash detail overwrite listing payloads
  (detail-last with prefer-later-on-tie). Also consider asserting that a tx whose
  address-listing inputs count < detail inputs never feeds balance deltas.

> **ROOT-CAUSE CORRECTION (2 Sept evening) — the analysis above was wrong about the
> mechanism.** The listing payload for `f244b12b…` already carried all 6 inputs, and the
> real input refs point at *previous* transactions (`6463d6caa6#0` 4 ₯ @lock,
> `db12d03150#0` 5 ₯ @lock, …). The corruption happened in the app:
> `normalizeTransactionUtxo` only looked for the provider's pre-1.9 `transaction.hash`
> shape, found nothing on the raw Blockfrost entries (`tx_hash` is the real field), and
> **stamped every input with the containing tx's own hash**. Ref-dedupe then collapsed
> all inputs sharing an `output_index` — the 4 ₯ + 5 ₯ lock inputs (both stamped `self#0`)
> lost to a foreign 57.7 ₯ entry — so `inputsAtAddress` was empty and the delta read
> outputs-only (+9). PR #123's completeness heuristic could never fire because *both*
> fetch paths carried the same forged refs (equal IO counts).
>
> **Fix: PR #136** (`fix(dapp): read the input's own source hash when normalizing tx
> payloads`): read `tx_hash` first, drop a source-less input instead of forging a ref,
> keep `transaction.hash` as a legacy fallback. Verified live: tidy = "Tidied, no net
> balance change", payout = "Sent", **series final = 9 000 000** (was 18 000 000).
> Tests 821 + 496 pass.

### 12. [High — needs product decision] Scheduled payout was funded from the owner's personal wallet, not the wallet's fund pool
The Flow-8 payout (`e21e1935d9…6d599b`, 2.777777 ₯ to test 2) never touched the wallet's
9 ₯ pool at the lock address (that UTxO, `f244b12b…#1`, is still there untouched). Clean
Koios `tx_info` data confirms the real inputs were **{state UTxO `0f6d14dd…#0` 2.55 ₯,
eternl "test" UTxO 975.68 ₯}** and outputs {state forward, payee 2.777777 ₯, eternl
change 972.42 ₯} + 0.48 ₯ fee — balanced exactly. So the owner's eternl wallet paid the
payee out of pocket while the smart wallet's "9 ₳ available" never moved.

- **Question for product:** is "pay a scheduled payment" intended to draw from the
  wallet's fund pool (lock address / spend validator) with the owner only paying fees?
  That's what the UI implies ("9 ₳ available"). If yes, this is a serious funds-source
  bug in the payout path. If it's an MVP fallback ("owner pays on behalf"), it should be
  labelled before owners unknowingly gift money.

### 13. [High] Blockfrost `/txs/{hash}/utxos` responses contain cross-transaction entries
Multiple tx payloads returned by the endpoint list entries that **do not belong to the
tx**: a phantom 57.715 ₯ input (`69a692e2…#0` @ `addr_test1wr7zq…`) recurs in unrelated
txs; a duplicate of the same eternl input ref appears twice; and in the payout payload
the state entries were replaced by **another wallet's** state (Audit-wallet STT
`…a3937f21…` instead of the flow-test unit). Evidence it's upstream, not the app: raw
`curl` to Blockfrost shows it; Blockfrost's own `/txs/{hash}` summary disagrees with
`/utxos` (`utxo_count` 5–7 vs 8–10 listed entries); and in every case the subset of
entries that balances `outputs + fees` exactly is the real tx.

Visible consequences in the app today:
- **The payout is missing from the wallet's Activity feed** — the payload's STT entries
  carried the *Audit* wallet's unit, so the STT-unit filter dropped the tx (feed showed
  7 events across 5 txs; the payout, the tx a user cares about most, isn't one of them).
- Per-tx deltas computed from these payloads are unreliable in general; the chart fix
  (PR #136) happens to be correct because every listed lock-address entry carried real
  refs and amounts.

- **Suggest:** fetch activity tx details through Koios (`tx_info` returns clean,
  balanced IOs — the app already has a Koios route) or validate payloads
  (`inputs.lovelace == outputs.lovelace + fees`) and refetch/fall back when they don't
  balance; do not let unit-matching consume unvalidated payloads.

### 14. [High — deployment config] Proposals sign-in is dead on epora.io: the auth-nonce route 500s server-side
Flow 6 got further this round — **"Save as approval request" worked** (the earlier
"This wallet has not been indexed yet" block did *not* reappear; the rename proposal to
"Epora flow test v2" staged and redirected to `/user/proposals?create=1`). But the next
step, the wallet sign-in, fails before any eternl popup appears — reproducible on every
retry, after a page reload, and with eternl's DApp access re-enabled (eternl had shown
"Forced DApp Account Disable" on the connected account, which I cleared; not the cause).

Evidence it is server-side, not the wallet:
- `POST https://epora.io/api/proposals/auth/nonce` returns **500**
  `{"error":"Could not start sign-in. Try again."}` — the exact copy the page shows; the
  browser never reaches CIP-30 `signData`. Invalid bodies get clean 400s, so the route
  itself is alive; only the nonce issue path throws.
- `GET /api/proposals` answers 401 (route alive), and `/api/health` reports
  `{"status":"ok","checks":{"database":"up"}}`.

> **ROOT CAUSE (corrected after the DB-migration theory was ruled out):** the nonce route
> calls `issueNonce(address)` **before** any database work, and `getProposalAuthSecret()`
> (`src/lib/env/server-env.ts`) **throws in production when `PROPOSAL_AUTH_SECRET` is
> unset — or when it is set but shorter than 32 chars / on the known-weak list**. The
> route's catch masks every throw into the generic 500. The database was never the
> problem: the Neon DB in the repo `.env` is fully migrated (`ProposalAuthChallenge`
> exists, insert/delete verified working), and `prisma migrate deploy` reported "no
> pending migrations". The production deployment is simply missing (or under-strengthening)
> that one environment variable.

- **Fix (deployment config, not code):** in Vercel → Settings → Environment Variables →
  Production, set `PROPOSAL_AUTH_SECRET` to a fresh random value
  (`openssl rand -base64 32`), then **redeploy** (running serverless functions keep old
  env until redeployed). While there, confirm `STT_SYNC_SECRET` is also set to a strong
  value — it passes through the same production-strength guard for `/api/stt/sync`.
- **Suggest (code, optional):** the nonce route's catch should `logger.error` the real
  error like `/api/mesh` does — a masked 500 with no server log made this diagnosis far
  harder than it needed to be.

### 15. [High — CONFIRMED, fix PR #154] Allowance spend is impossible: daily limit written unscaled + every rule error masked
Flow 7 retest on the new deploy (test 2 connected to "Epora flow test", 9 ₯ pool). The #147
fix works: **Send funds now opens the use-allowance editor** instead of bouncing Home. But
with a 1 ₯ payout staged, the Spender row shows *"Could not work out which spender this send
belongs to."* and submit stays disabled.

Root causes (both reproduced against the live state UTxO `0681f227…#0`, assetName `…eed1bea8`):

1. **Unscaled write:** the people editor's daily-limit amount goes into the datum raw. The
   owner's "3" (3 ₯/day) is on-chain as `per_day_allowance = 3` **lovelace** (0.000003 ₯) —
   verified by decoding the datum with the app's own readers (`perDay=[{"":"","amount":"3"}]`,
   `remaining=[]`, `reset=0`). No payout ≥ min-UTxO can ever pass.
2. **Masked errors:** `getUserFacingErrorMessage` only handles rejects/network, so the
   derivation's actionable messages ("does not match any spender with enough remaining
   allowance", "requires at least one positive forwarded transfer", pool-fit errors) all
   collapse into the generic "Could not work out which spender…" copy.

Also noted: the state script address holds **4 state UTxOs** sharing one policy
(`67c11430…f93c`) — two stale (Aug-24 era, `…4a54e323`, `…35d4f386`) and two current
(flow test `…eed1bea8`, Audit wallet `…a3937f21`). Detection matches by full unit (correct),
but any policy-prefix matching would pick the stale states.

- **Fix: PR #154** — ADA↔lovelace conversion at the form boundary (lovelace rows only,
  decimals supported), `AllowanceDerivationError` surfaced verbatim by the preview,
  "add a payout" next-step copy when nothing is staged, helper copy updated. 946+624 tests,
  lint, typecheck green.
- **Operator note:** after deploy, an owner must re-save test 2's daily limit (one manage tx)
  before Flow 7 can complete; the old dust limit stays on chain until then.
- **DONE (3 Sept):** PR #154 merged (#155 dev→main) + deployed; owner re-save tx
  `b995e5c464…b4158f` landed (fee 0.51 ₯). Live datum of the flow-test state
  (`b995e5c46428…#0`, assetName `…eed1bea8`) now holds `per_day_allowance = 3000000`
  lovelace for user 1 (test 2); owner unchanged. The preview derivation resolves against
  the live datum (effective 3,000,000 lovelace). Flow 7 is unblocked.

### Flow 7 COMPLETE (3 Sept, 15:3x CEST) — first successful allowance spend, fully verified

Deploy with #154 live, connected as test 2: the Use allowance editor now shows the full
resolved preview — **"Matched as: Spender #1 · You can spend now: 3 ₳ · This send uses:
1 ₳ · Left after this send: 2 ₳ · Limit resets 04/09/2026 15:39"** — plus the empty-state
copy "Add a payout to see the spender and the daily limit…" before staging. Staged 1 ₯ to
test 2's own address, one fund pool auto-picked, signed in eternl (test 2 pays fees).

On-chain verification of spend tx `0cd9aa4ea0…531049` (fee 0.838723 ₯, `valid_contract: true`):

| Output | Value | Meaning |
|---|---|---|
| lock address | 8,000,000 | pool 9 ₯ → 8 ₯ (only the payout taken) |
| state script address | 2,693,750 + STT + datum | state forward |
| test 2 address | **1,000,000** | the payout, exact |
| test 2 address ×2 | change | eternl UTxOs consolidated (fee payer) |

Post-spend datum: `per_day = 3000000`, **`remaining = 2000000`**, `next_allowance_reset =
2026-09-04T13:39:49Z` — the daily-limit bookkeeping is exact end to end.

### Surface sweeps + post-spend retest (3 Sept evening, as test 2)

- **Allowance preview after a spend: PASS.** Re-staging 1 ₯ shows "Matched as Spender #1 ·
  You can spend now: **2 ₳** · This send uses 1 ₳ · Left after 1 ₳ · Limit resets 04/09
  16:33" (rebased to now+24h per `next_allowance_reset_after_use`). The preview correctly
  reflects the decremented on-chain remaining.
- **Receive page (Add funds): PASS.** Address + QR + Copy address + Cardanoscan link all
  present. *Nit:* the form opens with a pre-seeded empty asset row, so the first paint
  already shows "Something needs attention: Complete asset row 1" — start with no rows and
  let "Add Asset" create the first one.
- **Payee page (/payee): data accurate, but finding #2 is still open here.** Two ended
  payments show for test 2 with exact accruals (Audit wallet 5 ₯/day → 0.03125 ₯ owed;
  Epora flow test 2 ₯/day → 0.004166 ₯ owed; "Paid out so far: 0"), and both still offer a
  clickable **"Collect payment"** for amounts far below min-UTxO — the exact tx that got
  ledger-rejected in finding #2. The preflight warning/merge suggested there remains to be
  built. (Good: the page labels payments with the sending wallet's *name*.)
- **Proposals page as proposer: PASS, and staleness detection works.** The pending
  "Rename wallet to v2" (saved pre-re-save) shows an **"Out of date"** badge — correct,
  since the state UTxO moved twice (settings re-save + allowance spend) after it was
  staged. "Waiting for an owner · 1 person still to sign". The page signs in with a
  CIP-30 signData and shows the signer address with a Copy button.

### Flow 6 owner leg (3 Sept evening) — auth retest PASS; old proposal verified dead; fresh proposal needed

- **Finding #14 fix verified live:** "Sign in with wallet" (CIP-30 signData over the
  server nonce) worked first try on production as the owner — signed in as
  `addr_test1qq…qqg8p7t0`. No 500. The #153 error-logging + env secret fix holds.
- **The saved proposal is unrecoverable, and the page says so honestly.** The detail view
  (proposal `cmtlcy9ao000004jvo6g7wgpz`) badges it **Invalid** with three concrete checks:
  validity window closed, input `0681f227…` already spent, input `99b305da…` already
  spent — "This request expired before it was sent, so it can no longer [be signed]".
  No sign button is offered. (Its saved change output targets the owner's eternal — it
  was built while the owner was connected.)
- **Consequence:** completing the co-sign loop requires a FRESH proposal staged against
  the current state (as test 2), then the owner co-signs the new one. Old proposal is a
  kept, honestly-dead record — arguably it should offer a "stage a replacement" shortcut.

### NEW finding #16 [Medium — product gap] spenders cannot stage any proposal; the co-sign loop is single-party

As test 2 (spender): the wallet-settings route (`?action=wallet-settings&step=configure`)
clamps silently back to Wallet home (role gating working as built), and the Scheduled
payments "Pay due" view offers no proposal staging either. "Save as approval request"
exists only inside owner-gated editors. So the only buildable proposals are owner-built,
and they wait for the owner's own deferred signature ("Waiting for an owner · 1 person
still to sign" — the builder was the owner). The spender-proposes → owner-approves loop
that approval requests exist for is currently unreachable. Either open staged-proposal
creation to spenders (read-only editors + Save as approval request), or reframe the
feature copy around deferred owner signing.
- **Minor finding (diff baseline):** the wallet-update receipt showed "NO CHANGES" for the
  limit edit — its baseline appears to be the cached pre-fix form ("3"), not the decoded
  on-chain value ("0.000003"). The built tx was still correct (form→datum encode). Worth a
  small fix so the receipt reflects scaled changes.
- **Minor finding (home buttons):** on the wallet home, "Manage owners" / the SMART WALLET
  card's "Settings" button did nothing on click (two accounts, repeated); the people editor
  is reachable via the direct URL `?action=manage-people&step=configure`. Worth wiring up
  or removing.

## Retest status after the 2 Sept deploy (PRs #147/#149/#152/#153)

- **#9 (send bounces Home):** PASS for the half this deploy covers — clicking
  "Send funds · Use your allowance" as the spender now opens the editor and stays. The
  remaining blocker is finding #15, not a routing bug.
- **#14 / sync endpoint (#149/#153):** PASS — `POST www.epora.io/api/stt/sync` with the
  bearer secret returned **200 in 14.6 s** (`timeBudgetMs: 120000`); reconcile processed
  4 wallets/4 txs; `deadlineReached: false` on all three phases. (Note: apex
  `epora.io` 308-redirects POSTs to `www.epora.io`.) The old 500 is gone.
- **#10 (chart line):** fix confirmed in the deployed branch — `isAnimationActive={false}`
  on all three series renderings in `origin/dev`'s wealth-chart.tsx (PR #152, merged
  3 Sept 10:26). Live visual retest deferred: the tab was memory-saver-throttled behind a
  fullscreen video, and stealing focus mid-video wasn't worth it. Next time the wallet
  home loads fresh, the line should draw immediately.
- **#14 (proposal sign-in):** still needs the owner-leg attempt on the new deploy (Flow 6).

## Reference data

| Item | Value |
|---|---|
| Manage tx #1 (add 5 ₯/day payment) | `44b98d63dd0da12a44442fa75d25751f1509e5d3d81c481d1f0eadbccd39427c` |
| Manage tx #2 (add 2,000 ₯/day payment) | `0f6d14dd9c…43afd7` |
| Payout tx (2.777777 ₯ paid) | `e21e1935d9b6878a…6d599b` |
| Settings tx (proof of life) | `99b305da2ac597d3c62aba157ccfdc0bc131025cfc293f44f6ce6fd6537aa0bb` |
| Tidy/consolidation tx (net 0, chart-bug subject) | `f244b12b561a47dac2c9d2c58fff7413206b64c04f17a36972162d6f7467ca12` |
| Settings tx 00:53 (proof-of-life 30d, flow test) | `0681f227423c9913865cf6a7898f9a705ced53f752db91d75cb8f0eebc4a7b63` |
| Phantom input UTxO (pollution marker) | `69a692e262ab9913d978515c02256fddf30ba20db69f7c25203df34aa99e5a2a#0` (57.715 ₯ @ `addr_test1wr7zq…`) |
| Payout address | `addr_test1qqpuggk9mxuwfc2me4nqaaay0tkjyd8czx9udeesc4ux42gy6nc6cptzv8dusc4d4ae2pt5ld9u4xgdh6vekt6k04huqtu9ru2` |
| State address (STT script) | `addr_test1wpnuz9pskv8v35pu9n8z9v2fye0770yxdt6mxezksxzlj0qksjl5s` |

Testing note: the AXIncrementor date/time spinners cannot be driven by accessibility
tooling (set_value/arrow keys rejected); "Now" buttons were used instead. Early in the
session an address typo (truncated bech32 checksum) was correctly caught by the form's
"No — not a valid Cardano address" validation — that guard works.

## Session addendum — 3 Sept 2026 (localhost:3100 dev server, same backend DB as prod)

### Flow 6 (deferred signing / approval requests) — status

- **Witness rejection FIXED and verified live.** First sign attempt on prod rejected the owner's eternl signature with "Only signatures from a wallet key can be added." Root cause: eternl returns the tx's whole witness set (incl. redeemers/plutusData of the script inputs) from signTx, while `validateVKeyWitnessSet` demanded vkey-only. Fix: filter to vkeys and rebuild a vkey-only set (PR #158). Verified end-to-end on localhost+eternl: signature accepted → assembled → **Submitted on chain** (tx `6dfb21ebec3e…5f5734ee`).
- **Deployed settings editor has no wallet-name field.** Window title says "Wallet name" (task `settings-wallet-name`) but the editor renders only the People section + fund pools. The rename ("Save as approval request" plan) was impossible; staged an approvals-power change instead. Note: the dev build's focused editor (`FocusedWalletSettingsEditor`) does render `WalletNameEditor` — prod (main) predates it.
- **Rebuild ("Make a new version") false success.** On the expired proposal, clicking it showed "Rebuilt against live chain state. Existing signatures were reset." but the stored tx/expiry/fee never changed and the proposal stayed Invalid (also seen after Refresh). Needs investigation (silent API failure or optimistic UI without apply).
- **~3-minute tx TTL** made signing brittle (popup countdown, expired twice). Fix: `VALIDITY_WINDOW_FUTURE_MS` 240_000 → 1_800_000 (PR #160, stacked on #158).
- **"Authorization path" dropdown naming** (user feedback): "Owner" reads as a person role; renamed to "Multi-custodial owner" (PR #159).
- **Who may sign a settings change:** the create form lists only the CURRENT state's owners for the Owner path ("Nobody else can sign for this wallet on this path") — a person being promoted cannot co-sign their own promotion. Multi-custodial (co-signer) proposals: file under the Co-signers path; required signers = all users with approval power, satisfied at the threshold (`computeSignerSatisfaction`).
- Multi-custodial two-participant round (in progress when session paused): stage spender "Counts toward approvals"=Yes power=1 + co-signer threshold=2, file under Co-signers path → both keys listed as required signers; sign with `test`, then switch eternl to `test 2` + re-sign-in (signData) for the second signature.

### PRs opened
- #158 fix(proposals): accept witness sets that carry script artifacts
- #159 chore(dapp): relabel the owner authorization path ("Multi-custodial owner")
- #160 chore(transactions): 30-minute validity window (stacked on #158)

### Session addendum 2 — 3 Sept evening (localhost:3000, branch stack #158+#160+#161+#162+#168+#173)

#### Multi-custodial two-participant round — COMPLETE, verified on chain

- **Round 1 (bootstrap, admin path).** Chain state before: threshold 2 but only the owner held power — the co-signers path was arithmetically unreachable, so the spender-power grant could only ever be authorized by the admin path (by design: the admin bootstraps the multisig set). Filed "Update wallet settings · Owner" with spender `03c422c5…786aa9` → Counts Yes, power 1. Owner signed with `test`; **Submitted: tx `14218e58…0a12ddbd`, confirmed block 5134150**. Wallet is now genuinely 2-of-2 (two power-1 holders, threshold 2). Tx validity span ≈ 32 min → the 30-minute window (PR #160) is live in real txs.
- **Product bug found + fixed (PR #162).** Filing ANY proposal on the Co-signers path died at build with the empty-failure wall (`EvaluationFailure {"ScriptFailures": {}}` → "The wallet's own rules refused this action…"): the stt-spend draft lists only the connected wallet in `extra_signatories`, the Aiken multisig arm sums the power of exactly those listed keys (`authorization.ak`), so threshold 2 > proposer power 1 could never evaluate — and the co-signer picker that would add the second key lives on the NEXT page, after the stash that requires a successful build. Fix: multisig drafts whose threshold exceeds the proposer's own power list every other consumed-state power holder (`multisigDraftSignerKeyHashes`); thresholds the proposer alone meets keep the proposer-only draft (direct execution unchanged).
- **Round 2 (co-signers path, both participants).** With #162 live: staged Send funds 2₳ → eternl `test` address, path Co-signers → draft built and evaluated (previously impossible) → picker showed both power holders, Save correctly gated until the co-signer was checked → saved → signed with `test` ("1 of 2 approval power") → user switched eternl to `test 2`, re-signed-in, signed second ("2 of 2") → **Submitted: tx `d40324d2051c…1f1fa217`, confirmed block 5134225**. True 2-of-2 governance exercised end-to-end: two different keys, two wallets, one proposal.

#### Requests implemented live this session

- **Cardanoscan links (PR #168).** User: "please always link to the cardanoscan for the tx". Submitted-tx hash is now a persistent link on every visit to a submitted request (was plain text in a transient line only), and every "Funds it uses" input ref links too. Live-verified on the submitted proposal.
- **People roster with permission chips (PR #173).** User: the `Owners 1 OWNER / Spenders 1 SPENDER / Wallets 2/2 LINKED` strip "shows a bit strange" — asked for all persons with their permissions, add-person, and per-person chip-like multi-select permissions. Rebuilt as one roster: per-person cards with Owner / Co-signer / Spender / Check-in toggle chips + the editor for each held permission beneath; Add person replaces the two role-specific buttons; owner-locked check-in and owner-disabled spender chips encode the contract rules.

#### Open / not reproduced

- **One-off 3-second withdrawal.** The FIRST bootstrap proposal was DELETEd ~3s after creation by a session with creator rights; not reproducible on the re-create (watched status for 18s, stayed OPEN). Only the Withdraw button issues that DELETE — likely a stray click in another signed-in tab. Watch for recurrence.
- ~~**"Invalid" badge on submitted proposals.**~~ **FIXED (PR #180, later session 3 Sept).** The detail page ran the liveness check on every proposal, so a sent request's inputs — consumed by the request's own success — were each reported "has already been spent", with the amber "What the check found" panel and an Invalid badge on the screen whose status note says the request went through. `runVerify` now skips every non-OPEN status (SUBMITTED / SUBMITTING / CANCELLED); verification null suppresses both the panel and the badge, and the Cardanoscan link + Submitted badge carry the status. Live-verified on the 2-of-2 Send funds proposal. The list-side check already filtered to OPEN, unchanged. Also covers #168's sub-note and the person-diff/#177/#179 follow-ups below.
- Earlier findings still open: rebuild false-success; missing wallet-name field on the deployed editor.

### PRs opened (cumulative)
- #158 witness-set fix · #159 "Multi-custodial owner" label · #160 30-min validity · #161 wallet-settings URL round-trip · #162 multisig drafts list power holders · #168 Cardanoscan links · #173 people roster with permission chips · #176 labeled person-diff segments · #177 owners on the admin path skip the request flow · #179 approval-power sliders with threshold coloring + whole-number wording · #180 no spent-input check on sent/in-flight/withdrawn requests
