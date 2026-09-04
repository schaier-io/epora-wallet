# Epora permission wallet API

HTTP access to the Epora permission wallet. Read a wallet's indexed on-chain
state, and build transactions against its smart contracts.

**The server never holds a key and never signs.** Every active transaction build route
takes an address, returns an unsigned transaction as CBOR hex, and leaves
signing and submission to you. There is no account to create, no API key to
obtain, and nothing to authenticate. Every route below is public.

The machine-readable contract is the OpenAPI 3.1 document. This guide is the
on-ramp: it shows the calls, the shapes, and the one flow that matters.

- Spec, live: `GET /api/v1/openapi.json`
- Spec, committed: [`docs/api/openapi.json`](openapi.json)
- Source of both: [`code/dApp/src/lib/api/`](../../code/dApp/src/lib/api)

## Network and base URL

Preprod only. Addresses must start with `addr_test1`. A mainnet address is
rejected before any chain call.

The examples use `$BASE` for the deployment you are calling. Running the
reference app locally, that is the dev server's own origin:

```bash
BASE=http://localhost:3000
```

Two kinds of code block appear below. A `bash` block is a command you can paste
and run as it stands. A `json` block is a request body or a response, and it
abbreviates long hashes with `...`, so fill those in from your own lookup.

## Reads

### Health

Unversioned on purpose. A health probe is operational, not part of the public
contract. It returns `200` when the app reaches its database, `503` when it
cannot.

```bash
curl -s "$BASE/api/health"
```

```json
{ "status": "ok", "checks": { "database": "up" }, "ts": "2026-08-31T11:43:24.993Z" }
```

### The spec itself

```bash
curl -s "$BASE/api/v1/openapi.json" | jq '.info.version, (.paths | keys)'
```

### Stake pool lookup

Blockfrost has no ticker search, so this takes a pool id and returns its
details plus metadata. Accepts bech32 `pool1...` or a 56-character hex id.

```bash
curl -s "$BASE/api/v1/pools?id=pool1rkfs9glmfva3jd0q9vnlqvuhnrflpzj4l07u6sayfx5k7d788us"
```

```json
{
  "pool": {
    "poolId": "pool1rkfs9glmfva3jd0q9vnlqvuhnrflpzj4l07u6sayfx5k7d788us",
    "ticker": "ATADA",
    "name": "ATADA Austria - PreProd Pool #1",
    "homepage": "https://github.com/gitmachtl/scripts",
    "description": "Testnet Pool on the PreProd-Chain",
    "saturation": 0.008132773900218358,
    "liveStakeLovelace": "521320081077",
    "activeStakeLovelace": "520124716458",
    "declaredPledgeLovelace": "0",
    "livePledgeLovelace": "0",
    "marginPct": 0.1,
    "fixedCostLovelace": "170000000",
    "blocksMinted": 41714,
    "retiring": false
  }
}
```

`saturation` is a fraction, so `1` is 100%. `marginPct` is likewise a fraction,
so `0.1` is 10%. Every lovelace amount is a decimal string, because these
values exceed the JavaScript safe integer range.

An unknown pool returns `404`, not an empty body:

```json
{ "error": "Pool not found or not registered on this network." }
```

### Find the wallets an address participates in

This is the entry point. Give it an address or a payment key hash, and it
returns every wallet that key appears in, with a state summary and recent
activity.

Give **exactly one** of `paymentKeyHash` or `address`. Giving both, or
neither, is a `400`.

```bash
curl -s -X POST "$BASE/api/v1/stt/lookup" \
  -H 'content-type: application/json' \
  -d '{
    "address": "addr_test1qz7r704wjqh275anmzsln4ad9e4nwrutnmyvnd32jpzy2kal8d9m8yxj9gwg0ddh4nhj6zqwad8px7u45ljczt4ajfps72xr59",
    "txLimit": 1
  }'
```

