# Walkthrough: run the script, record the hashes

Feature walkthrough task · [Milestone 3](../milestone-3-ui-development.md) · wallets from [the setup](m3-walk-01-setup.md)

One pass on preprod proving each whitepaper claim works through the guided UI. The same table is the script for the M3 demo video. Action adapters are in [guided-action-adapters.ts](../../code/dApp/src/components/user/guided-action-adapters.ts); sections refer to the current [whitepaper](../../whitepaper/whitepaper.pdf).

## Current evidence

[the wallet UI video](../../docs/assets/wallet-ui.mp4?raw=1) is committed and linked from the repository README.
The earlier combined video/walkthrough TODO did not distinguish publication from full feature validation.
Publication is complete. Completion of the rows below is not determined from that file alone.

26 September 2026: the earlier claim that voting had no guided flow was wrong.
It omitted the implemented `wallet-vote` action.
[The action menu](../../code/dApp/src/components/user/workspace/use-workspace-guided-derivations.ts#L286) exposes it.
[The config view](../../code/dApp/src/components/user/workspace/config-walletvote-view.tsx#L42) renders `GovernanceVotePicker` for action lookup and vote selection.
[The transaction handler](../../code/dApp/src/components/user/workspace/workspace-transactions.ts#L408) calls `buildWalletVoteTx`.
This source inspection verifies implementation, not a completed on-chain walkthrough.

## The script

| # | Feature (whitepaper) | Flow |
|---|---|---|
| 1 | Create wallet — mint STT (§4.2) | `mint` |
| 2 | Fund with no datum (§4.4) | `lock-funds` |
| 3 | Operator send (§5.1) | `use` |
| 4 | Update settings / add people (§5.1) | `update-state` |
| 5 | Multi-sig: propose, co-sign, submit (§5.1) | `use` via the proposals page |
| 6 | Allowance spend within the daily cap (§5.1) | `use-allowance` |
| 7 | Allowance over the cap — must be blocked (§5.1) | `use-allowance` |
| 8 | Renew proof-of-life (§5.2) | `renew-proof-of-life` |
| 9 | Beneficiary withdrawal after lapse (§5.3) | `use-beneficiary` |
| 10 | Set up a streaming payment (§5.4) | `manage-streaming-payments` |
| 11 | Crank pays the stream out (§5.4) | `payout-streaming-payment` |
| 12 | Consolidate, incl. stray-stake sweep (§4.5) | `consolidate-utxo` |
| 13 | Set stake credential + delegate (§4.5) | `set-intended-stake-credential` |
| 14 | Claim staking rewards (§4.5) | `wallet-withdraw` |
| 15 | Governance publish / propose / vote (§4.5) | `wallet-publish`, `wallet-propose`, `wallet-vote` |
| 16 | Remove an access entry (§5.1) | inside `update-state` |
| 17 | Stake diagnostic finds and sweeps orphaned funds (§11) | tools surface |

## Steps

- [ ] Run rows 1–8 and 10–17 on the main wallet, row 9 on the short-deadline wallet. Record the preprod tx hash per row in `walkthrough-results.md` next to this file.
- [ ] Row 7 must fail in the pre-sign review with a readable reason — not a wallet-level error after signing.
- [x] Verify that the governance voting screen and guided `wallet-vote` action are implemented. See the source evidence above. Recording the vote transaction hash remains part of row 15.
- [ ] Anything that forces leaving the guided flow gets an issue; those feed the polish tasks or the M4 fix loop.

## Done when

- Every row has a tx hash or a linked issue in `walkthrough-results.md`.
- The demo video can follow the table top to bottom without improvising.
