# Hardening: mainnet economics sanity-check

Hardening task · [Milestone 5](../milestone-5-mainnet-closeout.md)

Testnet tolerates waste; mainnet doesn't. Fees, min-ADA, and transaction-size limits need real numbers, measured, written down.

## Steps

- [ ] Fee table: actual cost per transition (mint, operator use, allowance, renew, beneficiary, streaming crank, consolidate, set-stake, withdraw) — the execution-unit estimation lives in [budget.ts](../../code/dApp/src/lib/mesh/transactions/internals/budget.ts). Measure on mainnet, not from estimates.
- [ ] Min-ADA on multi-asset outputs: a wallet holding several native tokens — confirm change and payout outputs clear min-ADA without surprising the user.
- [ ] The fragmented-wallet case: deliberately split a test wallet into many UTxOs, then confirm `consolidate-utxo` clears it within the 16 KB transaction cap (`CARDANO_MAX_TX_SIZE_BYTES`) — possibly over multiple rounds; document how many UTxOs fit per round.
- [ ] Table goes in the repo docs and feeds user-facing fee hints if numbers warrant it.

## Done when

- The table is committed with measured mainnet values.
- The fragmented wallet was actually consolidated on mainnet; rounds and limits documented.
