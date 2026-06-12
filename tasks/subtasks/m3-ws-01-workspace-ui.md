# Workspace: the workspace UI (done)

Frontend dev task (done) · [Milestone 3](../milestone-3-ui-development.md)

## What landed

- [x] `/user` workspace: connect, state overview ([wallet-hero-card](../../code/dApp/src/components/user/wallet-hero-card.tsx), membership, [locked-assets-panel](../../code/dApp/src/components/user/locked-assets-panel.tsx), [wealth-chart](../../code/dApp/src/components/user/wealth-chart.tsx)), editors.
- [x] Guided action flow: flows declared in [flow-config.tsx](../../code/dApp/src/components/user/flow-config.tsx), fields in [editors/guided-fields.tsx](../../code/dApp/src/components/user/workspace/editors/guided-fields.tsx), pre-sign review in [review-panel.tsx](../../code/dApp/src/components/user/review-panel.tsx) (+ parts/sections).
- [x] Activity timeline: [recent-activity-timeline.tsx](../../code/dApp/src/components/user/recent-activity-timeline.tsx) + [use-wallet-activity.ts](../../code/dApp/src/components/user/workspace/use-wallet-activity.ts).
- [x] Architecture after the god-component decomposition: [permission-wallet-workspace.tsx](../../code/dApp/src/components/user/permission-wallet-workspace.tsx) is an 18-line shim → controller [use-permission-wallet-workspace-state.tsx](../../code/dApp/src/components/user/workspace/use-permission-wallet-workspace-state.tsx) + per-concern `use-workspace-*` hooks + jotai [atoms/](../../code/dApp/src/components/user/workspace/atoms) + `config-*-view` views.

## Verified by

- [transaction-flow.atoms.test.ts](../../code/dApp/src/components/user/workspace/atoms/transaction-flow.atoms.test.ts); the per-feature walkthrough ([m3-walk-02](m3-walk-02-run.md)) runs entirely through this UI.
