# API: a server-side wallet source backed by Blockfrost

Public API task · [Milestone 3](../milestone-3-ui-development.md) · after [the widened seam](m3-api-07-widen-wallet-seam.md)

The build routes take an address and no signing key (decision 6). This task
supplies the `WalletSource` and the fetcher that let the existing builders run on
the server.

## What already exists

VERIFIED on 2026-08-31.
[`resolveWalletUtxos`](../../code/dApp/src/lib/mesh/transactions/internals/utxo.ts)
already has an address-based fallback: when the wallet returns no UTxOs it walks
`addressCandidates` and calls `fetcher.fetchAddressUTxOs(address)`, then
deduplicates. Its `UtxoResolution.source` is typed
`"wallet.getUtxos" | "fetchAddressUTxOs"`.

So the address path is not new code. An address-backed `WalletSource` that
reports no wallet UTxOs and offers the caller's address as its used address
routes straight through the fallback that is already tested.

## Steps

- [ ] Implement `AddressWalletSource`: `getUtxos` returns empty, so the existing
      fallback takes over; `getChangeAddress` and `getUsedAddresses` return the
      caller's address; `getUnusedAddresses` returns empty.
- [ ] Implement a server fetcher over `getBlockfrostProvider()` from
      [`blockfrost-server.ts`](../../code/dApp/src/lib/mesh/blockfrost-server.ts),
      so the server talks to Blockfrost directly instead of calling its own
      `/api/mesh` proxy.
- [ ] Validate the address before any provider call: reject a malformed or
      wrong-network address with `400` and spend no quota on it.
- [ ] Settle the open collateral question. The browser path picks collateral from
      the connected wallet's pure-ADA UTxOs and errors with "Keep one pure ADA
      UTxO with at least 5 ADA in the connected wallet". Confirm the same
      selection works over an address-fetched UTxO set, and if it does not, return
      a clear error naming what the caller's address is missing. This is the one
      part of the port that is not yet measured.
- [ ] Cap the work per request. One address fetch per build, no retry loop, so
      the provider cost of a request stays predictable and the cap in
      [the rate-limit task](m3-api-03-rate-limits.md) means something.

## Done when

- A build runs end to end on the server from an address alone, against preprod.
- The unsigned transaction it returns is byte-identical to the one the browser
  path builds from the same wallet and the same inputs. If it cannot be, write
  down exactly why.
- A malformed address is rejected before any Blockfrost call.