```json
{
  "normalizedPaymentKeyHash": "bc3f3eae902eaf53b3d8a1f9d7ad2e6b370f8b9ec8c9b62a9044455b",
  "sourceAddress": "addr_test1qz7r704wjqh275anmzsln4ad9e4nwrutnmyvnd32jpzy2kal8d9m8yxj9gwg0ddh4nhj6zqwad8px7u45ljczt4ajfps72xr59",
  "nextCursor": null,
  "wallets": [
    {
      "id": "cmtaqwrak0002tkvb9a1uxetu",
      "network": "preprod",
      "policyId": "67c11430b30ec8d03c2cce22b149265fef3c866af5b364568185f93c",
      "assetNameHex": "4a54e32392a501ce0018aff2175012cfc7d19183ae6a3d87dc0bfa7e703d95ae",
      "unit": "67c11430b30ec8d03c2cce22b149265fef3c866af5b364568185f93c4a54e32392a501ce0018aff2175012cfc7d19183ae6a3d87dc0bfa7e703d95ae",
      "sttScriptAddress": "addr_test1wpnuz9pskv8v35pu9n8z9v2fye0770yxdt6mxezksxzlj0qksjl5s",
      "walletScriptAddress": "addr_test1wr5ae0uf55xpmph3jmxmfayr6f0up2hvquwjn929zmgvlxqhpgu89",
      "status": "ACTIVE",
      "currentTxHash": "f8482092d1cf9deb9c2eddd45dea95dbcfbfdae060ce5dce851d1141db660fd0",
      "currentOutputIndex": 1,
      "lastSeenBlockHeight": 5095732,
      "lastSeenBlockTime": 1787611683,
      "matchedRoles": ["ADMIN_USER"],
      "stateSummary": {
        "walletName": "Smart wallet",
        "userCount": 1,
        "adminCount": 1,
        "beneficiaryCount": 0,
        "streamingPaymentCount": 0
      },
      "recentTransactions": [
        {
          "txHash": "f8482092d1cf9deb9c2eddd45dea95dbcfbfdae060ce5dce851d1141db660fd0",
          "transitionKind": "FORWARD",
          "slot": "131928483",
          "txIndex": 0,
          "block": "e06b6e75df294e5d29c77cfcfad6edc26b9b823e1a3d123017bbb9089b00307c",
          "blockHeight": null,
          "blockTime": null,
          "fees": "751386",
          "size": 7053,
          "deposit": "0",
          "invalidBefore": "131928327",
          "invalidAfter": "131928689"
        }
      ]
    }
  ],
  "sync": {
    "recentHeadTriggered": false,
    "reconcileTriggered": false,
    "recentHeadLastSyncedAt": "2026-08-26T23:49:17.416Z",
    "walletReconcileLastSyncedAt": "2026-08-26T23:49:17.416Z",
    "historyBackfillCursor": null
  }
}
```

Four fields carry most of the weight:

- `currentTxHash` and `currentOutputIndex` locate the **State UTxO**, the output
  that carries the state token and the wallet's configuration. Every build
  request that changes the wallet names this UTxO.
- `policyId` and `assetNameHex` identify the wallet. They become
  `config.walletPolicyId` and `config.sttAssetNameHex` in a build request.
- `matchedRoles` says how your key participates: `ADMIN_USER`, `USER`,
  `BENEFICIARY` or `STREAMING_PAYMENT_RECIPIENT`.
- `transitionKind` classifies each transaction: `MINT` created the wallet,
  `FORWARD` moved its state, `CLOSE` ended it.

The response reports the cache's freshness in `sync` but never triggers a sync.
`recentHeadTriggered` and `reconcileTriggered` are always `false` on this route.
Indexing runs on its own schedule.

`txLimit` bounds `recentTransactions` per wallet. It defaults to 10 and caps at
50.

The request body is capped at 4 KB.

#### Paging through wallets

Wallets come back 25 per page, newest activity first. The page size is fixed and
not a request parameter.

`nextCursor` is `null` on the last page. Otherwise it is the `id` of the last
wallet in the page. Send it back as `cursor` to get the next page:

