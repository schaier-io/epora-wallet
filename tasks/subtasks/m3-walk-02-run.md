# Walkthrough: run the script, record the hashes

Feature walkthrough task · [Milestone 3](../milestone-3-ui-development.md) · wallets from [the setup](m3-walk-01-setup.md)

One pass on preprod proving each whitepaper claim works through the guided UI. The same table is the script for the M3 demo video. Flow ids from [flow-config.tsx](../../code/dApp/src/components/user/flow-config.tsx); sections from the current [whitepaper](../../whitepaper/whitepaper.pdf).

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
| 15 | Governance publish / propose (§4.5) | `wallet-publish`, `wallet-propose` |
| 16 | Remove an access entry (§5.1) | inside `update-state` |
| 17 | Stake diagnostic finds and sweeps orphaned funds (§11) | tools surface |

## Steps

- [ ] Run rows 1–8 and 10–17 on the main wallet, row 9 on the short-deadline wallet. Record the preprod tx hash per row in `walkthrough-results.md` next to this file.
- [ ] Row 7 must fail in the pre-sign review with a readable reason — not a wallet-level error after signing.
- [ ] The on-chain `vote` entrypoint has no guided flow today (only `wallet-publish` and `wallet-propose` exist) — decide whether the demo needs it and note the decision in the results file; if yes, it needs a flow first.
- [ ] Anything that forces leaving the guided flow gets an issue; those feed the polish tasks or the M4 fix loop.

## Done when

- Every row has a tx hash or a linked issue in `walkthrough-results.md`.
- The demo video can follow the table top to bottom without improvising.
