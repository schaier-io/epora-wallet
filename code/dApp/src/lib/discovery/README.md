# Wallet UTxO discovery (orphan / "Franken" address check)

A diagnostic that finds wallet funds resting at a stake credential other than
the wallet's intended one — and offers to sweep them back. This is the
"stake-credential diagnostic" of the whitepaper's *Implementation* section; the
on-chain rule it complements is described under *Pinning the stake credential*
in [whitepaper.pdf](../../../../../whitepaper/whitepaper.pdf).

## Why

A Cardano address pairs a **payment** credential (governs spending) with an
independent **stake** credential (governs delegation + rewards). Anyone can
deposit to the wallet's payment credential under any stake credential (a
"Frankenstein" address), and funds can also drift there from an outdated address.
On-chain, the wallet validator pins every *continuing* wallet output to
`State.intended_stake_credential`, so such funds can always be swept back. This
module is the *read* side: it **finds** them.

The app's normal provider (Blockfrost) can only query by full bech32 address, so
it cannot see funds at a non-intended stake credential. We query by **payment
credential** instead, via Koios `credential_utxos`.

## Trust model

The check runs from the browser but goes through a small same-origin proxy
route, `/api/koios/credential-utxos`: Koios's public API sends no
`access-control-allow-origin` header, so the browser cannot call it
cross-origin (unlike Blockfrost). The proxy forwards the one call this module
needs and passes Koios's rows straight through.

Trade-off vs. the original direct-from-browser design: the app server now sees
the queried payment credential — accepted, because the call simply does not
work from the browser otherwise. Override the upstream endpoint with the
server-side env var `KOIOS_URL` (defaults to the public per-network instance).

## Pieces

| File | Role |
| --- | --- |
| `types.ts` | `DiscoveredUtxo` (server-free shared types). |
| `koios-client.ts` | Browser client for the `credential_utxos` proxy (`fetchCredentialUtxos`). |
| `orphan-utxos.ts` | Pure helpers: `findOrphanUtxos` (address ≠ canonical), `sumLovelace`, `orphanUtxosToWalletInputRefs`. |
| `../../app/api/koios/credential-utxos/route.ts` | The same-origin server proxy to Koios. |
| `../../hooks/use-orphan-wallet-utxos.ts` | React hook: auto-runs on open, exposes `orphans` + `refetch`. |
| `../../components/user/orphan-utxo-notice.tsx` | The popup/alert + "Move to my wallet address" CTA. |
| `../../components/user/stake-address-discovery-panel.tsx` | Self-contained Tools panel: auto-check on open, popup when found, manual "Re-check". |

## Flow

1. The hook derives the wallet **payment credential** from `(sttPolicyId,
   sttAssetNameHex)` via `resolveWalletSpendScriptHash` (contracts blueprint).
2. It queries Koios (through the proxy) for **all** UTxOs at that payment
   credential, across all stake credentials.
3. `findOrphanUtxos` keeps those whose full address ≠ the canonical wallet
   address (i.e. a different stake credential than intended).
4. If any exist, the popup offers to sweep them: it prefills the existing
   `Consolidate` flow with the orphan UTxOs (matched on-chain by payment
   credential) and the STT input, then opens it for review and submission. The
   sweep is value-preserving and returns the funds to the intended address.

It runs once automatically when a wallet is opened, and on demand via the
Tools-surface "Re-check".