```bash
ADDRESS=addr_test1qz7r704wjqh275anmzsln4ad9e4nwrutnmyvnd32jpzy2kal8d9m8yxj9gwg0ddh4nhj6zqwad8px7u45ljczt4ajfps72xr59

# Page 1.
curl -s -X POST "$BASE/api/v1/stt/lookup" -H 'content-type: application/json' \
  -d "{\"address\":\"$ADDRESS\"}" | jq '{ids: [.wallets[].id], nextCursor}'

# Page 2: the same request, plus the cursor page 1 returned.
curl -s -X POST "$BASE/api/v1/stt/lookup" -H 'content-type: application/json' \
  -d "{\"address\":\"$ADDRESS\",\"cursor\":\"cmtaqwrak0002tkvb9a1uxetu\"}" \
  | jq '{ids: [.wallets[].id], nextCursor}'
```

The cursor is exclusive: the page it returns starts **after** the wallet it
names. The address above participates in exactly one wallet, so page 1 returns
that wallet with `"nextCursor": null`, and passing its id as a cursor returns
`{"ids": [], "nextCursor": null}`. That is the mechanism, at a scale of one.

An unknown cursor is not an error. It restarts from the first wallet.

Loop until `nextCursor` is `null`:

```bash
cursor=null
while :; do
  body=$(jq -nc --arg a "$ADDRESS" --argjson c "$cursor" \
    '{address:$a} + (if $c == null then {} else {cursor:$c} end)')
  page=$(curl -s -X POST "$BASE/api/v1/stt/lookup" -H 'content-type: application/json' -d "$body")
  echo "$page" | jq -c '.wallets[] | {id, unit, status}'
  cursor=$(echo "$page" | jq '.nextCursor')
  [ "$cursor" = "null" ] && break
done
```

## Building transactions

### The flow, end to end

1. **You post an action** to a `/api/v1/tx/*` route, with the address the
   transaction is built for.
2. **The server builds it.** It reads the address's UTxOs and the wallet's
   on-chain state from a chain provider, assembles the transaction, and runs the
   validators to measure their execution cost.
3. **You get back an unsigned transaction**: `txHex` (CBOR), a human-readable
   `preview`, an `estimatedFeeLovelace`, the measured `executionUnits`, and any
   `warnings`.
4. **You sign it yourself**, with your own wallet or key. The server has no key
   and no signing route.
5. **You submit it yourself**, to any Cardano node or provider.

Steps 4 and 5 are yours. With a CIP-30 browser wallet:

```js
const { txHex } = await fetch(`${BASE}/api/v1/tx/mint`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(request)
}).then((r) => r.json());

const signedTx = await wallet.signTx(txHex);   // CIP-30, your wallet
const txHash = await wallet.submitTx(signedTx);
```

A build is not a reservation. Nothing is held server-side, and building twice
costs nothing on chain. Only your signed submission does.

The transaction itself can expire. Some builds carry a validity window, so they
are only valid for a stretch of slots. The `stt-spend` actions always set one,
and `validityWindowReferenceTimeMs` moves it. Read the window on the
transaction you were handed rather than assuming it stays valid.

Builds are **not** byte-reproducible. The same request built twice may select
different inputs and quote a different fee. Read the transaction you were
handed. Do not assume it equals one you built earlier.

### What every build request shares

Every request carries `address`, the preprod address the transaction is built
for. Its UTxOs pay the fee, and it receives the change and the collateral.
Collateral is selected automatically from that address.

Every request that targets an existing wallet also carries `config`:

```json
{
  "config": {
    "sttAssetNameHex": "4a54e32392a501ce0018aff2175012cfc7d19183ae6a3d87dc0bfa7e703d95ae",
    "walletPolicyId": "67c11430b30ec8d03c2cce22b149265fef3c866af5b364568185f93c",
    "walletAssetNameHex": "4a54e32392a501ce0018aff2175012cfc7d19183ae6a3d87dc0bfa7e703d95ae"
  }
}
```

All three come straight from the lookup response: `assetNameHex` twice, and
`policyId` once. `config` also accepts optional `*Reference` fields naming
deployed reference scripts. Leave them out and the builder finds or inlines the
scripts itself.

### What every build response returns

