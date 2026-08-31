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

- [ ] Add a request schema per path in `src/lib/api/`, with the caller's address
      as a required field. `stt-spend` uses a zod discriminated union on `action`.
- [ ] Add a response schema for `BuildResult` and reuse it on all ten paths.
- [ ] Add the ten route handlers. Each one validates, builds an
      `AddressWalletSource`, calls the existing builder, and returns the result.
      No transaction logic in the routes.
- [ ] Map builder errors onto documented status codes. A caller mistake, such as
      a lapsed deadline or a missing allowance signer, is `400` with the builder's
      message. A provider failure is `502`. Never leak a raw provider error.
- [ ] Apply the tight `/api/v1/tx/*` rate-limit tier from
      [the rate-limit task](m3-api-03-rate-limits.md).
- [ ] Annotate every schema with `.meta()` so
      [the spec](m3-api-04-openapi.md) documents all ten with worked examples.

## Done when

- All ten paths build a real unsigned transaction on preprod from an address.
- At least one transaction built through the API is signed by a wallet, submitted
  and confirmed on preprod. Record the transaction hash. It belongs in the
  Catalyst proof of achievement.
- Every path appears in the served spec with an example.
- Builder errors arrive as documented status codes, not as `500`.
