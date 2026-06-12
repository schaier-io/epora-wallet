# Feature: owners, allowances & multi-sig (done)

Frontend dev task (done) · [Milestone 3](../milestone-3-ui-development.md) · Whitepaper: *Owners, allowances, and multi-signature*

## What landed

- [x] Governance builder: users, admin flags, multisig powers/threshold, per-day allowances in [state-form.ts](../../code/dApp/src/lib/contracts/state-form.ts); user editors [people-editors.tsx](../../code/dApp/src/components/user/workspace/editors/people-editors.tsx) / [focused-people-editor.tsx](../../code/dApp/src/components/user/workspace/editors/focused-people-editor.tsx).
- [x] Allowance derivation [use-allowance.ts](../../code/dApp/src/lib/contracts/use-allowance.ts); access removal [access-removal.ts](../../code/dApp/src/lib/contracts/access-removal.ts); operator spend through the engine ([wallet-spend.ts](../../code/dApp/src/lib/mesh/transactions/wallet-spend.ts)).
- [x] Multisig co-sign: proposals subsystem — [lib/proposals/](../../code/dApp/src/lib/proposals) (assemble, rebuild, serialization, auth/verify, store), [api/proposals/*](../../code/dApp/src/app/api/proposals/route.ts), [/user/proposals](../../code/dApp/src/app/user/proposals/page.tsx) page.

## Verified by

- [state-form](../../code/dApp/src/lib/contracts/state-form.test.ts), [state-validation](../../code/dApp/src/lib/contracts/state-validation.test.ts), [state-derivation](../../code/dApp/src/lib/contracts/state-derivation.test.ts) tests; proposals [auth](../../code/dApp/src/lib/proposals/auth.test.ts) + [serialization](../../code/dApp/src/lib/proposals/serialization.test.ts) tests; walkthrough rows 3–7, 16.
