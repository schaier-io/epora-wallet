# Repo-wide Engineering Rules (AI must follow)

Universal rules for this repository. Domain-specific rules are nested:

- Contracts (Aiken/Plutus): [code/smart-contract/CLAUDE.md](code/smart-contract/CLAUDE.md)

## File length: hard cap 750 lines

- **No source file exceeds 750 lines.** Excluded: test files (`*_tests.ak`,
  `*.test.ts`, `*.test.tsx`, `__tests__/**`), generated files (`plutus.json`,
  `pnpm-lock.yaml`, `*.d.ts`, `next-env.d.ts`, build output), and vendored /
  third-party files dropped in unmodified (e.g. react-bits component CSS like
  `components/ProfileCard.css`). The cap applies to CSS we author ourselves
  (`app/globals.css` is in scope).
- A file approaching the cap is a signal it holds more than one responsibility —
  split by responsibility/concern, not by arbitrary line count. Extract cohesive
  units (a panel's sub-editors, a module's pure helpers, one audit boundary), each
  in its own file.
- The cap is a ceiling, not a target. Contracts use a tighter ~500-line "split by
  concern" signal (see the nested contracts rules); frontend components may run
  larger but still must stay under 750.

### Known existing violations (remediation debt)

**No authored file is currently over the 750-line cap.** The former offenders
were remediated: `permission-wallet-workspace.tsx` (~8158) was decomposed into a
controller hook + per-concern hooks/views/atoms and is now an 18-line shim; the
controller (`workspace/use-permission-wallet-workspace-state.tsx`) is ~663 after
the state was atomized and the `useWorkspaceState` barrel was largely dissolved
(see the `workspace-barrel-dismantle-arch` memory); `action-validation.ts` (~492)
and `review-panel.tsx` (~630) are well under.

Watch list (closest to the cap — split before adding, don't grow): `app/globals.css`
(~748), `workspace/workspace-transactions.ts` (~747), `workspace/editors/primitives.tsx`
(~633), `review-panel.tsx` (~630), `user/flow-config.tsx` (~587), `lib/contracts/state-form.ts`
(~568), `lib/mesh/transactions/internals/budget.ts` (~569),
`workspace/editors/state-form-editor.tsx` (~549), `lib/contracts/use-allowance.ts` (~541).
