# UI states: error presentation + the unbounded mint poll

UI consistency task · [Milestone 3](../milestone-3-ui-development.md) · rules from [the inventory](m3-ui-01-state-inventory.md)

Two ways errors mishandle today: raw provider strings reach the DOM (e.g. activity loading in [use-wallet-activity.ts](../../code/dApp/src/components/user/workspace/use-wallet-activity.ts) renders `error.message` as-is), and the mint-confirmation poll in [workspace-flow-handlers.ts](../../code/dApp/src/components/user/workspace/workspace-flow-handlers.ts) retries forever with no way out.

## Steps

- [ ] A small error-mapping helper: provider/chain errors → short human message, raw text collapsed behind a details expander. Apply it everywhere the grid found raw `error.message`.
- [ ] Bound the mint poll: a max wait, then "taking longer than usual" with a manual retry — the tx may still confirm; say that instead of spinning silently.

## Done when

- No raw provider `error.message` reaches the DOM (checked against the inventory grid).
- The mint poll times out into a retryable state instead of looping forever.
