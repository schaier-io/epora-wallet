# Platform: contract binding (done)

Frontend dev task (done) · [Milestone 3](../milestone-3-ui-development.md) · Whitepaper: *Implementation*

## What landed

- [x] Blueprint load + parameterization in [lib/contracts/blueprint.ts](../../code/dApp/src/lib/contracts/blueprint.ts) — consumes the synced `plutus.json`, no hand-embedded script bytes.
- [x] Codecs: [stt-datum.ts](../../code/dApp/src/lib/contracts/stt-datum.ts) (`State`), [action-data.ts](../../code/dApp/src/lib/contracts/action-data.ts) (`SttAction`), [value-data.ts](../../code/dApp/src/lib/contracts/value-data.ts) (value encoding).
- [x] Form derivation: [state-form.ts](../../code/dApp/src/lib/contracts/state-form.ts) + [state-form-encode.ts](../../code/dApp/src/lib/contracts/state-form-encode.ts) + [state-layout.ts](../../code/dApp/src/lib/contracts/state-layout.ts); validation mirror [state-validation.ts](../../code/dApp/src/lib/contracts/state-validation.ts) (+ records).
- [x] Per-action derivations: [use-allowance.ts](../../code/dApp/src/lib/contracts/use-allowance.ts), [access-removal.ts](../../code/dApp/src/lib/contracts/access-removal.ts), [streaming-payout.ts](../../code/dApp/src/lib/contracts/streaming-payout.ts), [crank-cooldown.ts](../../code/dApp/src/lib/contracts/crank-cooldown.ts).

## Verified by

- [lib/contracts](../../code/dApp/src/lib/contracts) tests: action-data, value-data, state-form, state-derivation, state-validation, crank-cooldown; [constants-parity.test.ts](../../code/dApp/src/lib/contracts/constants-parity.test.ts) pins the off-chain caps to `lib/constants.ak`.
