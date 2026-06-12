# UI states: surface the silent catches

UI consistency task · [Milestone 3](../milestone-3-ui-development.md)

Several failures currently vanish: the user acts, nothing happens, no message. Known offenders:

- Clipboard write in [use-copy-feedback.ts](../../code/dApp/src/components/user/workspace/use-copy-feedback.ts) — copy fails, button still says copied.
- Policy-id fetch in [use-workspace-post-submit-effects.ts](../../code/dApp/src/components/user/workspace/use-workspace-post-submit-effects.ts) — nulled without feedback.
- Derivation rebuild in [use-workspace-wallet-derivations.ts](../../code/dApp/src/components/user/workspace/use-workspace-wallet-derivations.ts) — swallowed.

## Steps

- [ ] Fix the three above: surface per the rules (toast or inline), or degrade visibly.
- [ ] Audit the rest: `grep -rn "catch {" code/dApp/src/components/user/workspace` plus empty `catch (_)`. Each hit either surfaces the failure or carries a one-line justification comment for why silence is correct there.

## Done when

- The grep returns only hits with a justification comment beside them.
- A failed clipboard copy visibly says so.
