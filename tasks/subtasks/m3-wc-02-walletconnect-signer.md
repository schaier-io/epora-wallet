# WalletConnect: implement the session-backed signer

WalletConnect signing task · [Milestone 3](../milestone-3-ui-development.md) · after [signer interface](m3-wc-01-signer-interface.md)

[client.ts](../../code/dApp/src/lib/walletconnect/client.ts) declares `cardano_signTx`/`cardano_submitTx` in the `cip34` namespace but nothing ever calls them. The paired session ([walletconnect-provider.tsx](../../code/dApp/src/providers/walletconnect-provider.tsx)) is UI state only.

## Steps

- [ ] `src/lib/walletconnect/signer.ts`: a `TxSigner` over `client.request({ topic, chainId, request: { method: "cardano_signTx", params } })` against the stored session.
- [ ] Responses vary by wallet — witness set or full signed tx. Reuse the parsing exported from `submit.ts`; don't duplicate it.
- [ ] Network guard: throw before requesting when the session's chain id isn't the app network (preprod).
- [ ] `submitTx`: try `cardano_submitTx` over the session; on failure throw a distinct error so the caller falls back to the server-side Blockfrost proxy, same as the CIP-30 path.

## Done when

- Unit tests (mock sign client) cover: witness-set response, full-tx response, wrong-network rejection, submit fallback signal.
