import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ConsolidateTxRequestSchema,
  PublishTxRequestSchema,
  SetStakeCredentialTxRequestSchema,
  VoteTxRequestSchema,
  WalletWithdrawTxRequestSchema
} from "./tx-requests";
import { MAX_WALLET_INPUTS_PER_CONSOLIDATION } from "@/lib/contracts/transaction-limits";

const ADDRESS =
  "addr_test1qz7r704wjqh275anmzsln4ad9e4nwrutnmyvnd32jpzy2kal8d9m8yxj9gwg0ddh4nhj6zqwad8px7u45ljczt4ajfps72xr59";
const TX_HASH = "f8482092d1cf9deb9c2eddd45dea95dbcfbfdae060ce5dce851d1141db660fd0";
const CO_SIGNER = "ab".repeat(28);
const CONFIG = { sttAssetNameHex: "ab" };
const DATUM = { alternative: 0, fields: [] };

const cases = [
  [
    "wallet withdrawal",
    WalletWithdrawTxRequestSchema,
    {
      rewardAddress: "stake_test17r5ae0uf55xpmph3jmxmfayr6f0up2hvquwjn929zmgvlxqhfkys0",
      amountLovelace: "1000000",
      sttOutputDatum: DATUM,
      sttOutputAssets: []
    }
  ],
  [
    "wallet consolidation",
    ConsolidateTxRequestSchema,
    { outputDatum: DATUM, outputAssets: [], walletInputs: [{ txHash: TX_HASH, outputIndex: 1 }] }
  ],
  [
    "stake credential update",
    SetStakeCredentialTxRequestSchema,
    { sttOutputDatum: DATUM, sttOutputAssets: [], stakeCredential: { kind: "none" } }
  ],
  ["governance vote", VoteTxRequestSchema, { vote: {}, sttOutputDatum: DATUM, sttOutputAssets: [] }],
  [
    "certificate publication",
    PublishTxRequestSchema,
    { certificate: {}, sttOutputDatum: DATUM, sttOutputAssets: [] }
  ]
] as const;

describe("multisig transaction request schemas", () => {
  for (const [name, schema, fields] of cases) {
    it(`preserves required signer hashes for ${name}`, () => {
      const parsed = schema.parse({
        address: ADDRESS,
        config: CONFIG,
        sttInputTxHash: TX_HASH,
        authorityPath: "multisig",
        requiredSignerKeyHashes: [CO_SIGNER],
        ...fields
      });

      assert.deepEqual(parsed.requiredSignerKeyHashes, [CO_SIGNER]);
    });
  }
});

describe("transaction input caps", () => {
  it("accepts at most the consolidation wallet-input limit", () => {
    const walletInputs = Array.from(
      { length: MAX_WALLET_INPUTS_PER_CONSOLIDATION + 1 },
      (_, outputIndex) => ({ txHash: TX_HASH, outputIndex })
    );
    const body = {
      address: ADDRESS,
      config: CONFIG,
      sttInputTxHash: TX_HASH,
      outputDatum: DATUM,
      outputAssets: []
    };

    assert.equal(
      ConsolidateTxRequestSchema.safeParse({
        ...body,
        walletInputs: walletInputs.slice(0, MAX_WALLET_INPUTS_PER_CONSOLIDATION)
      }).success,
      true
    );
    assert.equal(
      ConsolidateTxRequestSchema.safeParse({ ...body, walletInputs }).success,
      false
    );
  });
});
