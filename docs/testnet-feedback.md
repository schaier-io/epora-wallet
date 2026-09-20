# Testnet feedback (Milestone 4)

Categorized reports from the Preprod prototype at [epora.io](https://epora.io).
This page is the Catalyst evidence link for "gathered and categorized feedback".
Fixes live in the GitHub issues and pull requests linked in each row.

**Labels** on the tracker match the four buckets:

- [`feasible`](https://github.com/schaier-io/epora-wallet/issues?q=label%3Afeasible)
- [`fixed`](https://github.com/schaier-io/epora-wallet/issues?q=label%3Afixed)
- [`next`](https://github.com/schaier-io/epora-wallet/issues?q=label%3Anext)
- [`not-a-bug`](https://github.com/schaier-io/epora-wallet/issues?q=label%3Anot-a-bug)

**How to report:** footer "Report an issue" (bug or feedback form), or [Discord](https://discord.gg/2uh4BynQBW). Discord messages are copied into issues as text. They are not evidence on their own.

**Sources for this snapshot (2026-09-20):** GitHub issues from the Preprod launch window, plus the structured e2e notes in [`e2e-findings-2026-09-02.md`](../e2e-findings-2026-09-02.md). No Discord-only reports were on file.

## Fixed

Closed on GitHub after a code change. Each issue is the tracker row. The linked pull request is on the issue page.

| Issue | What broke | Fix |
| --- | --- | --- |
| [#384](https://github.com/schaier-io/epora-wallet/issues/384) | Stale-body witness fallback could submit invalid signatures | Closed |
| [#383](https://github.com/schaier-io/epora-wallet/issues/383) | Collateral selection rejected a pure ADA UTxO of exactly 5 ADA | Closed |
| [#382](https://github.com/schaier-io/epora-wallet/issues/382) | Switching extension accounts left the previous balance | Closed |
| [#381](https://github.com/schaier-io/epora-wallet/issues/381) | Saved demo session left the workspace loading after install | Closed |
| [#380](https://github.com/schaier-io/epora-wallet/issues/380) | Wallet reconcile repeated a partial page | Closed |
| [#403](https://github.com/schaier-io/epora-wallet/issues/403) | Oversized funding candidate discarded a valid ADA payout | Closed |
| [#402](https://github.com/schaier-io/epora-wallet/issues/402) | Uppercase crank credential hashes failed streaming-payment auth | Closed |
| [#401](https://github.com/schaier-io/epora-wallet/issues/401) | Proposal pagination skipped remaining open requests | Closed |
| [#400](https://github.com/schaier-io/epora-wallet/issues/400) | Refreshing the request list did not refresh selected details | Closed |
| [#399](https://github.com/schaier-io/epora-wallet/issues/399) | Incomplete ACTIVE cache records returned 403 on owner proposals | Closed |
| [#398](https://github.com/schaier-io/epora-wallet/issues/398) | Late reconcile could overwrite newer cached wallet state | Closed |
| [#397](https://github.com/schaier-io/epora-wallet/issues/397) | Pending proposal save could delete a newer draft | Closed |
| [#418](https://github.com/schaier-io/epora-wallet/issues/418) | Accessibility defects (status, aria-pressed, focus, icons) | Closed |
| [#417](https://github.com/schaier-io/epora-wallet/issues/417) | Review rail showed raw field keys | Closed |
| [#414](https://github.com/schaier-io/epora-wallet/issues/414) | Payee collect used `window.confirm` and treated decline as error | Closed |
| [#413](https://github.com/schaier-io/epora-wallet/issues/413) | Activity rendered nothing when a wallet had zero events | Closed |
| [#412](https://github.com/schaier-io/epora-wallet/issues/412) | Setup button stayed on "Build setup transaction" while signing | Closed |
| [#411](https://github.com/schaier-io/epora-wallet/issues/411) | WalletConnect pairing never timed out after the URI expired | Closed |
| [#409](https://github.com/schaier-io/epora-wallet/issues/409) | Social preview image was an incomplete logo | Closed |
| [#433](https://github.com/schaier-io/epora-wallet/issues/433) | Stale STT data referenced an already-spent input | Closed |
| [#385](https://github.com/schaier-io/epora-wallet/issues/385) | UTxO cleanup ignored `CARDANO_PROVIDER_URL` | Closed |

Tester notes from the September Preprod sessions that already have code on `main` (see the e2e file for tx hashes): allowance scaling, witness-set filtering, 30-minute validity window, multisig draft signers, Cardanoscan links, people roster, rebuild validity, address book, review-receipt units.

Closed enhancements from the same window (agent console, proof-of-life alerts, streaming projections, first-load JS, and similar) also carry the `fixed` label. They are listed under that GitHub filter, not repeated here.

## Feasible

In scope for the testnet prototype. Not closed yet.

| Issue | What to change |
| --- | --- |
| [#502](https://github.com/schaier-io/epora-wallet/issues/502) | `/payee` Lighthouse LCP is worse than the rest of the app |

From e2e notes, still worth a ticket if it reproduces on today's build: dust payouts below min-UTxO, date picker with no visible calendar, Settings button on a membership card that does nothing.

## Next

Deferred past this milestone. Not a refusal. Later version or a later milestone.

| Issue | Why later |
| --- | --- |
| [#392](https://github.com/schaier-io/epora-wallet/issues/392) | WalletConnect on real devices (Milestone 3 signing path) |
| [#394](https://github.com/schaier-io/epora-wallet/issues/394) | Stalled-indexer alerting drill (Milestone 5 hardening) |

## Not a bug

| Note | Why |
| --- | --- |
| One-off proposal DELETE ~3 s after create (3 Sep session) | Not reproduced. Likely a stray Withdraw click in another tab. |
| "Audit wallet" left the smart-wallet list (4 Sep) | Cause not observed. User action, recovery, or indexer closure are all possible. |
| Apex `epora.io` 308-redirects POST to `www.epora.io` | Expected CDN behavior. Sync cron posts to `www.epora.io`. |

## Prototype evidence

- App: [https://epora.io](https://epora.io)
- Validator hashes (from `code/smart-contract/plutus.json` on this commit):
  - STT mint/spend: `0dac00be80879dcf585cdb9d0acf6e0ecf52c417ded30d8b72d0ebf1`
  - STT reference store: `fc20070d1e5379403add6acbf77b233b2f8240821c187b398525de28`
  - Wallet (unparameterized): `5f8f25f5b598548b224efba3082ffbdd33f46ec58274282b63d0d701`
- Production spend on Preprod (4 Sep 2026, epora.io, 2-of-2 send): [`64c01da1705083a6565b0f6a56cc5674396757e45426e3f80dbca3def0a6f731`](https://preprod.cardanoscan.io/transaction/64c01da1705083a6565b0f6a56cc5674396757e45426e3f80dbca3def0a6f731)
- Indexer health: `GET /api/health` must return `200` with fresh `recent-head` and `wallet-reconcile` cursors once the Vercel cron (`GET /api/stt/sync` every 5 minutes) has `CRON_SECRET` set and has run.
