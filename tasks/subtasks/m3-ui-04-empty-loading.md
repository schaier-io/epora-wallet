# UI states: zero states + loading accessibility

UI consistency task · [Milestone 3](../milestone-3-ui-development.md) · gaps from [the inventory](m3-ui-01-state-inventory.md)

Known holes: the transactions view renders nothing at zero items; the asset picker shows nothing when no assets are detected. An empty region and a broken region look identical.

## Steps

- [ ] Explicit zero state for every list the grid flagged — transactions ("No activity yet"), asset picker, proposals list, plus whatever else the inventory found. One small shared empty-state component, not per-surface copies.
- [ ] Loading regions get `aria-busy`/`aria-live` — [workspace-transactions-view.tsx](../../code/dApp/src/components/user/workspace/workspace-transactions-view.tsx) already does it right; copy that pattern.

## Done when

- No list view renders blank at zero items.
- Loading regions announce themselves (spot-check with VoiceOver).
