# Onboarding: visible feedback links

Onboarding & observability task · [Milestone 4](../milestone-4-testnet-feedback.md)

Discord and X links exist only in JSON-LD metadata ([layout.tsx](../../code/dApp/src/app/layout.tsx)) — invisible to humans. The visible [footer](../../code/dApp/src/components/layout/site-footer.tsx) links Catalyst only. Feedback is the whole point of M4; the door has to be visible.

## Steps

- [ ] Footer gets the Discord invite and a GitHub issues link, on every page.
- [ ] The error states from the M3 consistency pass mention where to report ("If this keeps happening — Discord/issues link"), so a stuck tester doesn't have to hunt.

## Done when

- Discord + issues reachable from every page without scrolling into metadata.
- A visible report path exists from an error state.
