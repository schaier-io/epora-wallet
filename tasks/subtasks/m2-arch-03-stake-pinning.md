# Architecture: stake-credential pinning (done)

Contract dev task (done) · [Milestone 2](../milestone-2-smart-contract.md) · Whitepaper: *Pinning the stake credential*

## What landed

- [x] `State.intended_stake_credential` (`None` = enterprise) in [lib/state/types.ak](../../code/smart-contract/lib/state/types.ak).
- [x] Every continuing wallet output must carry it inline ([validators/wallet.ak](../../code/smart-contract/validators/wallet.ak) `expect_wallet_outputs_use_intended_stake`); pointer or mismatch rejected. Payee/beneficiary/change outputs unconstrained.
- [x] Wallet input stake credentials remain unrestricted. `Consolidate` accepts any input count that fits the ledger byte-size and ExUnit limits. Its aggregate wallet Value contains at most five native-asset rows on each side.
- [x] Changeable only via [`SetIntendedStakeCredential`](m2-trans-08-set-stake-credential.md); preservation for every other action enforced centrally in `eval_spend`.

## Verified by

- Attack-log: `attack_wallet_spend_cannot_rehome_output_stake_credential`, `attack_non_set_action_cannot_change_intended_stake_credential`; control `security_intentional__wallet_spend_to_intended_stake_succeeds`.