```json
{
  "txHex": "84ad00d901028282582066cd55a6eaa96fa3c010e8b33da23b9ac5049f37...",
  "preview": {
    "action": "mint",
    "summary": "Create Docs demo with 1 STT under policy 67c11430... and fund addr_test1wr35pg8... with 5000000 lovelace using 1 reference script",
    "cbor": "84ad00d9010282825820...",
    "txSize": { "usedBytes": 810, "maxBytes": 16384, "percentage": "4.94" }
  },
  "estimatedFeeLovelace": "424717",
  "executionUnits": {
    "memUsed": "391880",
    "stepsUsed": "120325761",
    "maxTxMem": "17500000",
    "maxTxSteps": "10000000000",
    "maxBlockMem": "77500000",
    "maxBlockSteps": "20000000000",
    "redeemers": [
      { "tag": "MINT", "index": 0, "mem": "391880", "steps": "120325761", "validator": "stt.stt.mint" }
    ],
    "perValidator": [
      { "validator": "stt.stt.mint", "memUsed": "391880", "stepsUsed": "120325761", "redeemerCount": 1 }
    ]
  }
}
```

`warnings` is an optional array of strings. It appears when the build succeeded
but something deserves your attention, such as a proof-of-life deadline that has
already lapsed. It is absent when there is nothing to say.

`preview.summary` is a plain-language description of what the transaction does.
Show it to whoever signs.

### Datums

Several routes take a datum or a redeemer as JSON, in the shape
`{ "alternative": <n>, "fields": [...] }`. A field is a string (hex bytes), an
integer, an array, or another such object.

The lookup response gives you a `stateSummary`, not the datum. To forward a
wallet's State you read the inline datum at `currentTxHash#currentOutputIndex`
yourself, from any chain provider, and send back a legal successor of it. The
validators reject an illegal one, and the build fails with `400` before you ever
sign.

### Transaction routes

| Route | Behavior |
|---|---|
| `POST /api/v1/tx/mint` | Create a wallet by minting its state token. |
| `POST /api/v1/tx/lock-funds` | Deposit funds into a wallet. |
| `POST /api/v1/tx/stt-spend` | Nine state transitions, selected by `action`. |
| `POST /api/v1/tx/wallet-spend` | Retired. Use `POST /api/v1/tx/stt-spend` with action `use`. |
| `POST /api/v1/tx/wallet-withdraw` | Withdraw the wallet's staking rewards. |
| `POST /api/v1/tx/consolidate` | Merge wallet UTxOs, and migrate them after a stake change. |
| `POST /api/v1/tx/set-stake-credential` | Set the wallet's intended stake credential. |
| `POST /api/v1/tx/vote` | Cast a governance vote as the wallet. |
| `POST /api/v1/tx/publish` | Publish a certificate as the wallet. |
| `POST /api/v1/tx/deploy-reference` | Deploy the shared STT script as a reference script. |

#### Mint a wallet

The only route that needs no existing wallet. `stateDatum` is the wallet's
initial State. It must grant at least one admin access path, or the build is
rejected.

```bash
curl -s -X POST "$BASE/api/v1/tx/mint" -H 'content-type: application/json' -d '{
  "address": "addr_test1qz7r704wjqh275anmzsln4ad9e4nwrutnmyvnd32jpzy2kal8d9m8yxj9gwg0ddh4nhj6zqwad8px7u45ljczt4ajfps72xr59",
  "mintLovelace": "5000000",
  "stateDatum": {
    "alternative": 0,
    "fields": [
      { "alternative": 0, "fields": [
        [ { "alternative": 0, "fields": [
            0,
            ["bc3f3eae902eaf53b3d8a1f9d7ad2e6b370f8b9ec8c9b62a9044455b"],
            [], [], 0,
            { "alternative": 1, "fields": [] },
            { "alternative": 1, "fields": [] },
            { "alternative": 1, "fields": [] }
        ] } ],
        { "alternative": 1, "fields": [] },
        []
      ] },
      { "alternative": 0, "fields": [
        { "alternative": 1, "fields": [] },
        { "alternative": 1, "fields": [] }
      ] },
      [],
      "446f63732064656d6f",
      { "alternative": 1, "fields": [] },
      { "alternative": 1, "fields": [] }
    ]
  }
}'
```

That State declares one admin user, identified by the payment key hash
`bc3f...`, with no allowances, no beneficiaries, no streaming payments and no
proof-of-life deadline. `446f63732064656d6f` is the wallet name `Docs demo`,
hex-encoded.

