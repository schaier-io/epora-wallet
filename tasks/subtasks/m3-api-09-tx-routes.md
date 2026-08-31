# API: the ten transaction-build routes

Public API task · [Milestone 3](../milestone-3-ui-development.md) · after [the server wallet source](m3-api-08-server-wallet-source.md) and [shared schemas](m3-api-01-shared-schemas.md)

This is what makes "interact with the smart contract" true of the HTTP surface
and not only of the client library. The caller posts a described action and gets
back an unsigned transaction. The server never holds a key and never signs.

## The paths

One path per builder (decision 9), mirroring the module layout so there is no
second structure to keep in sync:

| Path | Builder |
| --- | --- |
| `POST /api/v1/tx/stt-spend` | `buildSttSpendTx`, nine actions behind a discriminator |
| `POST /api/v1/tx/mint` | `buildMintStateTokenTx` |
| `POST /api/v1/tx/lock-funds` | `buildLockFundsTx` |
| `POST /api/v1/tx/wallet-spend` | `buildWalletSpendTx` |
| `POST /api/v1/tx/wallet-withdraw` | `buildWalletWithdrawTx` |
| `POST /api/v1/tx/consolidate` | `buildConsolidateUtxosTx` |
| `POST /api/v1/tx/set-stake-credential` | `buildSetIntendedStakeCredentialTx` |
| `POST /api/v1/tx/vote` | `buildWalletVoteTx` |
| `POST /api/v1/tx/publish` | `buildWalletPublishTx` |
| `POST /api/v1/tx/deploy-reference` | `buildDeploySharedSttReferenceTx` |

The nine `stt-spend` actions are `use`, `renew-proof-of-life`, `update-state`,
`manage-streaming-payments`, `use-allowance`, `use-beneficiary`,
`payout-streaming-payment`, `cancel-streaming-payment` and
`remove-access-index`. That is the eighteen operations of decision 7.

## The response

`BuildResult` unchanged, from
[`types/contracts.ts:259`](../../code/dApp/src/lib/types/contracts.ts):
`txHex`, `preview`, `estimatedFeeLovelace`, `executionUnits` and `warnings`.
It already carries an unsigned transaction plus a readable preview, a fee
estimate and non-blocking advisories, so there is no reason to define a second
shape for HTTP.

## Steps

- [x] Add a request schema per path in `src/lib/api/`, with the caller's address
      as a required field. `stt-spend` uses a zod discriminated union on `action`.
- [x] Add a response schema for `BuildResult` and reuse it on all ten paths.
- [x] Add the ten route handlers. Each one validates, builds an
      `AddressWalletSource`, calls the existing builder, and returns the result.
      No transaction logic in the routes.
- [x] Map builder errors onto documented status codes.
- [x] Apply the tight `/api/v1/tx/*` rate-limit tier. Shipped as 5 builds per
      60 s per client across the whole tier, plus 25 per 60 s deployment-wide
      and a 32 KB body cap. The numbers and their `TX_RATE_LIMIT_*` overrides
      live in
      [`tx-rate-limit.ts`](../../code/dApp/src/lib/http/tx-rate-limit.ts); the
      reasoning is in [the rate-limit task](m3-api-03-rate-limits.md). The
      earlier note here said 10 per route, which was the starting tier, not the
      shipped one.
- [x] Annotate every schema with `.meta()`.

## What landed

Ten route files, each about ten lines: they name a schema and call one builder.
Everything shared lives in
[`lib/http/tx-route.ts`](../../code/dApp/src/lib/http/tx-route.ts) —
rate-limit, bounded body, validate, build an address wallet source, call the
builder, map failures. The classification half is split into
[`tx-route-errors.ts`](../../code/dApp/src/lib/http/tx-route-errors.ts) because
`tx-route.ts` is server-only and cannot be loaded by the test runner; it has 10
tests.

Schemas: [`tx-primitives.ts`](../../code/dApp/src/lib/api/tx-primitives.ts)
(shared pieces), [`tx-result.ts`](../../code/dApp/src/lib/api/tx-result.ts)
(`BuildResult`), [`tx-requests.ts`](../../code/dApp/src/lib/api/tx-requests.ts)
(nine requests) and
[`tx-stt-spend.ts`](../../code/dApp/src/lib/api/tx-stt-spend.ts) (the nine-action
union). Each per-action requirement in that union mirrors a throw in
`stt-spend.ts`, so the documented contract is the enforced one.

