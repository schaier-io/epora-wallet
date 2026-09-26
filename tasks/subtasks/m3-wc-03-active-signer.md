# WalletConnect: active-signer selection + UI

- [x] Closed as deferred. REPORTED: the user deferred WalletConnect signing and device testing on 2026-09-26. Implementation and device validation are not claimed.

VERIFIED: `origin/main` at `d3b5a239`, `code/dApp/src/lib/mesh/transactions/submit.ts:12`, still takes `BrowserWallet`. The scope below is retained for future work.

WalletConnect signing task · [Milestone 3](../milestone-3-ui-development.md) · after [the signer](m3-wc-02-walletconnect-signer.md)

Correction, 2026-09-26: the earlier description assumed both connection paths already provided signers. VERIFIED: `submit.ts:12` still accepts `BrowserWallet`. The second signer is future work.

## Deferred scope

- `use-active-signer` hook: the CIP-30 `activeWallet` when connected, otherwise the WalletConnect session's signer when paired, plus a source tag (`"extension" | "walletconnect"`).
- Both call sites consume the hook instead of `activeWallet` directly.
- The pre-sign review shows which signer will be asked. people with both an extension and a paired phone should not have to guess where the prompt lands.
- Remove the "Mobile signing is in preview" copy in [wallet-connect-section.tsx](../../code/dApp/src/components/layout/wallet-connect-section.tsx).

## Acceptance criteria if resumed

- Extension connected → CIP-30 signs. No extension, session paired → the phone signs.
- The review panel names the signer before the prompt fires.
- Preview copy gone.
