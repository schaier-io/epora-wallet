# WalletConnect: active-signer selection + UI

WalletConnect signing task · [Milestone 3](../milestone-3-ui-development.md) · after [the signer](m3-wc-02-walletconnect-signer.md)

Two connection paths now produce a signer; the workspace needs exactly one, and the user needs to know which.

## Steps

- [ ] `use-active-signer` hook: the CIP-30 `activeWallet` when connected, otherwise the WalletConnect session's signer when paired, plus a source tag (`"extension" | "walletconnect"`).
- [ ] Both call sites consume the hook instead of `activeWallet` directly.
- [ ] The pre-sign review shows which signer will be asked — people with both an extension and a paired phone should not have to guess where the prompt lands.
- [ ] Remove the "Mobile signing is in preview" copy in [wallet-connect-section.tsx](../../code/dApp/src/components/layout/wallet-connect-section.tsx).

## Done when

- Extension connected → CIP-30 signs. No extension, session paired → the phone signs.
- The review panel names the signer before the prompt fires.
- Preview copy gone.
