# Frontend audit fixes

Date: 2026-09-04

## Status and evidence

- VERIFIED: Remote `dev` was `13a3ed15fedd596a4689591ba8f151da1b6da353` when the stacks were created.
- REPORTED: The original audit recorded 99 findings. Its recheck classified 16 as fixed, 4 as partial, 78 as open, and 1 as withdrawn.
- VERIFIED: F-013's concrete Sparkle Easter Egg failure is fixed. The generic bubble-phase focus-trap weakness remains as hardening work.
- VERIFIED: F-098 was incorrect. `state-validation.ts` already rejects duplicate streaming-payment IDs.
- VERIFIED: The shared worktree contains unrelated user edits. All work in this plan uses separate worktrees.

## Goal

Fix every valid finding from the frontend audit. Add a focused regression test for each behavior change. Open draft pull requests against `dev` as small concern-based stacks.

This work does not add new product features. It does not run preprod tests that spend tADA.

## Delivery structure

Six independent stacks keep unrelated concerns separate. Each layer owns one concern and one commit unless a generated catalog requires a second mechanical commit.

### Wallet and shell stack

1. `fix/wallet-provider-lifecycle`: F-001, F-002, F-018.
2. `fix/walletconnect-session-lifecycle`: F-003, F-004, F-005.
3. `fix/modal-overlay-isolation`: F-013 hardening, F-014, and remaining F-015 and F-025 work.
4. `fix/ui-accessibility-fallbacks`: F-009, F-026, F-028, F-067.
5. `fix/app-route-navigation`: F-010 and F-023.

### Workspace execution stack

1. `fix/workspace-route-dispatch`: F-032 through F-035.
2. `fix/workspace-build-supersession`: F-049.
3. `fix/workspace-submit-boundary`: F-044 through F-047.
4. `fix/shared-reference-submit-boundary`: F-050 and F-053.
5. `perf/workspace-actions-context`: F-048.

### Money, payee, and rendering stack

1. `fix/user-facing-error-classification`: F-027.
2. `fix/payee-collect-errors`: F-054 through F-057.
3. `fix/payee-scan-consistency`: F-059 through F-061.
4. `fix/scheduled-rate-precision`: remaining F-065 behavior.
5. `fix/balance-display-rounding`: F-064.
6. `fix/wallet-chart-render-state`: F-040 through F-043.

### Proposal stack

1. `fix/proposal-signout-state`: F-073.
2. `fix/proposal-error-phases`: F-066 and F-072.
3. `fix/proposal-content-provenance`: F-075.

### Contract mirror stack

1. `fix/contract-rule-parity`: F-088, F-090, and F-099.
2. `fix/contract-adapter-strictness`: F-089, F-091, and F-096.
3. `fix/state-form-decoding`: F-092 and F-097.
4. `fix/terminal-recovery-classification`: F-093.
5. `fix/user-flow-helper-contracts`: F-083 and F-095.

### Internationalization stack

1. `chore/remove-dead-action-definition-fields`: F-085.
2. `fix/i18n-client-formats`: F-036, F-037, and F-070.
3. `fix/i18n-layout-copy`: F-011, F-019, F-020, F-022, F-024, F-076, and the layout part of F-094.
4. `fix/i18n-action-catalog`: F-084 and its F-086 entries.
5. `fix/i18n-domain-copy`: F-038, F-039, F-071, remaining F-074, F-077 through F-080, F-082, remaining F-086, and remaining F-094.
6. `fix/i18n-audit-coverage`: F-058, F-069, F-081, and scanner parts of F-074 and F-086.

## Implementation rules

- Start each change with a failing focused test or reproducible static fixture.
- Fix the shared root cause when multiple callers use the same broken path.
- Keep views free of domain logic and mutable domain state.
- Do not add dependencies unless current code and platform APIs cannot solve the problem.
- Keep every authored source file below 750 lines.
- Treat F-086 as a tracking umbrella. Leaf findings own the code changes.
- Keep translated error handling typed. Do not show raw wallet, provider, or database errors.
- Make state-datum decoding fail closed. Do not replace unreadable records with blank records.

## Data and error behavior

- A cancelled wallet connection must invalidate its active attempt and clear its busy state.
- A stale transaction build must return no preview to any submit caller.
- A submitted transaction remains successful when optional local bookkeeping or a follow-up read fails.
- Proposal sign-out clears local session state only after the server accepts sign-out.
- Payee actions preserve safe, translated refusal reasons and use a generic message for unknown errors.
- Proof-of-life validation requires an increment of at least one at input, encode, and datum-validation boundaries.

## Scheduled-payment precision

The datum stores an integer lovelace rate per day. Some weekly or monthly totals cannot map exactly to that value.

Default design: keep the period selector. Treat the daily rate as canonical. Show the effective period amount after integer conversion, and never redisplay a different value as if it were the user's exact input. Tests cover non-divisible weekly and monthly values.

## Verification

Each layer runs focused tests for its files, then:

```text
pnpm typecheck
pnpm lint
```

The internationalization stack also runs `pnpm i18n:check`. Contract layers run `pnpm sync:blueprint:check` and focused contract tests.

Before submission, each stack receives a fresh-eyes review. Findings inside the stack are fixed and reviewed again until clean.

The top of every stack runs the applicable subset of:

```text
pnpm test:unit
pnpm test:components
pnpm typecheck
pnpm lint
pnpm i18n:check
pnpm openapi:check
pnpm build
pnpm audit --audit-level high --prod
```

The full database test requires local PostgreSQL. The preprod E2E suite is excluded because it spends tADA.

## Pull-request rules

- Use `gh stack rebase --upstack` after changing a lower layer.
- Submit draft stacks with `gh stack submit --auto`.
- Verify branch names before every push.
- Inspect outgoing commit authors and messages for prohibited attribution before every push.
- Open no pull request until its focused checks and clean review pass.

## Least confident decisions

1. Keeping the scheduled-payment period selector may still confuse users. Removing it would be simpler but would reduce existing UI behavior.
2. Fail-closed datum decoding can reject an unknown legacy shape. Tests need representative legacy fixtures before the change ships.
3. Popup focus behavior needs browser-level coverage for native selects and portalled popovers. Component tests cannot fully model browser popup ownership.
4. A broad internationalization scanner can flag protocol identifiers. Fixture tests and narrow exclusions must define its trust boundary.
