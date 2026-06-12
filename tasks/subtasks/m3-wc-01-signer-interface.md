# WalletConnect: extract the signer interface

WalletConnect signing task · [Milestone 3](../milestone-3-ui-development.md)

`signAndSubmitTx(wallet, txHex)` in [submit.ts](../../code/dApp/src/lib/mesh/transactions/submit.ts) takes a Mesh `BrowserWallet`, but only ever calls `signTx` and `submitTx` on it. As long as the type is `BrowserWallet`, nothing but CIP-30 can sign. Pure refactor, no behavior change — lands alone so the regression surface is clean.

## Steps

- [ ] Define `TxSigner`: `signTx(unsignedTxHex, partial)` + `submitTx(signedTxHex)`. `BrowserWallet` satisfies it structurally.
- [ ] `signAndSubmitTx` takes `TxSigner`; export the witness-set-vs-full-tx response parsing so other signers can reuse it.
- [ ] Update the two call sites — [workspace-transactions.ts](../../code/dApp/src/components/user/workspace/workspace-transactions.ts) and [use-shared-stt-reference.ts](../../code/dApp/src/components/user/workspace/use-shared-stt-reference.ts) — to the new type.

## Done when

- `submit.ts` no longer imports `BrowserWallet`.
- CIP-30 regression pass: mint + operator spend behave exactly as before.
