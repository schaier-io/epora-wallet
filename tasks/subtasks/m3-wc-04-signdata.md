# WalletConnect: signData for proposals login

- [x] Closed as deferred. WalletConnect signing and device testing were deferred on 2026-09-26. WalletConnect signing remains unimplemented. Device validation remains deferred.

`origin/main` at `d3b5a239`, `code/dApp/src/lib/mesh/transactions/submit.ts:12`, still takes `BrowserWallet`. The scope below is retained for future work.

WalletConnect signing task · [Milestone 3](../milestone-3-ui-development.md)

Proposals login is a nonce + CIP-30 `signData` handshake ([auth route](../../code/dApp/src/app/api/proposals/auth/route.ts), [auth.ts](../../code/dApp/src/lib/proposals/auth.ts)). Transaction signing over WalletConnect doesn't cover it. `signData` support varies per mobile wallet.

## Deferred scope

- Check `cardano_signData` support in the wallets that pass the [device pass](m3-wc-05-device-pass.md).
- Supported → implement it over the session so WalletConnect users can use proposals.
- Not supported → the proposals page says plainly that signing in needs a browser-extension wallet; no dead button.
- Record the decision and the wallet support found at the bottom of this file.

## Acceptance criteria if resumed

- A WalletConnect-only user either logs into proposals or is told why not before trying.
