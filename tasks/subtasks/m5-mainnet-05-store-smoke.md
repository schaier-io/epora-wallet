# Mainnet: reference store + small-funds smoke

Mainnet deploy task · [Milestone 5](../milestone-5-mainnet-closeout.md) · after the other mainnet subtasks

First real-ADA transactions. Everything here costs actual money — check amounts before sending, record everything.

## Steps

- [ ] Sanity-check the reference-store deposit (~5 ada default in [deploy-shared-reference.ts](../../code/dApp/src/lib/mesh/transactions/deploy-shared-reference.ts)) and deploy the store once from the live mainnet UI. Record address + tx hash.
- [ ] Smoke with small real funds: mint a wallet, lock a few ada, one operator spend, one proof-of-life renewal. Record the hashes.
- [ ] Compare actual fees against the [economics table](m5-harden-03-economics.md) expectations; surprises get investigated before announcing.
- [ ] Write URL, validator hashes, store address, and smoke hashes into the milestone evidence.

## Done when

- Store and smoke wallet exist on mainnet with hashes recorded.
- Observed fees are within expectations, or the discrepancy is understood and written down.