The token's asset name is derived from the UTxO that seeds the mint, so it
changes if a different UTxO is chosen. Pin it with `selectedReferenceUtxo`
when you need a specific name.

#### Deposit funds

Receiving needs no datum and no signature from the wallet. Anyone can pay in.

```bash
curl -s -X POST "$BASE/api/v1/tx/lock-funds" -H 'content-type: application/json' -d '{
  "address": "addr_test1qz7r704wjqh275anmzsln4ad9e4nwrutnmyvnd32jpzy2kal8d9m8yxj9gwg0ddh4nhj6zqwad8px7u45ljczt4ajfps72xr59",
  "config": {
    "sttAssetNameHex": "4a54e32392a501ce0018aff2175012cfc7d19183ae6a3d87dc0bfa7e703d95ae",
    "walletPolicyId": "67c11430b30ec8d03c2cce22b149265fef3c866af5b364568185f93c",
    "walletAssetNameHex": "4a54e32392a501ce0018aff2175012cfc7d19183ae6a3d87dc0bfa7e703d95ae"
  },
  "assets": [{ "unit": "lovelace", "quantity": "10000000" }]
}'
```

A deposit has no STT input, so it cannot read the wallet's intended stake
credential. A staking wallet must pass `intendedStakeCredential`, or the funds
land at the enterprise address.

#### Spend the state token

One route, nine actions. `action` picks the transition:

| `action` | Does | Also needs |
|---|---|---|
| `use` | Spend under an admin or multisig rule. | |
| `renew-proof-of-life` | Reset the dead-man-switch timer. | |
| `update-state` | Rewrite users, caps, beneficiaries, timings. | |
| `manage-streaming-payments` | Create, change or remove streaming payments. | |
| `use-allowance` | Draw on a user's daily allowance. | `allowanceSignerKeyHash` |
| `use-beneficiary` | Claim a share after the recovery deadline. | `beneficiarySignerKeyHash` |
| `payout-streaming-payment` | Pay out what a stream has accrued. | `crankSignerKeyHash` |
| `cancel-streaming-payment` | Stop a stream, as its payee. | `streamingPaymentCancelId` |
| `remove-access-index` | Remove one user or beneficiary. | `removeAccessTarget` |

Every action names the State UTxO to consume, and the State to forward:

```json
{
  "address": "addr_test1qz7r704...",
  "config": { "sttAssetNameHex": "4a54e3...", "walletPolicyId": "67c114...", "walletAssetNameHex": "4a54e3..." },
  "action": "use",
  "sttInputTxHash": "f8482092d1cf9deb9c2eddd45dea95dbcfbfdae060ce5dce851d1141db660fd0",
  "sttInputOutputIndex": 1,
  "outputDatum": { "alternative": 0, "fields": ["..."] },
  "outputAssets": [{ "unit": "lovelace", "quantity": "1586080" }]
}
```

`outputAssets` is merged with the value already on the State UTxO, unit by
unit. The state token is carried forward for you, so you do not have to name
it: an empty `outputAssets` builds. Use it to say what the State UTxO should
keep in lovelace.

Only an admin `use` may change the non-lovelace value or reduce the lovelace on
that output. The other actions reject both:

```json
{ "error": "renew-proof-of-life cannot reduce lovelace on the forwarded STT output. Only admin Use may remove value from the STT UTxO." }
{ "error": "update-state can only override lovelace on the forwarded STT output. Non-lovelace assets must stay exactly the same as the consumed STT input." }
```

**To move money out of the wallet, use this route.** The wallet validator only
fires co-spent with the state token, so add the wallet UTxOs you are spending,
the wallet outputs that continue, and the transfers you are paying:

```json
{
  "action": "use",
  "walletInputs": [{ "txHash": "f8482092...", "outputIndex": 0 }],
  "walletOutputs": [{ "amount": [{ "unit": "lovelace", "quantity": "5000000" }] }],
  "extraTransfers": [
    { "address": "addr_test1qz7r704...", "amount": [{ "unit": "lovelace", "quantity": "3000000" }] }
  ]
}
```

