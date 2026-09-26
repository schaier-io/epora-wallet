# WalletConnect: real-device pass

- [x] Closed as deferred. REPORTED: the user deferred WalletConnect signing and device testing on 2026-09-26. Implementation and device validation are not claimed.

VERIFIED: `origin/main` at `d3b5a239`, `code/dApp/src/lib/mesh/transactions/submit.ts:12`, still takes `BrowserWallet`. The scope below is retained for future work.

WalletConnect signing task · [Milestone 3](../milestone-3-ui-development.md) · after [active signer](m3-wc-03-active-signer.md)

Mock tests prove the plumbing; a phone proves the feature. CIP-45/WalletConnect wallet behavior differs per vendor (response shape, chain ids, session lifetime).

## Deferred scope

- On a real device against preprod: pair via QR, sign a mint, sign an operator spend (Vespr first; add whatever else currently speaks CIP-45/WalletConnect).
- Exercise the submit fallback: make wallet-side submission fail and confirm the server-side proxy picks it up.
- Restart the app and confirm the restored session still signs (session restore exists in the provider. verify it end-to-end).
- Record a wallet/version → works/quirks matrix in the frontend README.

## Acceptance criteria if resumed

- At least one real mobile wallet signs and submits end-to-end on preprod.
- The compatibility matrix is committed.
