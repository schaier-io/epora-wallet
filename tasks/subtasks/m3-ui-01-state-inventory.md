# UI states: inventory + the rules

UI consistency task · [Milestone 3](../milestone-3-ui-development.md)

The pieces exist — [skeleton.tsx](../../code/dApp/src/components/ui/skeleton.tsx), the toast provider, the [error boundary](../../code/dApp/src/components/error-boundary.tsx) — but each surface improvised its own coverage. First map it, and write down the rules the fix-up tasks apply.

## Steps

- [ ] Walk every surface and grid out loading / empty / error coverage: onboarding, landing, dashboard, each `config-*-view.tsx`, review rail, transactions view, wallet dialog, proposals page. The grid lives in the PR description.
- [ ] Write the rules into the frontend README:
  - errors the user can act on → inline (`InlineFieldError`);
  - transient/background failures → toast;
  - render crashes → boundary;
  - provider/chain errors never verbatim — short human message, raw detail collapsed.
- [ ] Blank grid cells become the work lists for [silent catches](m3-ui-02-silent-catches.md), [error presentation](m3-ui-03-error-presentation.md), and [empty/loading states](m3-ui-04-empty-loading.md).

## Done when

- The grid has no unknown cells and the rules are committed.
- Every gap is assigned to one of the three fix-up tasks.