`authorityPath` selects which access path authorises the action: `admin`
(the default), `multisig`, `user`, `beneficiary` or `rule-driven`.

`validityWindowReferenceTimeMs` pins the reference time for the transaction's
validity window, in Unix milliseconds. It defaults to the server's clock. Set it
to build against a specific point in time.

#### Set the stake credential, then consolidate

`set-stake-credential` records where the wallet's funds must rest. It moves no
funds:

```json
{
  "address": "addr_test1qz7r704...",
  "config": { "...": "..." },
  "sttInputTxHash": "f8482092...", "sttInputOutputIndex": 1,
  "sttOutputDatum": { "alternative": 0, "fields": ["..."] },
  "sttOutputAssets": [{ "unit": "lovelace", "quantity": "1586080" }],
  "stakeCredential": { "kind": "none" }
}
```

`stakeCredential` is one of `{"kind":"none"}`, `{"kind":"key","hashHex":"..."}`
or `{"kind":"script","hashHex":"..."}`.

Existing UTxOs are migrated afterwards by `consolidate`, which merges
wallet-script UTxOs and moves them to the wallet's current base address. It
needs at least two inputs, unless one input is being migrated:

```json
{
  "address": "addr_test1qz7r704...",
  "config": { "...": "..." },
  "sttInputTxHash": "f8482092...", "sttInputOutputIndex": 1,
  "outputDatum": { "alternative": 0, "fields": ["..."] },
  "outputAssets": [{ "unit": "lovelace", "quantity": "1586080" }],
  "walletInputs": [
    { "txHash": "f8482092...", "outputIndex": 0 },
    { "txHash": "300b5fc7...", "outputIndex": 2 }
  ]
}
```

#### Governance: publish and vote

Both forward the State and attach a governance payload. The builder wraps your
payload in a script certificate or script vote, and supplies the script itself.

`certificate` is Mesh's `CertificateType`: a `type` plus that type's fields.

```json
{
  "address": "addr_test1qz7r704...",
  "config": { "...": "..." },
  "sttInputTxHash": "f8482092...", "sttInputOutputIndex": 1,
  "sttOutputDatum": { "alternative": 0, "fields": ["..."] },
  "sttOutputAssets": [{ "unit": "lovelace", "quantity": "1586080" }],
  "certificate": {
    "type": "DelegateStake",
    "stakeKeyAddress": "stake_test17r5ae0uf55xpmph3jmxmfayr6f0up2hvquwjn929zmgvlxqhfkys0",
    "poolId": "pool1rkfs9glmfva3jd0q9vnlqvuhnrflpzj4l07u6sayfx5k7d788us"
  }
}
```

`vote` is Mesh's `VoteType`:

```json
{
  "vote": {
    "voter": { "type": "StakingPool", "keyHash": "e9dcbf89a50c1d86f196cdb4f483d25fc0aaec071d29954516d0cf98" },
    "govActionId": { "txHash": "f8482092...", "txIndex": 0 },
    "votingProcedure": { "voteKind": "Yes" }
  }
}
```

The wallet's staking credential is its own script, so its reward address is a
script one, `stake_test17...`, not a key one.

#### Withdraw staking rewards

`amountLovelace` must equal the full available reward balance. Cardano permits
no partial withdrawal.

```json
{
  "address": "addr_test1qz7r704...",
  "config": { "...": "..." },
  "rewardAddress": "stake_test17r5ae0uf55xpmph3jmxmfayr6f0up2hvquwjn929zmgvlxqhfkys0",
  "amountLovelace": "1234567",
  "sttInputTxHash": "f8482092...", "sttInputOutputIndex": 1,
  "sttOutputDatum": { "alternative": 0, "fields": ["..."] },
  "sttOutputAssets": [{ "unit": "lovelace", "quantity": "1586080" }, { "unit": "67c114...", "quantity": "1" }]
}
```

#### Spend a wallet UTxO directly

The low-level path, for a rule that permits a bare wallet spend. Most callers
want `stt-spend` with `walletInputs` instead, because the wallet validator only
fires co-spent with the state token.

