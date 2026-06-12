# Onboarding: faucet pointer + pre-flight hints

Onboarding & observability task · [Milestone 4](../milestone-4-testnet-feedback.md)

A tester with an empty wallet is stuck before the first click, and nothing in the app says where preprod tADA comes from.

## Steps

- [ ] Link the [preprod faucet](https://docs.cardano.org/cardano-testnets/tools/faucet) from the onboarding view ([workspace-onboarding-view.tsx](../../code/dApp/src/components/user/workspace/workspace-onboarding-view.tsx)) and from `lock-funds` (Add funds) when the connected wallet holds no tADA.
- [ ] Pre-flight hints on onboarding: no CIP-30 wallet detected → name a few (the wallet list already exists in the view); wallet on the wrong network → say it must be preprod, not a generic failure.

## Done when

- A fresh tester gets from landing to a funded wallet using only in-app pointers — watch one try, don't assume.
- Wrong-network connection produces a specific message, not a dead end.
