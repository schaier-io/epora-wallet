# Feature: streaming payments (done)

Frontend dev task (done) · [Milestone 3](../milestone-3-ui-development.md) · Whitepaper: *Streaming payments and open settlement*

## What landed

- [x] Payout derivation: [streaming-payout.ts](../../code/dApp/src/lib/contracts/streaming-payout.ts) maps each accrued delta to tagged outputs. [payout-address.ts](../../code/dApp/src/lib/contracts/payout-address.ts) validates each destination.
- [x] [crank-cooldown.ts](../../code/dApp/src/lib/contracts/crank-cooldown.ts) mirrors the phase-aware authority and cadence rules. The UI does not build a payout that the validator would reject.
- [x] Streaming editors [streaming-editors.tsx](../../code/dApp/src/components/user/workspace/editors/streaming-editors.tsx); `manage-streaming-payments` + `payout-streaming-payment` guided flows through the shared engine.

## Verified by

- [crank-cooldown.test.ts](../../code/dApp/src/lib/contracts/crank-cooldown.test.ts); walkthrough rows 10–11.
