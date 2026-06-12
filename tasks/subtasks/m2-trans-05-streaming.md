# Transition: manage + pay streaming payments (done)

Contract dev task (done) · [Milestone 2](../milestone-2-smart-contract.md) · Whitepaper: *Streaming payments and permission-less settlement*, *Settlement cadence* theorem, *Payout integrity*

## What landed

- [x] Accrual + reserve ([lib/streaming_payments/funding.ak](../../code/smart-contract/lib/streaming_payments/funding.ak)): `expect_remain_funded` on every wallet spend — `output ≥ min(input, owed)` per asset up to the tx upper bound.
- [x] Payout integrity ([payout.ak](../../code/smart-contract/lib/streaming_payments/payout.ak) `payout_is_valid`): progress only increases; tagged outputs to the configured payee sum to exactly the accrued delta; STT value preserved. `types.output_payout_tag` is the single tag decoder.
- [x] Crank (`eval_pay_streaming_payment`): permissionless; no-op rejected; an unauthorized crank starts ≥ 30 min past the previous stamp inside a ≤ 1 h window (gate = earliest bound, stamp = latest bound — [lib/constants.ak](../../code/smart-contract/lib/constants.ak)). Authorized cranks bypass and don't stamp.
- [x] `ManageStreamingPayments` (operator-gated) edits via [forwarding.ak](../../code/smart-contract/lib/streaming_payments/forwarding.ak); payments exist from mint only — no later add.

## Verified by

- [stt_payout_cooldown_tests.ak](../../code/smart-contract/validators/stt_payout_cooldown_tests.ak) — 7 `fail` tests; [stt_beneficiary_streaming_tests.ak](../../code/smart-contract/validators/stt_beneficiary_streaming_tests.ak) — 9.
- Attack-log: wrong input-reference tag, external-funded tagged output, no-op crank, unlock extension past the increment window.
- Accrual property tests in [streaming_payments_tests.ak](../../code/smart-contract/lib/streaming_payments/streaming_payments_tests.ak).
