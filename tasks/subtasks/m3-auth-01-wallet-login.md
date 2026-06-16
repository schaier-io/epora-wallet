# Auth: wallet-signature login (bearer token) for the expensive routes

Auth task · [Milestone 3](../milestone-3-ui-development.md)

The proposals sign-in already proves wallet control with a server-issued nonce +
CIP-30 `signData`, then mints an HMAC-signed session in an httpOnly cookie
([auth.ts](../../code/dApp/src/lib/proposals/auth.ts),
[nonce route](../../code/dApp/src/app/api/proposals/auth/nonce/route.ts),
[auth route](../../code/dApp/src/app/api/proposals/auth/route.ts)). That same
pattern should become the app's general login so the wallet key is the identity
everywhere, not just for proposals.

The expensive routes are the ones that burn a provider quota or do real work on
behalf of an unauthenticated caller: the Mesh proxy
([mesh](../../code/dApp/src/app/api/mesh/route.ts)), STT lookup and sync
([lookup](../../code/dApp/src/app/api/stt/lookup/route.ts),
[sync](../../code/dApp/src/app/api/stt/sync/route.ts)), and the chain helpers
([koios](../../code/dApp/src/app/api/koios/credential-utxos/route.ts),
[pools](../../code/dApp/src/app/api/pools/route.ts)). Today `stt/sync` gates on a
single shared `STT_SYNC_SECRET`; the rest are open. Wallet-derived sessions give
us per-identity gating (and a key to attribute abuse to), complementing — not
replacing — the [per-IP rate limits](m3-api-03-rate-limits.md).

The login trigger is the network/preprod confirmation step the user already takes
on connect: have them sign the nonce there, establishing the session in one go
(fold in the terms acceptance from [m3-auth-02](m3-auth-02-terms-acceptance.md)).

## Steps

- [ ] Lift the nonce / token mint / verify helpers out of `lib/proposals/auth.ts`
      into a shared `lib/auth/` module (keep it Next-free so it stays unit-testable);
      have proposals consume the shared module so there is one implementation.
- [ ] Issue the session as a bearer token (JWT or the existing HMAC envelope) that
      works from both the browser (httpOnly cookie) and API clients
      (`Authorization: Bearer`), carrying the payment key hash + address + expiry.
- [ ] Add one server-side guard (middleware or a route helper) that verifies the
      token and rejects with `401` when missing/expired; apply it to the expensive
      routes above. Keep `STT_SYNC_SECRET` as the machine/cron path.
- [ ] WalletConnect users: align with [signData over WC](m3-wc-04-signdata.md) — if
      `cardano_signData` isn't available, say login needs a browser-extension wallet.
- [ ] Unit-test the shared module (nonce binding, expiry, tamper) and add a guard
      test that an unauthenticated call to one expensive route is `401`.

## Done when

- One shared wallet-login module backs both proposals and the expensive routes.
- An unauthenticated request to a provider-quota route is rejected; a valid
  wallet session passes; tests cover both.
