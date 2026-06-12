# Architecture: the two-validator handshake (done)

Contract dev task (done) · [Milestone 2](../milestone-2-smart-contract.md) · Whitepaper: *State-thread token and the two-validator handshake*, *Why two contracts*, *Bounded movement* theorem

## What landed

- [x] STT side ([validators/stt.ak](../../code/smart-contract/validators/stt.ak)): `eval_spend` builds a `TransitionContext` ([lib/stt/io.ak](../../code/smart-contract/lib/stt/io.ak) — exactly one STT input and continuing output) and dispatches to the per-action `eval_*` bodies in [lib/stt/spend_handlers.ak](../../code/smart-contract/lib/stt/spend_handlers.ak).
- [x] Cross-cutting gates once in `eval_spend`: stake credential and crank stamp preserved outside their dedicated actions; no reference script on the forwarded STT outside the admin carve-out.
- [x] Wallet side ([validators/wallet.ak](../../code/smart-contract/validators/wallet.ak)): reads the STT's own spend redeemer out of the tx, then [lib/wallet/rules.ak](../../code/smart-contract/lib/wallet/rules.ak) `stt_action_allows_spend` bounds the wallet's value delta by that action. Value aggregates by payment credential.
- [x] Per-action state diffs pinned by `state_unchanged_except_*` ([lib/stt/preservation.ak](../../code/smart-contract/lib/stt/preservation.ak)).
- [x] Co-firing containment: every STT branch is safe without the wallet validator firing.

## Verified by

- [guard_isolation_tests.ak](../../code/smart-contract/validators/guard_isolation_tests.ak) — 15 `fail` tests on the gates + containment.
- [stt_spend_io_tests.ak](../../code/smart-contract/validators/stt_spend_io_tests.ak), [stt_spend_value_tests.ak](../../code/smart-contract/validators/stt_spend_value_tests.ak), [wallet_spend_tests.ak](../../code/smart-contract/validators/wallet_spend_tests.ak), [wallet_rule_tests.ak](../../code/smart-contract/validators/wallet_rule_tests.ak).