Plutus data is JSON-only. Mesh's `Data` also admits a `Map`, which has no JSON
representation and which no datum this app builds uses, so maps are left out of
the public surface rather than silently mis-encoded.

### Two defects the live sweep found

Both were measured against preprod, not reasoned about.

**Provider failures were over-reported.** The heuristic searched the whole error
graph, and every staged builder error carries setup diagnostics naming the
provider (`evaluatorSource: "blockfrost-via-server-route"`). So three ordinary
caller mistakes came back as `502`. It now searches only the message and cause
chain, never stacks and never `details`, and the provider's name is no longer a
marker: only transport and gateway failures count. A regression test pins it.

**One error body was 20 KB.** Mesh appends the whole candidate transaction to an
evaluation failure. Messages are now truncated at 500 characters, keeping the
leading text that names the problem. The full text is logged.

## Preprod measurement: every path, 2026-08-31

Against live preprod, from `addr_test1qz7r704...ps72xr59` and the wallet
`Smart wallet` (STT `67c11430...703d95ae`, State at `f8482092...#1`). Builds
only: nothing was signed and nothing was submitted.

| Path | Result |
| --- | --- |
| `mint` | **Built.** fee 426433, 849 bytes |
| `lock-funds` | **Built.** fee 172233, 277 bytes |
| `stt-spend` (`update-state`) | **Built.** fee 441420, 711 bytes |
| `set-stake-credential` | **Built.** fee 433453, 711 bytes |
| `deploy-reference` | **Built.** fee 752901, 13474 bytes |
| `consolidate` | 400 "Consolidation needs at least two inputs..." |
| `wallet-spend` | 400 script evaluation failed |
| `wallet-withdraw` | 400 "Adding redeemer to non plutus withdrawal" |
| `vote` | 400 "Error serializing votes..." |
| `publish` | 400 "Error serializing certificates..." |

VERIFIED: no path answered `500`, and no caller mistake answered `502`.

The five 400s are the request bodies, not the routes. Each one reached its
builder and was rejected on chain state or payload semantics: the wallet holds a
single UTxO so a consolidation has nothing to merge, and a valid wallet-spend
redeemer, reward withdrawal, governance vote and certificate each need a
contract-valid payload rather than a placeholder. Building those five is the
[walkthrough](m3-walk-02-run.md)'s job, which drives every feature with real
inputs.

## Second manual sweep, 2026-08-31, after the rate-limit and body-guard fixes

Same wallet, same caller. This run used real governance inputs rather than
placeholders: the wallet's own DRep id (`drep1y05ae0uf55xpmph3jmxmfayr6f0up2hvquwjn929zmgvlxqdjsap6`),
its script reward address (`stake_test17r5ae0uf55xpmph3jmxmfayr6f0up2hvquwjn929zmgvlxqhfkys0`)
and a live preprod governance action
(`0ecc74fe26532cec1ab9a299f082afc436afc888ca2dc0fc6acda431c52dc60d#0`).

| Path | Result |
| --- | --- |
| `mint` | **Built.** fee 426433, 849 bytes |
| `lock-funds` | **Built.** fee 172409, 281 bytes |
| `stt-spend` (`use`) | **Built.** fee 430279, 671 bytes |
| `stt-spend` (`update-state`) | **Built.** fee 438491, 671 bytes |
| `vote` | **Built.** fee 1326429, 6916 bytes |
| `publish` | **Built.** fee 732545, 6911 bytes |
| `stt-spend` (`renew-proof-of-life`) | 400, script evaluation. The State carries no proof-of-life configuration, so the validator rejects the renewal |
| `deploy-reference` | 400 "Shared STT reference is already deployed at 69a692e2...#0." The guard is correct; the store was empty during the first sweep |
| `set-stake-credential` | 400, script evaluation. It built in the first sweep; the State has moved since |
| `consolidate` | 400 "Consolidation needs at least two inputs..." The wallet holds one UTxO |
| `wallet-spend` | 400, script evaluation, from a placeholder redeemer. The first attempt returned 400 "outputs.0.address: Invalid input: expected string, received undefined", which named the field correctly |
| `wallet-withdraw` | 400 "Adding redeemer to non plutus withdrawal". The wallet's stake credential is not registered, so there is nothing to withdraw |

**Seven of the ten paths have now produced a real unsigned transaction**, across
the two sweeps: `mint`, `lock-funds`, `stt-spend`, `set-stake-credential`,
`deploy-reference`, `vote` and `publish`. `vote` and `publish` are new here, and
they were the two the first sweep could not build.

