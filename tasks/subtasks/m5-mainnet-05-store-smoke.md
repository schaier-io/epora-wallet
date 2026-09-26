# Mainnet: reference store + small-funds smoke

Mainnet deploy task · [Milestone 5](../milestone-5-mainnet-closeout.md) · after the other mainnet subtasks

First real-ADA transactions. Everything here costs actual money — check amounts before sending, record everything.

## Steps

- [x] Record the deployed reference store, deposit, and transaction. 2026-09-26: the active output holds 63.270800 ADA and the deployment fee was 0.809617 ADA. See the [mainnet evidence](../../docs/closeout/mainnet-evidence.md). The chain proves deployment, not which client submitted it. Correction: the earlier ~5 ADA planning figure was not the observed deposit.
- [ ] Complete every smoke path. Mint, funding, operator spend, and automatic proof-of-life refresh are recorded in the [mainnet evidence](../../docs/closeout/mainnet-evidence.md). A dedicated `RenewProofOfLife` transaction is not established.
- [ ] Compare actual fees against the [economics table](m5-harden-03-economics.md) expectations; surprises get investigated before announcing.
- [x] Write URL, current policy/validator hash, store address, and observed smoke hashes into the milestone evidence. [mainnet-evidence.md](../../docs/closeout/mainnet-evidence.md) and its JSON snapshot contain these values.

## Done when

- Store and smoke wallet exist on mainnet with hashes recorded.
- Observed fees are within expectations, or the discrepancy is understood and written down.
