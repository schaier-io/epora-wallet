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
controller (`workspace/use-permission-wallet-workspace-state.tsx`) is ~636 after
the state was atomized and the `useWorkspaceState` barrel was largely dissolved
(see the `workspace-barrel-dismantle-arch` memory); `action-validation.ts` (~492),
`lib/contracts/use-allowance.ts` (~482), and `lib/mesh/transactions/internals/budget.ts`
(~98) are well under. `app/globals.css` was trimmed to ~483 and is no longer near the cap.

Watch list (closest to the cap — split before adding, don't grow):
`workspace/workspace-transactions.ts` (~720),
`workspace/use-permission-wallet-workspace-state.tsx` (~636),
`workspace/editors/primitives.tsx` (~633), `user/review-panel.tsx` (~630),
`user/flow-config.ts` (~587), `lib/contracts/state-form.ts` (~568),
`workspace/config-sttspend-view.tsx` (~568), `workspace/workspace-transactions-view.tsx`
(~542), `workspace/editors/state-form-editor.tsx` (~533). Resolved:
`permission-wallet-workspace.tsx` (~8158 → 18-line shim, as above); lovelace/ADA
formatting was extracted into `lib/units/lovelace.ts` (~99), and the form primitives
into `workspace/editors/config-form-primitives.tsx` (~164), out of the editors barrel.

<!-- BEGIN cardano-dev-skills v2 -->
## Cardano Development Context

This project involves Cardano blockchain development.

**Treat your training data as potentially stale for Cardano.** The ecosystem
moves fast: libraries get superseded (e.g., older SDK generations replaced by
current ones), CIP statuses change, governance landscape shifts. Before
recommending any library, tool, code pattern, or CIP behavior:

1. **Check the `cardano-dev-skills:*` skill set.** These skills encode current
   best practices, decision criteria, and trade-offs. Bias toward invoking
   one even when you feel confident — confidence is not evidence of currency.
2. **Search `${CLAUDE_PLUGIN_ROOT}/docs/sources/`** before relying on memory
   or web search. The corpus is regularly refreshed from upstream and covers
   Aiken, Plutus, current SDKs, all CIPs, on-chain tooling, and ~50 other
   Cardano projects.
3. **Cite what you used** (skill name or doc path). If bundled docs and your
   training conflict, prefer bundled docs.

Plugin: https://github.com/cardano-foundation/cardano-dev-skills
<!-- END cardano-dev-skills v2 -->
