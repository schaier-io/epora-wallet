import assert from "node:assert/strict";
import test from "node:test";

import { collectPayeeStreamingPayments } from "@/components/payee/collect-payee-streaming-payments";
import type { DetectedSttToken } from "@/lib/mesh/detection";
import type { ConstrData } from "@/lib/types/contracts";

const NONE: ConstrData = { alternative: 1, fields: [] };

// On-chain Address with a VerificationKey payment credential and no stake part.
function vkAddress(hashHex: string): ConstrData {
  return {
    alternative: 0,
    fields: [{ alternative: 0, fields: [hashHex] }, NONE]
  };
}

// On-chain Address with a Script payment credential (cannot self-cancel).
function scriptAddress(hashHex: string): ConstrData {
  return {
    alternative: 0,
    fields: [{ alternative: 1, fields: [hashHex] }, NONE]
  };
}

function streamingPaymentDatum(opts: {
  id: number;
  payoutAddress: ConstrData;
  endDate: number;
}): ConstrData {
  return {
    alternative: 0,
    fields: [
      opts.id,
      opts.payoutAddress,
      0, // paid_out_amount
      "", // policy_id
      "", // asset_name
      1_000_000, // amount_per_day
      0, // start_date
      opts.endDate
    ]
  };
}

function stateDatum(streamingPayments: ConstrData[]): ConstrData {
  const access: ConstrData = { alternative: 0, fields: [[], NONE, []] };
  const proofOfLife: ConstrData = { alternative: 0, fields: [NONE, NONE] };
  return {
    alternative: 0,
    fields: [access, proofOfLife, streamingPayments, "", NONE, NONE]
  };
}

function token(datum: ConstrData | null, txHash: string, outputIndex: number): DetectedSttToken {
  return {
    policyId: "ab".repeat(28),
    assetNameHex: "cafe",
    unit: `${"ab".repeat(28)}cafe`,
    scriptAddress: "addr_test1stt",
    utxo: {
      input: { txHash, outputIndex },
      output: { address: "addr_test1stt", amount: [] }
    },
    datum
  } as unknown as DetectedSttToken;
}

const ME = "11".repeat(28);
const SOMEONE_ELSE = "22".repeat(28);

test("collects a VK payout that matches the connected payment key hash", () => {
  const tokens = [
    token(
      stateDatum([
        streamingPaymentDatum({ id: 7, payoutAddress: vkAddress(ME), endDate: 200_000 })
      ]),
      "aa".repeat(32),
      1
    )
  ];

  const result = collectPayeeStreamingPayments(tokens, ME);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.streamingPaymentId, 7);
  assert.equal(result[0]?.endDate, 200_000);
  assert.equal(result[0]?.sttInputTxHash, "aa".repeat(32));
  assert.equal(result[0]?.sttInputOutputIndex, 1);
  assert.equal(result[0]?.sttPolicyId, "ab".repeat(28));
  assert.equal(result[0]?.sttAssetNameHex, "cafe");
});

test("excludes a Script-credential payout even when the hash matches", () => {
  const tokens = [
    token(
      stateDatum([
        streamingPaymentDatum({ id: 1, payoutAddress: scriptAddress(ME), endDate: 200_000 })
      ]),
      "bb".repeat(32),
      0
    )
  ];
  assert.equal(collectPayeeStreamingPayments(tokens, ME).length, 0);
});

test("excludes payouts addressed to a different wallet", () => {
  const tokens = [
    token(
      stateDatum([
        streamingPaymentDatum({ id: 1, payoutAddress: vkAddress(SOMEONE_ELSE), endDate: 200_000 })
      ]),
      "cc".repeat(32),
      0
    )
  ];
  assert.equal(collectPayeeStreamingPayments(tokens, ME).length, 0);
});

test("returns nothing for an empty payment key hash", () => {
  const tokens = [
    token(
      stateDatum([
        streamingPaymentDatum({ id: 1, payoutAddress: vkAddress(ME), endDate: 200_000 })
      ]),
      "dd".repeat(32),
      0
    )
  ];
  assert.equal(collectPayeeStreamingPayments(tokens, "").length, 0);
});

test("skips tokens with no datum and keeps scanning the rest", () => {
  const tokens = [
    token(null, "ee".repeat(32), 0),
    token(
      stateDatum([
        streamingPaymentDatum({ id: 9, payoutAddress: vkAddress(ME), endDate: 200_000 })
      ]),
      "ff".repeat(32),
      2
    )
  ];
  const result = collectPayeeStreamingPayments(tokens, ME);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.streamingPaymentId, 9);
  assert.equal(result[0]?.sttInputOutputIndex, 2);
});

test("collects multiple matching streams across wallets", () => {
  const tokens = [
    token(
      stateDatum([
        streamingPaymentDatum({ id: 1, payoutAddress: vkAddress(ME), endDate: 100_000 }),
        streamingPaymentDatum({ id: 2, payoutAddress: vkAddress(SOMEONE_ELSE), endDate: 100_000 })
      ]),
      "01".repeat(32),
      0
    ),
    token(
      stateDatum([
        streamingPaymentDatum({ id: 5, payoutAddress: vkAddress(ME), endDate: 300_000 })
      ]),
      "02".repeat(32),
      3
    )
  ];
  const result = collectPayeeStreamingPayments(tokens, ME);
  assert.deepEqual(
    result.map((p) => p.streamingPaymentId).sort((a, b) => a - b),
    [1, 5]
  );
});
