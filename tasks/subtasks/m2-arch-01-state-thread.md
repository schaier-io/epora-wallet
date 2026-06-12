# Architecture: the State and its thread token (done)

Contract dev task (done) · [Milestone 2](../milestone-2-smart-contract.md) · Whitepaper: *Features as configuration*, *Single state thread* theorem

## What landed

- [x] `State` in [lib/state/types.ak](../../code/smart-contract/lib/state/types.ak) — access (users, multisig threshold, beneficiaries), proof-of-life, streaming payments, wallet name, intended stake credential, crank stamp. The STT datum is the `State` itself, no wrapper; `SttAction` covers every transition.
- [x] Mint ([validators/stt.ak](../../code/smart-contract/validators/stt.ak) `eval_mint`) — token name derived from a consumed input, mint pinned to exactly one name × quantity 1, continuing output passes full configuration validation.
- [x] `last_permissionless_payout_at` forced to `None` at mint — no pre-seeded cooldown stamp.

## Verified by

- [stt_mint_tests.ak](../../code/smart-contract/validators/stt_mint_tests.ak) — 10 `fail` rejections + accepting cases.
- `expect_single_stt_io` cases in [stt_spend_io_tests.ak](../../code/smart-contract/validators/stt_spend_io_tests.ak).
