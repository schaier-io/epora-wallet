# Testnet feedback (Milestone 4)

Categorized reports from the Preprod prototype at [epora.io](https://epora.io).
This page is the Catalyst evidence link for "gathered and categorized feedback".
Every row links the GitHub issue and the pull request that answers it.

**Snapshot:** 2026-09-22. Covers every issue on the tracker (49 in total, none open), plus the e2e notes in [`e2e-findings-2026-09-02.md`](../e2e-findings-2026-09-02.md). Every issue carries its bucket label.

**Buckets** (tracker labels):

- [`fixed`](https://github.com/schaier-io/epora-wallet/issues?q=label%3Afixed): a code change shipped and the issue is closed.
- [`feasible`](https://github.com/schaier-io/epora-wallet/issues?q=label%3Afeasible): in scope for the testnet prototype.
- [`next`](https://github.com/schaier-io/epora-wallet/issues?q=label%3Anext): deferred to a later version. Not a refusal.
- [`not-a-bug`](https://github.com/schaier-io/epora-wallet/issues?q=label%3Anot-a-bug): expected behavior or not reproduced.

**All closed issues:** [issues?q=is:issue is:closed](https://github.com/schaier-io/epora-wallet/issues?q=is%3Aissue+is%3Aclosed). **All open issues:** [issues?q=is:issue is:open](https://github.com/schaier-io/epora-wallet/issues?q=is%3Aissue+is%3Aopen).

**Feedback stays open.** The Preprod prototype stays public after this milestone. New reports go into the same tracker and the same four buckets, and this page gets a new snapshot.

**How to report:** footer "Report an issue" (bug or feedback form, added in [#473](https://github.com/schaier-io/epora-wallet/pull/473)), [open a GitHub issue](https://github.com/schaier-io/epora-wallet/issues/new/choose), or [Discord](https://discord.gg/2uh4BynQBW). Discord messages are copied into issues as text.

## How feedback is categorized

1. A report comes in from the app forms, GitHub, Discord, or an e2e test session.
2. It becomes one GitHub issue. A Discord report is copied into the issue as text, with the reporter named.
3. The issue gets one bucket: `fixed`, `feasible`, `next`, or `not-a-bug`.
4. A `feasible` issue gets a pull request. When the fix merges, the issue closes and moves to `fixed`.
5. This page lists each issue once, with its bucket and its fix PR.

## Milestone 4 evidence map

| Catalyst requirement | Where to verify |
| --- | --- |
| A. Link to prototype | [epora.io](https://epora.io), [/api/health](https://www.epora.io/api/health), [Prototype evidence](#prototype-evidence) |
| B. Gathered and categorized feedback | This page: [Summary](#summary) and one section per bucket |
| C. Implementation and bug fixes per category | [External tester reports](#external-tester-reports), [Fixed: bugs](#fixed-bugs), [Fixed: feature requests](#fixed-feature-requests-and-ux-feedback), [Fixed: operations](#fixed-operations-and-tooling) |

## Summary

| Bucket | Count |
| --- | --- |
| Fixed: external tester reports | 2 |
| Fixed: bugs | 21 |
| Fixed: feature requests and UX feedback | 13 |
| Fixed: operations and tooling | 10 |
| Next version | 1 |
| Not a bug | 2 issues + 3 e2e notes |

## External tester reports

Feedback from people outside the team. Both reports led to code changes.

| Issue | Reporter | Report | Category | Fix |
| --- | --- | --- | --- | --- |
| [#561](https://github.com/schaier-io/epora-wallet/issues/561) | Isaac ([`bytegen-dev`](https://github.com/bytegen-dev)), GitHub bug form, Vespr on Preprod | "Move it back" from a previous stake address failed with no feedback | Fixed | [#562](https://github.com/schaier-io/epora-wallet/pull/562): consolidation no longer needs funds at the current address. On `main`. |
| [#565](https://github.com/schaier-io/epora-wallet/issues/565) | Bee (`opacular`), Discord | Owner has no way to tell the other co-signer to finish registration | Fixed | Stack [#568](https://github.com/schaier-io/epora-wallet/pull/568), [#569](https://github.com/schaier-io/epora-wallet/pull/569), [#570](https://github.com/schaier-io/epora-wallet/pull/570), [#571](https://github.com/schaier-io/epora-wallet/pull/571): invite link (share sheet, copy, mail, text, QR) and a per-co-signer "signed in" status. On `main`. |

Notes on these two rows:

- #561: the fix removes the availability gate that hid the action. REPORTED 2026-09-26: Sandro confirmed the live Vespr retest complete. This replaces the earlier pending-retest status. No retest transaction hash was supplied with that confirmation.
- #565: the app has no mail or push channel. The notification is a link that the owner sends. The stack is on `main` (merged via [#575](https://github.com/schaier-io/epora-wallet/pull/575)). Bee gets an update that it shipped.

## Fixed: bugs

| Issue | What broke | Fix PR |
| --- | --- | --- |
| [#380](https://github.com/schaier-io/epora-wallet/issues/380) | Wallet reconcile repeated a partial page | [#461](https://github.com/schaier-io/epora-wallet/pull/461) |
| [#381](https://github.com/schaier-io/epora-wallet/issues/381) | Saved demo session left the workspace loading after install | [#467](https://github.com/schaier-io/epora-wallet/pull/467) |
| [#382](https://github.com/schaier-io/epora-wallet/issues/382) | Switching extension accounts left the previous balance | [#367](https://github.com/schaier-io/epora-wallet/pull/367) |
| [#383](https://github.com/schaier-io/epora-wallet/issues/383) | Collateral selection rejected a pure ADA UTxO of exactly 5 ADA | [#386](https://github.com/schaier-io/epora-wallet/pull/386) |
| [#384](https://github.com/schaier-io/epora-wallet/issues/384) | Stale-body witness fallback could submit invalid signatures | [#466](https://github.com/schaier-io/epora-wallet/pull/466), [#489](https://github.com/schaier-io/epora-wallet/pull/489) |
| [#385](https://github.com/schaier-io/epora-wallet/issues/385) | UTxO cleanup ignored `CARDANO_PROVIDER_URL` | [#469](https://github.com/schaier-io/epora-wallet/pull/469) |
| [#397](https://github.com/schaier-io/epora-wallet/issues/397) | Pending proposal save could delete a newer draft | [#465](https://github.com/schaier-io/epora-wallet/pull/465), [#483](https://github.com/schaier-io/epora-wallet/pull/483) |
| [#398](https://github.com/schaier-io/epora-wallet/issues/398) | Late reconcile could overwrite newer cached wallet state | [#462](https://github.com/schaier-io/epora-wallet/pull/462) |
| [#399](https://github.com/schaier-io/epora-wallet/issues/399) | Incomplete ACTIVE cache records returned 403 on owner proposals | [#460](https://github.com/schaier-io/epora-wallet/pull/460) |
| [#400](https://github.com/schaier-io/epora-wallet/issues/400) | Refreshing the request list did not refresh selected details | [#367](https://github.com/schaier-io/epora-wallet/pull/367) |
| [#401](https://github.com/schaier-io/epora-wallet/issues/401) | Proposal pagination skipped remaining open requests | [#464](https://github.com/schaier-io/epora-wallet/pull/464), [#485](https://github.com/schaier-io/epora-wallet/pull/485) |
| [#402](https://github.com/schaier-io/epora-wallet/issues/402) | Uppercase crank credential hashes failed streaming-payment auth | [#446](https://github.com/schaier-io/epora-wallet/pull/446) |
| [#403](https://github.com/schaier-io/epora-wallet/issues/403) | Oversized funding candidate discarded a valid ADA payout | [#463](https://github.com/schaier-io/epora-wallet/pull/463) |
| [#409](https://github.com/schaier-io/epora-wallet/issues/409) | Social preview image was an incomplete logo | [#453](https://github.com/schaier-io/epora-wallet/pull/453) |
| [#411](https://github.com/schaier-io/epora-wallet/issues/411) | WalletConnect pairing never timed out after the URI expired | [#441](https://github.com/schaier-io/epora-wallet/pull/441) |
| [#412](https://github.com/schaier-io/epora-wallet/issues/412) | Setup button stayed on "Build setup transaction" while signing | [#447](https://github.com/schaier-io/epora-wallet/pull/447) |
| [#413](https://github.com/schaier-io/epora-wallet/issues/413) | Activity rendered nothing when a wallet had zero events | [#444](https://github.com/schaier-io/epora-wallet/pull/444) |
| [#414](https://github.com/schaier-io/epora-wallet/issues/414) | Payee collect used `window.confirm` and showed a decline as an error | [#445](https://github.com/schaier-io/epora-wallet/pull/445) |
| [#417](https://github.com/schaier-io/epora-wallet/issues/417) | Review rail showed raw field keys | [#450](https://github.com/schaier-io/epora-wallet/pull/450) |
| [#418](https://github.com/schaier-io/epora-wallet/issues/418) | Six WCAG 2.2 AA defects (status, aria-pressed, focus, icons) | [#452](https://github.com/schaier-io/epora-wallet/pull/452) |
| [#433](https://github.com/schaier-io/epora-wallet/issues/433) | Stale STT data referenced an already-spent input | [#435](https://github.com/schaier-io/epora-wallet/pull/435), [#440](https://github.com/schaier-io/epora-wallet/pull/440) |

## Fixed: feature requests and UX feedback

| Issue | Request | Fix PR |
| --- | --- | --- |
| [#387](https://github.com/schaier-io/epora-wallet/issues/387) | Set the maximum co-signer total freely in the UI | [#476](https://github.com/schaier-io/epora-wallet/pull/476) |
| [#389](https://github.com/schaier-io/epora-wallet/issues/389) | Proof-of-life deadline alerts | [#477](https://github.com/schaier-io/epora-wallet/pull/477), [#484](https://github.com/schaier-io/epora-wallet/pull/484) |
| [#390](https://github.com/schaier-io/epora-wallet/issues/390) | Show streaming expenses as projections in Activity | [#478](https://github.com/schaier-io/epora-wallet/pull/478) |
| [#391](https://github.com/schaier-io/epora-wallet/issues/391) | Agent spending console for budgets and history | [#479](https://github.com/schaier-io/epora-wallet/pull/479) |
| [#396](https://github.com/schaier-io/epora-wallet/issues/396) | Delete drafts and closed co-signing requests | [#475](https://github.com/schaier-io/epora-wallet/pull/475) |
| [#410](https://github.com/schaier-io/epora-wallet/issues/410) | Less first-load JavaScript on `/user` | [#470](https://github.com/schaier-io/epora-wallet/pull/470), [#482](https://github.com/schaier-io/epora-wallet/pull/482), [#488](https://github.com/schaier-io/epora-wallet/pull/488) |
| [#415](https://github.com/schaier-io/epora-wallet/issues/415) | "Clear form" needs a confirm or undo | [#449](https://github.com/schaier-io/epora-wallet/pull/449) |
| [#416](https://github.com/schaier-io/epora-wallet/issues/416) | Setup page: fee in ADA, explain STT, address copy button | [#448](https://github.com/schaier-io/epora-wallet/pull/448) |
| [#419](https://github.com/schaier-io/epora-wallet/issues/419) | Visual consistency with `DESIGN.md` | [#442](https://github.com/schaier-io/epora-wallet/pull/442) |
| [#420](https://github.com/schaier-io/epora-wallet/issues/420) | Discoverable keyboard shortcuts, touch access | [#471](https://github.com/schaier-io/epora-wallet/pull/471) |
| [#421](https://github.com/schaier-io/epora-wallet/issues/421) | Render the landing page directly instead of a redirect | [#454](https://github.com/schaier-io/epora-wallet/pull/454) |
| [#432](https://github.com/schaier-io/epora-wallet/issues/432) | Less duplicate work during transaction building | [#427](https://github.com/schaier-io/epora-wallet/pull/427), [#428](https://github.com/schaier-io/epora-wallet/pull/428) |
| [#502](https://github.com/schaier-io/epora-wallet/issues/502) | `/payee` Lighthouse LCP worse than the rest of the app (was `feasible`) | [#509](https://github.com/schaier-io/epora-wallet/pull/509) |

Tester notes from the September Preprod sessions that already have code on `main` (tx hashes in the e2e file): allowance scaling, witness-set filtering, 30-minute validity window, multisig draft signers, Cardanoscan links, people roster, rebuild validity, address book, review-receipt units.

## Fixed: operations and tooling

Work that came out of running the public prototype.

| Issue | Change | Fix PR |
| --- | --- | --- |
| [#388](https://github.com/schaier-io/epora-wallet/issues/388) | Sentry error monitoring | [#481](https://github.com/schaier-io/epora-wallet/pull/481), [#487](https://github.com/schaier-io/epora-wallet/pull/487) |
| [#393](https://github.com/schaier-io/epora-wallet/issues/393) | Enforce the 750-line file limit in CI | [#451](https://github.com/schaier-io/epora-wallet/pull/451) |
| [#394](https://github.com/schaier-io/epora-wallet/issues/394) | Stalled-indexer detection in `/api/health` | [#472](https://github.com/schaier-io/epora-wallet/pull/472), [#490](https://github.com/schaier-io/epora-wallet/pull/490) |
| [#395](https://github.com/schaier-io/epora-wallet/issues/395) | GitHub issue forms for bugs and feedback | [#473](https://github.com/schaier-io/epora-wallet/pull/473) |
| [#503](https://github.com/schaier-io/epora-wallet/issues/503) | Repair the user-flow helper script | [#510](https://github.com/schaier-io/epora-wallet/pull/510) |
| [#504](https://github.com/schaier-io/epora-wallet/issues/504) | Make agent rules current | [#511](https://github.com/schaier-io/epora-wallet/pull/511) |
| [#505](https://github.com/schaier-io/epora-wallet/issues/505) | Fix stale citations in user-flow | [#512](https://github.com/schaier-io/epora-wallet/pull/512) |
| [#506](https://github.com/schaier-io/epora-wallet/issues/506) | Test the walletUnit filter in proposal listing | [#513](https://github.com/schaier-io/epora-wallet/pull/513), [#523](https://github.com/schaier-io/epora-wallet/pull/523) |
| [#531](https://github.com/schaier-io/epora-wallet/issues/531), [#534](https://github.com/schaier-io/epora-wallet/issues/534) | BetterStack on `/api/health`; filter extension noise from Sentry | [#535](https://github.com/schaier-io/epora-wallet/pull/535), [#536](https://github.com/schaier-io/epora-wallet/pull/536) |

## Feasible

No open issue in this bucket. #502 was the last one and is fixed (see above).

From the e2e notes, still worth a ticket if it reproduces on today's build: dust payouts below min-UTxO, date picker with no visible calendar, Settings button on a membership card that does nothing.

## Next

| Issue | Why later |
| --- | --- |
| [#392](https://github.com/schaier-io/epora-wallet/issues/392) | WalletConnect signing and real-device testing. REPORTED 2026-09-26: Sandro explicitly deferred this work beyond closeout. Closed as deferred, not implemented. The earlier blanket claim about mobile wallet support was not reverified. |

## Not a bug

| Item | Why |
| --- | --- |
| [#422](https://github.com/schaier-io/epora-wallet/issues/422) | Animated background glows are the intended design. |
| [#533](https://github.com/schaier-io/epora-wallet/issues/533) | "Failed to connect to MetaMask" comes from the MetaMask extension script, not epora. Filtered in [#536](https://github.com/schaier-io/epora-wallet/pull/536). |
| One-off proposal DELETE ~3 s after create (3 Sep session) | Not reproduced. Likely a stray Withdraw click in another tab. |
| "Audit wallet" left the smart-wallet list (4 Sep) | Cause not observed. User action, recovery, or indexer closure are all possible. |
| Apex `epora.io` 308-redirects POST to `www.epora.io` | Expected CDN behavior. The sync cron posts to `www.epora.io`. |

## Prototype evidence

- App: [https://epora.io](https://epora.io)
- Health: [https://www.epora.io/api/health](https://www.epora.io/api/health) returned `200` with `"database":"up","indexer":"up"` and `recentHeadFresh: true` on 2026-09-22.
- Validator hashes (from `code/smart-contract/plutus.json`):
  - STT mint/spend: `0dac00be80879dcf585cdb9d0acf6e0ecf52c417ded30d8b72d0ebf1`
  - STT reference store: `fc20070d1e5379403add6acbf77b233b2f8240821c187b398525de28`
  - Wallet (unparameterized): `5f8f25f5b598548b224efba3082ffbdd33f46ec58274282b63d0d701`
- Wallet setup on Preprod (7 Sep 2026, block 5149161): [`676af5c757bc5fea1fa4d9e54a59ff20ba96b98eb452b40a4dda195f8424b709`](https://preprod.cardanoscan.io/transaction/676af5c757bc5fea1fa4d9e54a59ff20ba96b98eb452b40a4dda195f8424b709). It mints one STT under the STT mint policy above and locks it with an inline datum at the STT script address.
