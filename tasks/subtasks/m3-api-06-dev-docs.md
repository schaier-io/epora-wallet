# API: developer docs

Public API task · [Milestone 3](../milestone-3-ui-development.md) · after [the spec](m3-api-04-openapi.md)

The spec is the contract. The README is the on-ramp. Catalyst acceptance
criterion 3 is "documentation of code", and this file plus the off-chain dev
guide are what answer it for the off-chain half.

## Steps

- [x] Write `docs/api/README.md`: one curl example per endpoint with realistic
      parameters, a pagination walkthrough showing a cursor going in and coming
      back out, and the error shape.
- [x] Document the transaction-build flow end to end: post an action, receive an
      unsigned transaction with its preview, fee estimate and warnings, sign it
      with your own wallet, submit it. Say plainly that the server never holds a
      key and never signs.
- [x] State the versioning policy (decision 11): v1 describes the current shape,
      and the compatibility promise begins with the Milestone 5 mainnet beta.
      Do not promise a freeze this milestone cannot keep.
- [x] State the rate limits and what a `429` means.
- [x] Say which routes are deliberately not public and why: `mesh`, `stt/sync`,
      `koios/credential-utxos` and `proposals`.
- [x] Link it from the repository README and from the spec's `info.description`.

## Done when

- Someone outside the project finds a wallet, reads its state and activity, and
  builds one unsigned transaction, using only this README and the spec. Have one
  person actually do it. Do not assume it reads clearly.
  - **Open.** This needs a person who has not read the code. It cannot be
    closed from inside the project.

## What was written

[`docs/api/README.md`](../../docs/api/README.md), 756 lines. Every response it
quotes was captured from a live preprod deployment on 2026-08-31, not written
from the schemas.

Ten of the thirteen endpoints were executed end to end: health, the spec, pool
lookup, wallet lookup, mint, lock-funds, stt-spend, set-stake-credential,
publish and deploy-reference. Every `bash` block in the guide was then re-run
verbatim and returned what the guide says it returns.

Three build routes are documented as request shapes only, because the
demonstration wallet lacks the chain state they need: `consolidate` needs a
second wallet UTxO, `wallet-withdraw` needs a registered stake credential with
rewards, and `vote` needs the wallet to be a registered voter. The guide says
so, in its own provenance section, rather than implying they were run.

## Defects the writing exposed

Writing the guide against a live deployment, rather than against the schemas,
surfaced five inaccuracies in what the API published. All five are fixed here,
and the spec was regenerated.

1. **The pool example 404'd.** `PoolsQuerySchema` shipped
   `pool1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy`, which is not
   registered on preprod. Replaced with ATADA's preprod pool, which resolves.
2. **The payment-key-hash example was 56 zeros**, so copying it returned no
   wallets. Replaced with a hash that matches a real preprod wallet.
3. **The `sttAssetNameHex` example was `0014df1053747420`**, a short CIP-68
   style label. `deriveAssetName` returns blake2b-256 of the seed UTxO, so a
   real name is 64 hex characters. Replaced with a real one.
4. **`certificate` and `vote` were described as "the JSON object Mesh
   expects".** The builder passes them as Mesh's `CertificateType` and
   `VoteType`, then wraps them itself. Both now say so and carry an example.
5. **The reward-address example was a key address, `stake_test1u...`.** The
   wallet's staking credential is its own script, so its reward address is a
   script one, `stake_test17...`.

## Corrections made during review

Two claims written from reading the code were wrong, and live probes caught
them before the guide shipped.

- "`outputAssets` must carry the state token itself" is **false**.
  `stt-spend` merges `outputAssets` with the consumed UTxO's value unit by
  unit, so the token is forwarded either way. Proved by building `use` with
  `"outputAssets": []`, which returned `200`. The guide now states the merge
  rule, and the two restrictions on it, quoting the messages the server
  actually returns.
- "The transaction carries a validity window" over-generalised. Only
  `stt-spend` calls `getValidityWindow`. A `lock-funds` build has no `03` key
  in its transaction body. The guide now says *some* builds carry one.

Three abbreviated `curl` blocks were also converted to request-body blocks,
because pasting them failed on the elided address and datum. The guide now
states the convention: a `bash` block runs as it stands, a `json` block is a
shape with `...` elisions.
