# WalletConnect: signData for proposals login

WalletConnect signing task · [Milestone 3](../milestone-3-ui-development.md)

Proposals login is a nonce + CIP-30 `signData` handshake ([auth route](../../code/dApp/src/app/api/proposals/auth/route.ts), [auth.ts](../../code/dApp/src/lib/proposals/auth.ts)). Transaction signing over WalletConnect doesn't cover it — `signData` support varies per mobile wallet.

## Steps

- [ ] Check `cardano_signData` support in the wallets that pass the [device pass](m3-wc-05-device-pass.md).
- [ ] Supported → implement it over the session so WalletConnect users can use proposals.
- [ ] Not supported → the proposals page says plainly that signing in needs a browser-extension wallet; no dead button.
- [ ] Record the decision and the wallet support found at the bottom of this file.

## Done when

- A WalletConnect-only user either logs into proposals or is told why not before trying.