```json
{
  "address": "addr_test1qz7r704...",
  "config": { "...": "..." },
  "walletInputTxHash": "f8482092...",
  "walletInputOutputIndex": 0,
  "redeemer": { "alternative": 0, "fields": [] },
  "outputs": [
    { "address": "addr_test1qz7r704...", "amount": [{ "unit": "lovelace", "quantity": "8000000" }] }
  ]
}
```

#### Deploy a reference script

Deploying the shared STT spend script once makes later transactions smaller,
because they cite the script instead of carrying it. It needs no wallet.

```bash
curl -s -X POST "$BASE/api/v1/tx/deploy-reference" -H 'content-type: application/json' -d '{
  "address": "addr_test1qz7r704wjqh275anmzsln4ad9e4nwrutnmyvnd32jpzy2kal8d9m8yxj9gwg0ddh4nhj6zqwad8px7u45ljczt4ajfps72xr59"
}'
```

The build refuses when a reference for the current script already exists:

```json
{ "error": "Shared STT reference is already deployed at 69a692e262ab9913d978515c02256fddf30ba20db69f7c25203df34aa99e5a2a#0." }
```

Pass `"allowDuplicateCurrentScriptReferences": true` to deploy anyway.

## Errors

Every failure returns the same body, on every route:

```json
{ "error": "A sentence naming what to fix." }
```

There is no error code, no nested detail object, and no stack trace. The status
carries the category, the message carries the specifics.

| Status | Means |
|---|---|
| `400` | Your request is invalid, or the wallet's on-chain state forbids the action. |
| `404` | The thing you named does not exist. Pool lookups only. |
| `413` | The body is over the limit: 32 KB for build routes, 4 KB for lookups. |
| `429` | You are over the rate limit. |
| `500` | Unexpected server error. |
| `502` | The chain data provider is unreachable. |
| `503` | Health only: the app is up but its database is down. |

A body that is not JSON returns `400`, and so does one nested past 64 levels:

```json
{ "error": "Request body is not valid JSON." }
{ "error": "Request body nests deeper than 64 levels." }
```

A `400` from schema validation names the field:

```json
{ "error": "stateDatum: Invalid input: expected object, received undefined" }
{ "error": "address: Expected a preprod bech32 address starting with `addr_test1`." }
{ "error": "Address \"addr_test1qqqq...\" is not a valid Cardano address." }
{ "error": "action: Invalid discriminator value. Expected 'use' | 'renew-proof-of-life' | ..." }
```

A `400` from the builder names the rule you broke:

```json
{ "error": "Consolidation needs at least two inputs unless one input is being migrated to the wallet's intended stake address." }
```

`400` also covers a transaction the validators reject. That is the point of
building before signing: an illegal action fails here, for free, instead of
costing you a failed submission.

Every `/api/v1/tx/*` error message is capped at 500 characters, then marked
with a trailing `...`. Without that cap a failed on-chain evaluation returns
the whole candidate transaction.

A `502` never carries the provider's own text. It always reads the same, so a
provider outage cannot leak its internals through this API:

```json
{ "error": "The chain data provider is unavailable. Try again shortly." }
```

## Rate limits

Per client address, in a rolling window:

| Routes | Limit |
|---|---|
| Active `/api/v1/tx/*` build routes | 5 requests per 60 seconds, across all nine routes together |
| `/api/v1/stt/lookup` | 600 requests per 60 seconds |
| `/api/v1/pools` | 300 requests per 60 seconds |

The nine active build routes share **one** bucket. Three mints and two deposits in the
same minute use the whole allowance.

Builds also share a deployment-wide cap of 25 per 60 seconds, summed over every
caller. You can meet it while well inside your own allowance, because someone
else is building. It answers with a different message, so you can tell the two
apart and back off accordingly.

A `429` says you must wait. It carries a `Retry-After` header, in seconds:

```http
HTTP/1.1 429 Too Many Requests
retry-after: 60
content-type: application/json

{"error":"Too many transaction builds. Try again shortly."}
```

```json
{ "error": "The service is building too many transactions right now. Try again shortly." }
```

Wait that long, then retry. Retrying sooner spends your next window.

### Why the build cap is so much tighter

