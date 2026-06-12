# Transition: staking & governance entrypoints (done)

Contract dev task (done) · [Milestone 2](../milestone-2-smart-contract.md) · Whitepaper: *Pinning the stake credential*, *Limitations and Trust Assumptions*

## What landed

- [x] [validators/wallet.ak](../../code/smart-contract/validators/wallet.ak) `withdraw` / `publish` / `vote`, all through `eval_governance_operator_use`: the forwarded STT action must equal `RunOperator(path, Use)`; the purpose payloads are ignored — the STT is the only authorization surface.
- [x] No `propose` purpose: a proposal needs only a refundable deposit + spend authorization, funded through the spend path. (Aiken v1.1.22 also crashes compiling 6 purpose handlers — upstream `FreeUnique` bug — so the wallet ships 5.)
- [x] Wallet `mint` hard-fails; the STT script rejects every non-mint/spend purpose.
- [x] Documented consequence (intentional): rewards withdrawal and governance are operator-only — a recovering beneficiary takes the UTxOs, not the reward account.

## Verified by

- [wallet_governance_tests.ak](../../code/smart-contract/validators/wallet_governance_tests.ak) — accept/reject per purpose, `wallet_mint_hard_fails`.