The remaining three need chain state that only a signed, submitted transaction
can create: a second wallet UTxO to consolidate, a contract-valid wallet-spend
redeemer, and a registered stake credential with rewards. That is the
[walkthrough](m3-walk-02-run.md)'s job.

The documented failures were checked in the same run (VERIFIED): 400 naming the
field, 400 for a mainnet address, 400 for malformed JSON, 400 for a body nested
past 64 levels, 413 over 32 KB, and 429 with `Retry-After: 60` on the sixth
build inside one minute. No path answered 500.

## Third sweep, 2026-08-31, after merging `dev` (204 commits)

`dev` brought the next-intl migration onto this branch. The public v1 API keeps
fixed English error strings, so the sweep was repeated to prove the merge
changed no route behaviour. Same wallet, same caller, same State UTxO
(`f8482092...#1`), against `next dev` on the merged tree.

| Path | Result |
| --- | --- |
| `mint` | **Built.** fee 426362, 841 bytes |
| `lock-funds` | **Built.** fee 174345, 325 bytes |
| `stt-spend` (`use`) | **Built.** fee 430279, 671 bytes |
| `stt-spend` (`update-state`) | **Built.** fee 441244, 707 bytes |
| `vote` | **Built.** fee 1326429, 6916 bytes |
| `publish` | **Built.** fee 731665, 6891 bytes |
| `set-stake-credential` | **Built.** fee 430699, 675 bytes |
| `stt-spend` (`renew-proof-of-life`) | 400, script evaluation. The State carries no proof-of-life configuration |
| `consolidate` | 400 "Consolidation needs at least two inputs..." The wallet still holds one UTxO |
| `wallet-spend` | 400, script evaluation, from a placeholder redeemer |
| `wallet-withdraw` | 400 "Adding redeemer to non plutus withdrawal". The stake credential is not registered |
| `deploy-reference` | 400 "Shared STT reference is already deployed at 69a692e2...#0" |

VERIFIED: the same seven paths build and the same five fail for the same
reasons as the second sweep. No path answered `500`.

The read surface and every documented failure were re-checked in the same run
(VERIFIED):

| Case | Result |
| --- | --- |
| `GET /api/health` | 200 `{"status":"ok","checks":{"database":"up"}}` |
| `GET /api/v1/openapi.json` | 200, 69140 bytes |
| `GET /api/v1/pools?id=pool12jth...` | 200 with ticker, name, saturation, fees |
| `GET /api/v1/pools` (no id) | 400 "Provide a pool id, e.g. /api/v1/pools?id=pool1..." |
| `GET /api/v1/pools?id=notapool` | 400 naming the expected shapes |
| `GET /api/v1/pools?id=pool1ffnv...` (unknown) | 404 "Pool not found or not registered on this network." |
| `POST /api/v1/stt/lookup` | 200 with the sync cursors |
| lookup, malformed JSON | 400 "Request body is not valid JSON." |
| lookup, `{}` | 400 "Exactly one of paymentKeyHash or address must be provided." |
| lookup, mainnet address | 400 naming the address |
| lookup, 6 KB body | 413 "Request body exceeds the 4096-byte limit." |
| build, malformed JSON | 400 "Request body is not valid JSON." |
| build, nested 200 levels | 400 "Request body nests deeper than 64 levels." |
| build, 46 KB body | 413 "Request body exceeds the 32768-byte limit." |
| build, `{}` | 400 "address: Invalid input: expected string, received undefined" |
| build, mainnet address | 400 "address: Expected a preprod bech32 address starting with `addr_test1`." |
| build, over the per-client cap | 429 "Too many transaction builds. Try again shortly.", `Retry-After: 42` |

The pools 400 now names `/api/v1/pools`, which is the branch's path, not dev's
pre-rename `/api/pools`.


## Done when

- [~] All ten paths build a real unsigned transaction on preprod from an
      address. Seven do, across the two sweeps above. The other three are
      blocked on chain state a signed transaction has to create, not on the
      routes; see the note under the second table.
- [ ] At least one transaction built through the API is signed by a wallet,
      submitted and confirmed on preprod. Record the transaction hash. It
      belongs in the Catalyst proof of achievement. **Needs a human to sign**,
      so it cannot be closed from here.
- [ ] Every path appears in the served spec with an example. Belongs to
      [the OpenAPI task](m3-api-04-openapi.md); every schema already carries the
      `.meta()` it needs.
- [x] Builder errors arrive as documented status codes, not as `500`. VERIFIED
      across all ten paths, above.