A build is not one request to the chain provider. Measured against preprod on
2026-08-31, counting real HTTP requests:

| Build | Provider requests |
|---|---|
| `lock-funds` | 10 |
| `deploy-reference` | 62 |
| `mint` | 63 |
| `stt-spend` | 70 |
| `stt-spend`, with `config.sttSpendReference` set | 24 |

Most of that is resolving the shared STT reference script, which means scanning
the reference store and reading each script it holds.

**You can cut a build's cost by about two thirds.** Add the reference UTxO to
the `config` you already send, and the store is not scanned:

```json
{
  "config": {
    "sttAssetNameHex": "4a54e3...",
    "walletPolicyId": "67c114...",
    "walletAssetNameHex": "4a54e3...",
    "sttSpendReference": "69a692e262ab9913d978515c02256fddf30ba20db69f7c25203df34aa99e5a2a#0"
  }
}
```

Read it once from a `deploy-reference` transaction, or from the reference store
address, and cache it. It changes only when the validator does.

These limits are a starting tier for a preprod service, not a commitment. A
deployment can set its own through `TX_RATE_LIMIT_REQUESTS`,
`TX_RATE_LIMIT_WINDOW_MS`, `TX_RATE_LIMIT_GLOBAL_REQUESTS` and
`TX_RATE_LIMIT_GLOBAL_WINDOW_MS`. Expect the defaults to be tuned before the
mainnet beta.

## Routes that are not public

The deployment serves other routes. They are not part of `v1`, they are not in
the spec, and they may change or disappear without notice. Do not build against
them.

- **`POST /api/mesh`** proxies chain reads to Blockfrost for the app's own
  browser client, which cannot hold the project's API key. It is deliberately
  not session-gated, because wallet detection and the whole client-side
  build pipeline read through it before any session exists. Its data is public
  preprod chain data, so the risk it manages is quota drain, not disclosure.
  Use a chain provider directly instead. You will get the same data with your
  own quota.
- **`POST /api/stt/sync`** drives the indexer. It is gated by a shared secret
  and exists for scheduled jobs, not for callers.
- **`POST /api/koios/credential-utxos`** exists only because Koios sends no
  `access-control-allow-origin` header, so the browser cannot read it directly.
  Call Koios yourself from a server, where CORS does not apply.
- **`/api/proposals/*`** coordinates multi-signature proposals inside the app.
  It is gated by a wallet-signature session cookie, it is stateful, and its
  shape follows the app's UI rather than a public contract.

## Versioning

`v1` describes the current shape of the API. This document and the spec are the
record of what it does today.

**The compatibility promise starts at the mainnet beta.** Until then, a `v1`
route may change without a version bump. This milestone ships a preprod
prototype, and promising a freeze it cannot keep would be worse than saying so.

After the beta, a breaking change gets a new version prefix. A breaking change
means removing a route or field, renaming one, narrowing an accepted value, or
changing what a field means. Adding an optional request field, adding a
response field, or adding a route is not breaking. Read responses so that an
unknown field is ignored.

`info.version` in the spec tracks the document. The `v1` in the path tracks the
contract. They move independently.

## Provenance of the examples

Every response in this guide was captured from a live preprod deployment on
2026-08-31, not written from the schemas.

Ten of the thirteen endpoints were executed end to end and returned what is
shown: health, the spec, pool lookup, wallet lookup (both pages), mint,
lock-funds, stt-spend, set-stake-credential, publish and deploy-reference.

Three build routes are shown as request shapes only, because the demonstration
wallet lacks the chain state they need: `consolidate` needs a second wallet
UTxO, `wallet-withdraw` needs a registered stake credential with rewards, and
`vote` needs the wallet to be a registered voter. Their shapes come from the
same schemas that generate the spec, so they are accurate; they were not
executed.

## Related documents

- [OpenAPI 3.1 document](openapi.json) — the machine-readable contract.
- [Whitepaper](../../whitepaper/whitepaper.pdf) — the permission model these
  routes operate.
- [Smart contract](../../code/smart-contract/README.md) — the validators that
  decide whether a built transaction is legal.
- [dApp](../../code/dApp/README.md) — running the reference interface locally.
