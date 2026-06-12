# Feature: dead-man-switch (done)

Frontend dev task (done) · [Milestone 3](../milestone-3-ui-development.md) · Whitepaper: *The dead-man-switch*

## What landed

- [x] Proof-of-life timing editor (unlock time + increment, per-user renewal right) in [wallet-settings-editors.tsx](../../code/dApp/src/components/user/workspace/editors/wallet-settings-editors.tsx) / [focused-wallet-settings-editor.tsx](../../code/dApp/src/components/user/workspace/editors/focused-wallet-settings-editor.tsx), backed by the [state-form.ts](../../code/dApp/src/lib/contracts/state-form.ts) fields.
- [x] Renewal as a guided flow (`renew-proof-of-life` in [flow-config.tsx](../../code/dApp/src/components/user/flow-config.tsx)) through the shared STT-spend engine — no dedicated builder.

## Verified by

- Timing derivation covered by the [state-form](../../code/dApp/src/lib/contracts/state-form.test.ts) tests; walkthrough row 8.
