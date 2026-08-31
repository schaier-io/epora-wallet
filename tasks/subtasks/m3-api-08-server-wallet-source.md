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

- [x] Implement `AddressWalletSource`: `getUtxos` returns empty, so the existing
      fallback takes over; `getChangeAddress` and `getUsedAddresses` return the
      caller's address; `getUnusedAddresses` returns empty.
- [x] Implement a server fetcher over `getBlockfrostProvider()` from
      [`blockfrost-server.ts`](../../code/dApp/src/lib/mesh/blockfrost-server.ts),
      so the server talks to Blockfrost directly instead of calling its own
      `/api/mesh` proxy.
- [x] Validate the address before any provider call: reject a malformed or
      wrong-network address with `400` and spend no quota on it.
- [x] Settle the open collateral question.
- [x] Thread the fetcher through the nine builders.
- [x] Cap the work per request.


## What landed

New module [`lib/mesh/server-wallet.ts`](../../code/dApp/src/lib/mesh/server-wallet.ts),
with [tests](../../code/dApp/src/lib/mesh/server-wallet.test.ts) (7, passing):

- `assertServerWalletAddress` — an offline guard. It checks the `addr_test1`
  prefix first, then bech32-decodes. Both failures are the caller's, so neither
  reaches Blockfrost. Throws `ServerWalletAddressError` for the routes to map to
  `400`.
- `createAddressWalletSource` — validates up front, then reports the address as
  change and used, and no UTxOs. `resolveWalletUtxos` therefore takes its
  existing `fetchAddressUTxOs` fallback.
- `createServerTxFetcher` — returns `getBlockfrostProvider()`. VERIFIED by
  typecheck that `BlockfrostProvider` satisfies `TxFetcher` with no adapter.

Threading: every builder gained a trailing optional `txFetcher?: TxFetcher` and
forwards it to `setupTransaction` and `buildTransactionWithReestimatedLimits`.
Ten exported build functions across nine files (`wallet-governance.ts` exports
two wrappers over one internal builder). The parameter is named `txFetcher`, not
`fetcher`, because every builder already destructures a `fetcher` out of
`setupTransaction` and a shared name would shadow it in the temporal dead zone.

In [`internals/budget.ts`](../../code/dApp/src/lib/mesh/transactions/internals/budget.ts)
the `fetcher` parameter moved ahead of `finalizeOverrides`, so callers pass it
without a placeholder argument. `finalizeOverrides` has no callers, so nothing
else moved.

Because both parameters keep their `ServerFetcher` defaults and no browser call
site passes one, the browser path is unchanged.

### Provider cost per request

Fixed, and the caller cannot inflate it. Every `WalletSource` method reports the
same address, so the fallback dedupes to one candidate and one address fetch per
`setupTransaction`. VERIFIED: `buildTransactionWithReestimatedLimits` calls
`prepareTx` exactly twice (`budget.ts:33` and `budget.ts:40`), draft then
re-estimated final, so a build makes **two** address fetches, not one. No retry
loop, no caller-controlled multiplier.

## The collateral question: settled, VERIFIED 2026-08-31

Collateral never came from the connected wallet. `setupTransaction` stubs the
CIP-30 API to nothing (`getCollateral: async () => []`,
[`internals/core.ts:94`](../../code/dApp/src/lib/mesh/transactions/internals/core.ts)),
so every build takes the manual path. `resolveManualCollateralCandidate` in
[`internals/utxo.ts`](../../code/dApp/src/lib/mesh/transactions/internals/utxo.ts)
reads the resolved UTxO array and nothing else: pure-ADA UTxOs worth at least
`MIN_COLLATERAL_LOVELACE` (5 ₳), sorted ascending, smallest wins, unreserved
preferred with a reserved fallback.

Selection over an array behaves the same whatever filled the array, so no
server-specific branch was needed. The caller-facing precondition is unchanged:
the address must hold a pure-ADA UTxO of at least 5 ₳, or the build fails at
`setup:manualCollateral` with the existing message.

## Preprod measurement: a real server-side build from an address alone

Run on 2026-08-31 against live preprod Blockfrost, from
`addr_test1qz7r704...ps72xr59` (the wallet that signed the
[widened-seam regression](m3-api-07-widen-wallet-seam.md)). Build only: nothing
was signed and nothing was submitted. A throwaway probe drove
`buildMintStateTokenTx` with `createAddressWalletSource` and
`createServerTxFetcher`, then was deleted.

| What | Result |
| --- | --- |
| UTxO resolution | `source: fetchAddressUTxOs`, 5 UTxOs |
| Collateral | `manual.unreserved-wallet-utxo`, `300b5fc7...#2` = 9665371469 lovelace |
| Build | OK. 1610-char tx hex, estimated fee 424778 lovelace |
| Script evaluation | MINT redeemer on `stt.stt.mint`, mem 393982, steps 122536851 |

The mint is a script transaction, so this exercised the whole server path
including collateral and live script evaluation, not just a UTxO read.

### The byte-identical criterion cannot be met. Here is exactly why.

VERIFIED by measurement, not inferred. With the same address, the same 5 UTxOs
in the same order, and `Date.now()` pinned to a fixed value, three consecutive
builds produced **different** transactions:

| Run | Inputs | Estimated fee (lovelace) |
| --- | --- | --- |
| 1 | 3 | 424778 |
| 2 | 4 | 428017 |
| 3 | 2 | 423194 |

Pinning the clock did not remove the variation, so the validity window is not
the cause. The UTxO set and its order were identical across all three, so
resolution is not the cause either. The variation starts with input selection
inside the shared Mesh build path; execution units moved with it
(391880/120325761 twice, then 393982/122536851), which is downstream of the
inputs, not the source.

That path is the same code the browser runs, so a browser build is equally
non-reproducible. Byte-identical output is therefore not achievable by either
path, and nothing in this task caused it.

**Not determined:** the precise mechanism inside Mesh that varies the selection.
Naming it was not needed to settle the criterion, so it was not chased.

## Done when

- [x] A build runs end to end on the server from an address alone, against
      preprod. Done: the mint build above.
- [x] The unsigned transaction is byte-identical to the browser path's, or the
      reason it cannot be is written down. Done: it cannot be, and the
      measurement above says why.
- [x] A malformed address is rejected before any Blockfrost call. Done:
      `assertServerWalletAddress` runs offline, and
      `createAddressWalletSource` calls it before anything else.

Left for [the tx routes](m3-api-09-tx-routes.md): mapping
`ServerWalletAddressError` to a `400` response body. This task supplies the
error; no route exists yet to return it.
