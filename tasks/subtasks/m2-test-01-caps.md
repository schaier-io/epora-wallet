# Limits: access-list and inner-collection caps (done)

Contract dev task (done) · [Milestone 2](../milestone-2-smart-contract.md) · Whitepaper: *Bounded execution cost*

## What landed

- [x] One source of truth, [lib/constants.ak](../../code/smart-contract/lib/constants.ak): `max_users 15` (owners/spenders/keepers share it), `max_beneficiaries 25`, `max_streaming_payments 25`.
- [x] Inner caps (datums cheap to create, expensive to decode): `max_wallets_per_user 10`, `max_beneficiary_wallets 10`, `max_allowance_entries 10` (config + spend paths), `max_wallet_name_bytes 32`.
- [x] Enforced at mint and `UpdateState` (`expect_valid_state_configuration`, `shape.expect_valid`); mirrored off-chain in the dApp's `state-validation.ts`.
- [x] Growth-cost ordering: adds only via `UpdateState`; [`RemoveAccessIndex`](m2-trans-07-remove-access.md) is cap-exempt.

## Verified by

- [config_cap_tests.ak](../../code/smart-contract/validators/config_cap_tests.ak) — 8 `fail` tests (each cap breached) + at-cap accepting cases.
