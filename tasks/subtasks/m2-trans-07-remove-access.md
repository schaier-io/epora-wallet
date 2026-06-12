# Transition: remove access entry (done)

Contract dev task (done) · [Milestone 2](../milestone-2-smart-contract.md) · Whitepaper: *Bounded execution cost*, *Recovery reachability*

## What landed

- [x] `RemoveAccessIndex(UserIndex | BeneficiaryIndex)` removes one entry by index, resolved against the exact STT input ([lib/state/types.ak](../../code/smart-contract/lib/state/types.ak)).
- [x] Skips the super-linear full validation; still runs the recovery-reachability check ([spend_handlers](../../code/smart-contract/lib/stt/spend_handlers.ak) `eval_remove_access_index`). No wallet spend.
- [x] Cap-exempt (an over-cap wallet can always shrink); no cheap "add" counterpart — growth only via `UpdateState`, the most expensive transition.

## Verified by

- [remove_access_index_tests.ak](../../code/smart-contract/validators/remove_access_index_tests.ak) — removal per list, `remove_access_index_can_shrink_an_over_cap_user_list`, `remove_access_index_cannot_remove_last_reachable_path`, `remove_access_index_requires_operator_authority`.
