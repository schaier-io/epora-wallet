# Frontend architecture deepening

Date: 2026-08-31

## Scope and evidence

VERIFIED: This design covers five frontend concerns selected by the user after a read-only architecture audit. The work starts from `dev` at `73b31704cd49`.

VERIFIED: The source tree has 401 non-test TypeScript modules and 169 test modules. This count excludes generated files. The isolated worktree was clean before stack creation.

VERIFIED: The repository has no root `CONTEXT.md`, `SPEC.md`, or `docs/adr/` directory. Product language comes from `PRODUCT.md`, `README.md`, task records, and source comments.

INFERRED: Five small vertical slices are easier to review than one combined refactor. Each slice will have its own branch and commit history.

## Stack

The stack order is:

1. `fix/payout-preview-snapshot`
2. `refactor/state-forwarding-transactions`
3. `refactor/proposal-lifecycle`
4. `refactor/wallet-seeding`
5. `refactor/wallet-rules-model`

VERIFIED: `gh stack init --base dev` created these branches in this order. The bottom branch is `fix/payout-preview-snapshot`.

INFERRED: Each branch must remain useful on its own. A branch must not depend on code from a later branch.

## 1. Scheduled payout preview snapshot

VERIFIED: `streamingPaymentPayoutAmountsAtom` changes the transfers derived in `code/dApp/src/components/user/workspace/atoms/workspace-transfer-derivations.atoms.ts:166`. The transaction builder puts those transfers in `payload.extraTransfers` at `code/dApp/src/components/user/workspace/workspace-transactions.ts:233`.

VERIFIED: `computeActionSignature` handles `payout-streaming-payment` through the generic STT branch at `code/dApp/src/components/user/workspace/workspace-action-signature.ts:107`. That signature omits the payout amount map and the derived payout transfers.

VERIFIED: `previewMatchesSelectedAction` compares only the selected action and signature at `code/dApp/src/components/user/use-user-flow-state.ts:87`. The proposal path reuses a matching preview at `code/dApp/src/components/user/workspace/workspace-review-rail-view.tsx:66`.

VERIFIED: The proposal summary reads the current review receipt at `code/dApp/src/components/user/workspace/workspace-navigation.ts:178`. The reused transaction hex and capture can describe an older payout amount.

The payout preparation Module will own the value that identifies a scheduled payout build. Preview identity and builder input must read the same prepared payout transfers. Proposal reuse must rebuild after any payout input changes.

The first test will change only a payout amount and prove that the build identity changes. A second test will cover the proposal reuse decision. Direct submission will keep rebuilding before signing.

## 2. State-forwarding transaction runtime

VERIFIED: Five builders repeat the State input, reference script, continuing output, budget, and diagnostic sequence. The files are `stt-spend.ts`, `set-intended-stake-credential.ts`, `wallet-governance.ts`, `wallet-withdraw.ts`, and `consolidate-utxos.ts` under `code/dApp/src/lib/mesh/transactions/`.

VERIFIED: `code/dApp/src/lib/mesh/transactions/internals/index.ts:1` exports a broad set of internal operations. Transaction builders must know their call order and diagnostic keys.

VERIFIED: `WalletSource` and `TxFetcher` in `code/dApp/src/lib/mesh/tx-context.ts` already support browser and server Adapters. The refactor must preserve these Seams.

The transaction runtime will gain one Module for the shared State-forwarding lifecycle. Action builders will keep action-specific datum changes, redeemers, outputs, and preview copy. The shared Module will own the repeated setup and forwarding order.

Tests will exercise the shared lifecycle through its public Interface. Existing builder tests will continue to cover action-specific behavior. The refactor will not create one generic transaction builder.

## 3. Proposal lifecycle Model

VERIFIED: `code/dApp/src/components/user/proposals/proposal-detail.tsx:50` owns proposal loading, verification, action state, signing, submission, rebuild, withdrawal, and rendering.

VERIFIED: `code/dApp/src/components/user/proposals/use-proposal-orchestration.ts:54` implements the same lifecycle but has no caller. Commit `b6049fb` added a verification request token only to `proposal-detail.tsx`.

The existing orchestration hook will become the one proposal lifecycle Model. It will include the request token and current user-facing error mapping. `ProposalDetail` will render Model state and forward user intent.

Tests will call the Model through a harness. They will cover a late verification result and the four proposal actions. View tests will keep layout and accessible-state checks.

## 4. Selected-wallet form seeding

VERIFIED: `code/dApp/src/components/user/workspace/workspace-navigation.ts:117` registers the setters used by explicit wallet selection. `applyDetectedToken` seeds the action forms at line 197.

VERIFIED: `code/dApp/src/components/user/workspace/use-workspace-wallet-session-effects.ts:85` registers the same setter family. Its default or URL selection effect repeats the seed and reset writes at line 161.

VERIFIED: `code/dApp/src/components/user/workspace/helpers/wallet-session-seeding.ts:17` decides which token needs seeding. It does not perform the shared state change.

A store-backed wallet-seeding Module will own the token-to-form mutation. Explicit selection will keep route history and refresh behavior. Automatic selection will keep deep-link preservation and lifecycle reset policy.

Tests will seed a Jotai store and assert the complete action-form snapshot. One test will switch between two wallets. Existing token-choice tests will remain.

## 5. Wallet-rules draft Model

VERIFIED: `code/dApp/src/components/user/workspace/editors/state-form-editor.tsx:78` mutates `StateFormState` for owners, spenders, recovery contacts, scheduled payments, safety timers, and approval rules.

VERIFIED: `code/dApp/src/components/user/workspace/editors/focused-people-editor.tsx:24` contains contract-facing approval power logic and repeats person creation transitions. Focused wallet and streaming editors contain more `StateFormState` transitions.

VERIFIED: `code/dApp/src/components/user/workspace/helpers/form-state.ts:85` already holds two shared transitions because the full and focused Views had to stay consistent.

The existing form-state logic will become the wallet-rules draft Model. It will own pure transitions shared by full and focused Views. Views will keep labels, layout, local input presentation, and `onChange` forwarding.

Tests will target the pure transitions. View tests will verify that user actions call the Model and render the resulting state.

## Constraints

The work will add no dependency. Every authored source file must stay below 750 lines. Each branch will change only its selected concern.

The transaction refactor will preserve `WalletSource`, `TxFetcher`, public builder functions, and server route behavior. The workspace refactors will preserve the URL-to-atom route Adapter and the current action context.

Each branch will start with a focused failing test when behavior changes. After the branch passes its focused tests, it will run type checking and the relevant wider test group. The top branch will run the full frontend unit and component suites available in the worktree.

No branch will be pushed and no pull request will be opened without a separate user instruction.

## Least confident decisions

1. INFERRED: The State-forwarding lifecycle can use one shared Module without hiding action-specific datum rules. The five builders differ enough that this split needs careful review during implementation.
2. INFERRED: The existing proposal orchestration hook is the shortest base for the Model. Replacing it with a new state machine would add code without current evidence that it is needed.
3. INFERRED: `helpers/form-state.ts` can grow into the wallet-rules Model without a rename. A rename is useful only if the final responsibility is unclear after the transitions move.
4. INFERRED: The payout review receipt may only need the prepared snapshot identity, not a new receipt Interface. The regression test should settle the smallest safe split.
