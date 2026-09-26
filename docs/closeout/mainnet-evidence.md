# Mainnet evidence for Catalyst Milestone 5

Snapshot: 2026-09-26. Live health and wallet balance refresh: 01:30 UTC.
Transaction details were read from Koios on 26 September 2026.
Source data: [mainnet-evidence.json](mainnet-evidence.json).

## Mainnet deployment and transaction evidence

The transactions below now establish reference deployment, wallet creation, funding, configuration, and operator spending.
One operator spend also refreshed proof of life. This is not evidence of the separate manual renewal action.
The earlier reference-store check in [the release record](../mainnet-beta-release.md#release-freeze-validator-blueprint) preceded the deployment below.
Its `status: missing` result was a historical snapshot, not the current state.

## Live deployment

GET [health](https://mainnet.epora.io/api/health) returned HTTP 200.
Its response at `2026-09-26T01:30:26.157Z` contained `status: ok`, database/indexer `up`,
`recentHeadFresh: true`, `walletReconcileFresh: true`, and `historyBackfillCompleted: true`.
GET [shared helper](https://mainnet.epora.io/api/shared-helper) returned `status: ready`.

STT policy / validator hash: `0dac00be80879dcf585cdb9d0acf6e0ecf52c417ded30d8b72d0ebf1`.

STT address: `addr1wyx6cq97szremn6ctnde6zk0dc8v75kyzl0dxrvtwtgwhugwudywu`.

Reference store: `addr1w87zqpcdrefhjsp6m44vhammyvajlqjqsgwps7ees5jau2quqhgjf`.

Active reference output: `fb11866380769867300d1919098c5961473e362d40d03192f5b83c61eb6f0c0d#0`.

## Current wallets

The current policy has two supply-one assets, matched to two state UTxOs.
Payment-credential queries cover all stake-address variants for each derived wallet.
Each query used `limit=1000&offset=0`; the asset query returned 2 rows and the balance query returned 4.
No result reached the page limit. Older policies are outside this inventory.

| Wallet | Wallet balance (ADA) | State deposit (ADA) | UTxOs |
| --- | ---: | ---: | ---: |
| [Smart wallet](https://cardanoscan.io/address/addr1wynmfgsec4hax5e29fretxg0c0ve6xznpcry04087g7jg8skrul80) | 10.000000 | 1.586080 | 2 |
| [Smart wallet Demo](https://cardanoscan.io/address/addr1w8wj6tjlfqjdgtlxq9t6g4ar089e7vs6wcqwpwpxgdtqvysply755) | 17.000000 | 2.202410 | 2 |

Wallet balances total **27 ADA**. Separate state deposits total **3.788490 ADA**.
The combined amount is **30.788490 ADA**. No native tokens occur in the wallet payment outputs.
Each state output contains its identifying STT. The reference output holds another **63.270800 ADA**.
Deposits are not transaction fees. These amounts are not revenue or adoption figures.

## Confirmed transactions and actual fees

All eight hashes have block records in Koios. All returned Plutus contract results are `valid_contract: true`.
Funding transactions have no Plutus contract results. These are actual ledger fees, not estimates.

| Action | UTC on 2026-09-25 | Actual fee (ADA) | Signed bytes | Transaction |
| --- | --- | ---: | ---: | --- |
| Reference deployment | 20:51:19 | 0.809617 | 14868 | [fb1186638076...](https://cardanoscan.io/transaction/fb11866380769867300d1919098c5961473e362d40d03192f5b83c61eb6f0c0d) |
| Smart wallet creation and initial funding | 22:48:51 | 0.447150 | 838 | [71ea33e0e820...](https://cardanoscan.io/transaction/71ea33e0e820dc4a04c86530d3f994a2f880aa047cdfbe3b68d3e272c33409a8) |
| Smart wallet additional funding | 22:52:59 | 0.170825 | 350 | [d6e2e824daef...](https://cardanoscan.io/transaction/d6e2e824daef4347231db51c1a5f0c422a6e3292fab2d514cb5320e86a2cf249) |
| Smart wallet operator spend | 23:00:17 | 0.895889 | 10117 | [8d21e3b7f954...](https://cardanoscan.io/transaction/8d21e3b7f954262d8da288e97b4067f40cc7ccc94db94a19959d4929350b8732) |
| Demo wallet creation and initial funding | 23:24:38 | 0.447194 | 839 | [6ba0055f3cdd...](https://cardanoscan.io/transaction/6ba0055f3cddbe2882a7ce1648eddee47e73e65b0cf36b771e375b653e8beb31) |
| Demo wallet additional funding | 23:26:48 | 0.170825 | 350 | [9e60d91d7100...](https://cardanoscan.io/transaction/9e60d91d71008a72ff725e9d1e4b6e07a96d4e7a53046af1af5b8dd217b2d7f2) |
| Demo beneficiary and proof-of-life configuration | 23:29:02 | 0.478150 | 919 | [4080136da4b6...](https://cardanoscan.io/transaction/4080136da4b64ba642f5b40d017a2181c1edfbf7cd21a48ab38a623225b34871) |
| Demo operator spend and automatic proof-of-life refresh | 23:36:38 | 0.912502 | 10256 | [a9502540ad8e...](https://cardanoscan.io/transaction/a9502540ad8ef0af445fe99904dc05ccb2d50c785344953a1f146e114424aad9) |

Demo spend `a9502540ad8ef0af445fe99904dc05ccb2d50c785344953a1f146e114424aad9`
consumed 20 ADA and returned 10 ADA to the smart wallet. It paid 10 ADA to the recipient.
The existing 7 ADA output remained unspent. The state retained its 2.202410 ADA deposit.
Its proof-of-life deadline changed from `1792970826972` to `1792971216000` milliseconds.
That is 2026-10-25 23:27:06.972 UTC to 2026-10-25 23:33:36 UTC.
The increment remained `2592000000` milliseconds (30 days).

## Method and limits

Query method: read the live policy from `/api/shared-helper`. Query Koios `policy_asset_list`,
then `credential_utxos` for the STT credential. Derive wallet payment credentials from the
repository blueprint and each STT asset name using the same Mesh functions as
`code/dApp/src/lib/contracts/blueprint.ts`. Query `credential_utxos` and `credential_txs`
for those wallet credentials. Read `tx_info` with inputs, assets, and scripts enabled.
The refresh above rechecked policy assets and wallet payment balances.

Koios base: `https://api.koios.rest/api/v1`. Read-only POST bodies:

```json
{"_payment_credentials":["27b4a219c56fd3532a2a4795990fc3d99d18530e0647d5e7f23d241e","dd2d2e5f4824d42fe60157a457a379cb9f321a7600e0b82643560612"],"_extended":true}
```

Use that body with `credential_utxos?limit=1000&offset=0`.
For `tx_info`, pass hashes from the JSON evidence as `_tx_hashes`, with `_inputs`, `_assets`, and `_scripts` set to `true`.
Cardanoscan blocked automated access. Explorer links identify the same hashes, but Koios supplied the data in this record.

Not established by these checks:

- A timed backup restore or a from-zero database reindex. The health flag alone proves neither drill.
- Backup retention settings, database isolation, or a deliberate monitoring-alert drill.
- Mainnet fees for allowance, manual renewal, beneficiary recovery, streaming crank, consolidation, set-stake, or withdrawal.
- Multi-asset minimum ADA and a deliberately fragmented-wallet consolidation measurement.
- Unique users, independent adoption, or whether an observed transaction originated from a specific wallet provider or API client.

The successful transactions support the mainnet prototype requirement. They do not close every operational-hardening task.
