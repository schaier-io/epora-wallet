# Feature: streaming payments (done)

Frontend dev task (done) · [Milestone 3](../milestone-3-ui-development.md) · Whitepaper: *Streaming payments and permission-less settlement*

## What landed

- [x] Payout derivation: [streaming-payout.ts](../../code/dApp/src/lib/contracts/streaming-payout.ts) (accrued delta → tagged outputs) + [payout-address.ts](../../code/dApp/src/lib/contracts/payout-address.ts); crank-cooldown mirror [crank-cooldown.ts](../../code/dApp/src/lib/contracts/crank-cooldown.ts) so the UI won't build a crank the validator would reject.
- [x] Streaming editors [streaming-editors.tsx](../../code/dApp/src/components/user/workspace/editors/streaming-editors.tsx); `manage-streaming-payments` + `payout-streaming-payment` guided flows through the shared engine.

## Verified by

- [crank-cooldown.test.ts](../../code/dApp/src/lib/contracts/crank-cooldown.test.ts); walkthrough rows 10–11.
