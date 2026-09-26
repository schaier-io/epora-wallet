# WalletConnect: extract the signer interface

- [x] Closed as deferred. REPORTED: the user deferred WalletConnect signing and device testing on 2026-09-26. Implementation and device validation are not claimed.

VERIFIED: `origin/main` at `d3b5a239`, `code/dApp/src/lib/mesh/transactions/submit.ts:12`, still takes `BrowserWallet`. The scope below is retained for future work.

WalletConnect signing task · [Milestone 3](../milestone-3-ui-development.md)

Correction, 2026-09-26: the earlier plan said `submit.ts` only calls `signTx` and `submitTx`. VERIFIED: `origin/main` at `d3b5a239`, `submit.ts:20`, also calls `getNetworkId`. Any future signer interface must preserve that network check. WalletConnect signing remains deferred.

## Deferred scope

- Define `TxSigner`: `getNetworkId()`, `signTx(unsignedTxHex, partial)`, and `submitTx(signedTxHex)`. `BrowserWallet` satisfies it structurally.
- `signAndSubmitTx` takes `TxSigner`; export the witness-set-vs-full-tx response parsing so other signers can reuse it.
- Update [workspace-transactions.ts](../../code/dApp/src/components/user/workspace/workspace-transactions.ts) and [use-shared-stt-reference.ts](../../code/dApp/src/components/user/workspace/use-shared-stt-reference.ts) to the new type.

## Acceptance criteria if resumed

- `submit.ts` no longer imports `BrowserWallet`.
- CIP-30 regression pass: mint + operator spend behave exactly as before.
