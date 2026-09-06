# Transition: manage + pay streaming payments (done)

Contract dev task (done) · [Milestone 2](../milestone-2-smart-contract.md) · Whitepaper: *Streaming payments and open settlement*, *Settlement cadence* theorem, *Payout integrity*

## What landed

- [x] Accrual and reserve ([lib/streaming_payments/funding.ak](../../code/smart-contract/lib/streaming_payments/funding.ak)): `expect_remain_funded` on each non-settlement wallet spend requires `output ≥ min(input, owed)` per asset up to the transaction upper bound.
- [x] Payout integrity ([payout.ak](../../code/smart-contract/lib/streaming_payments/payout.ak) `validated_value_change`): progress only increases; tagged outputs reach the configured payee; non-ADA output totals equal the accrued delta, while ADA totals may include submitter-funded minimum-UTxO top-ups; STT value stays equal. `types.output_payout_tag` is the single tag decoder.
- [x] Crank (`eval_pay_streaming_payment`): before the sole final beneficiary's recovery window opens, any listed user, stream payee, or unlocked beneficiary may crank. An admin may also crank. From the exact unlock boundary onward, only an admin or that beneficiary may crank. Every non-admin crank starts at least 30 minutes past the previous stamp inside a one-hour window. The gate uses the earliest bound and the stamp uses the latest bound. Payee cancellation and final-beneficiary recovery share this cadence. After final recovery opens, a payee cancellation must use the exact earliest safe end. Each payment can then advance the shared clock only once. An admin crank bypasses the cooldown and leaves the stamp unchanged.
- [x] The contract sets no fixed positive-schedule payout count. Ledger byte-size and ExUnit limits decide each batch, and a builder can retry fewer schedules.
- [x] `ManageStreamingPayments` is operator-gated. It adds new unsettled payments or reschedules existing end dates through [forwarding.ak](../../code/smart-contract/lib/streaming_payments/forwarding.ak). It cannot drop or otherwise change an existing payment.

VERIFIED correction: the earlier task named the test-only `payout_is_valid` wrapper. The production call is `validated_value_change` at `lib/stt/settlement_handlers.ak:58`.

## Verified by

- [stt_payout_cooldown_tests.ak](../../code/smart-contract/validators/stt_payout_cooldown_tests.ak) covers stakeholder authority, final-beneficiary priority, and the shared cadence. [stt_cancel_streaming_payment_tests.ak](../../code/smart-contract/validators/stt_cancel_streaming_payment_tests.ak) covers exact terminal cancellation and replay rejection. [stt_settlement_tests.ak](../../code/smart-contract/validators/stt_settlement_tests.ak) covers State transitions and payout routing.
- Attack-log: wrong input-reference tag, external-funded tagged output, no-op crank, unlock extension past the increment window.
- Accrual, forwarding, and payout tests live in [funding_tests.ak](../../code/smart-contract/lib/streaming_payments/funding_tests.ak), [forwarding_tests.ak](../../code/smart-contract/lib/streaming_payments/forwarding_tests.ak), and [payout_tests.ak](../../code/smart-contract/lib/streaming_payments/payout_tests.ak).
