# Milestone 5 — Mainnet Beta & Closeout

Go live on mainnet as a beta (not externally audited, and we say so), keep fixing, talk to wallet teams if interested, wrap up with the closeout report + video.

## Development tasks

- [x] **Mainnet beta online**: [mainnet.epora.io](https://mainnet.epora.io). VERIFIED 2026-09-26: homepage, health, and OpenAPI returned HTTP 200. See evidence below.
  - [x] [Network configuration implemented](subtasks/m5-mainnet-01-network-config.md). Source inspection and live network checks recorded there; remaining audit checks stay separate.
  - [ ] [Final validator review + frozen hashes](subtasks/m5-mainnet-02-validator-freeze.md)
  - [ ] [Verify production secrets and database isolation](subtasks/m5-mainnet-03-prod-env.md). The live app and indexer checks are complete.
  - [x] [Beta / unaudited notice implemented](subtasks/m5-mainnet-04-beta-banner.md).
  - [ ] [Reference store + small-funds smoke, recorded](subtasks/m5-mainnet-05-store-smoke.md)
- [ ] **Hardening** — notice problems before users report them; survive losing the cache DB.
  - [x] [Health endpoint implemented and responding](subtasks/m5-harden-01-health-alerts.md).
  - [ ] [Verify mainnet monitoring and the deliberate alert drill](subtasks/m5-harden-01-health-alerts.md).
  - [ ] [Backups + restore drill + from-zero re-index, timed](subtasks/m5-harden-02-backups-drill.md)
  - [ ] [Mainnet economics table (fees, min-ADA, consolidation under 16 KB)](subtasks/m5-harden-03-economics.md)
  - [ ] [Abuse caps — sync triggers, proposal bounds, pruning](subtasks/m5-harden-04-abuse-caps.md)
  - [x] [Review testnet carry-overs](subtasks/m5-harden-05-carryovers.md): WalletConnect is explicitly deferred beyond closeout.

## Non-development tasks

- [x] Display the unaudited-beta notice in the UI and document beta risks. See the [notice evidence](subtasks/m5-mainnet-04-beta-banner.md).
- [ ] Record the public beta announcement.
- [ ] Keep sorting feedback/bugs.
- [x] Wallet-integration thread + talk to interested devs: [outreach record](../docs/wallet-integration.md).
- [x] Review the closeout report and A-E submission against the approved requirements. VERIFIED 2026-09-26: see the [submission review](../docs/closeout/submission-review.md). Publication on `main` and Catalyst acceptance are separate steps.
- [x] Closeout video link supplied: [watch on YouTube](https://youtu.be/XKyZoa02kag). REPORTED by Sandro on 26 September 2026. This records the supplied link, not Catalyst approval.

## Acceptance criteria (Catalyst)

- A working mainnet prototype
- Feedback / bugs, categorized
- Some communication with wallet developers (if they or the community ask for it)
- The closeout report and video

## Evidence

- [Confirmed mainnet transactions, balances, actual fees, and limits](../docs/closeout/mainnet-evidence.md)
- [Plain-text A-E submission](../docs/closeout/milestone-5-submission.txt)
- [Submission review and approved format references](../docs/closeout/submission-review.md)

- [Mainnet prototype](https://mainnet.epora.io)
- Validator freeze record at `af80c6fc`: [docs/mainnet-beta-release.md](../docs/mainnet-beta-release.md#release-freeze-validator-blueprint)
- [Categorized feedback](../docs/testnet-feedback.md)
- [Wallet-integration discussion](../docs/wallet-integration.md)
- [Closeout report (PDF)](../docs/closeout/closeout-report.pdf)
- [Closeout video](https://youtu.be/XKyZoa02kag)

### Live deployment check (2026-09-26)

VERIFIED with public GET requests:

| Endpoint | Result |
| --- | --- |
| `https://mainnet.epora.io/` | HTTP 200 |
| `https://mainnet.epora.io/api/health` | HTTP 200; `"status":"ok","checks":{"database":"up","indexer":"up"}` at `2026-09-26T00:38:39.102Z` |
| `https://mainnet.epora.io/api/v1/openapi.json` | HTTP 200; description says `**Network.** mainnet.` |
| `https://www.epora.io/api/health` | HTTP 200; `"status":"ok","checks":{"database":"up","indexer":"up"}` at `2026-09-26T00:39:26.996Z` |

Both health responses had `recentHeadFresh: true`, `walletReconcileFresh: true`, and `historyBackfillCompleted: true`.
VERIFIED in the browser: mainnet displayed `Mainnet Real funds` and the unaudited-beta risk acknowledgement.
No acknowledgement was accepted and no wallet was connected.

This corrects the earlier open launch status. These checks establish HTTP availability and reported database/indexer health.
They do not establish database isolation, completed backup drills, transaction success, or measured fees.
The relevant operational tasks retain those checks.

### Mainnet transaction evidence added (2026-09-26)

VERIFIED: the [mainnet evidence](../docs/closeout/mainnet-evidence.md) records eight confirmed transactions, two current-policy wallets, and measured fees. This resolves the earlier lack of recorded transaction evidence. Dedicated manual renewal, full economics coverage, and recovery drills remain open. The earlier HTTP-only check above remains a historical record.
