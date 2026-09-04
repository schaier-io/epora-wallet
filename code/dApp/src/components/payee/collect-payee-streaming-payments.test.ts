import assert from "node:assert/strict";
import test from "node:test";
import { serializeData, type UTxO } from "@meshsdk/core";

import { collectPayeeStreamingPayments } from "@/components/payee/collect-payee-streaming-payments";
import { validateStateDatum } from "@/lib/contracts/state-validation";
import { decodeDatumFromUtxo } from "@/lib/mesh/datum";
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

function stateDatum(
  streamingPayments: ConstrData[],
  lastNonAdminPayoutAt: ConstrData = NONE,
  walletNameHex = ""
): ConstrData {
  const access: ConstrData = { alternative: 0, fields: [[], NONE, []] };
  const proofOfLife: ConstrData = { alternative: 0, fields: [NONE, NONE] };
  return {
    alternative: 0,
    fields: [access, proofOfLife, streamingPayments, walletNameHex, NONE, lastNonAdminPayoutAt]
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

  const result = collectPayeeStreamingPayments(tokens, ME).payments;
  assert.equal(result.length, 1);
  assert.equal(result[0]?.streamingPaymentId, 7);
  assert.equal(result[0]?.endDate, 200_000);
  assert.equal(result[0]?.sttInputTxHash, "aa".repeat(32));
  assert.equal(result[0]?.sttInputOutputIndex, 1);
  assert.equal(result[0]?.sttPolicyId, "ab".repeat(28));
  assert.equal(result[0]?.sttAssetNameHex, "cafe");
  assert.equal(result[0]?.lastNonAdminPayoutAt, null);
});

test("carries the containing State's shared cooldown stamp", () => {
  const lastStamp = 123_000;
  const datum = stateDatum(
    [streamingPaymentDatum({ id: 7, payoutAddress: vkAddress(ME), endDate: 200_000 })],
    { alternative: 0, fields: [lastStamp] }
  );
  const [payment] = collectPayeeStreamingPayments(
    [token(datum, "ac".repeat(32), 0)],
    ME
  ).payments;

  assert.equal(payment?.lastNonAdminPayoutAt, lastStamp);
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
  assert.equal(collectPayeeStreamingPayments(tokens, ME).payments.length, 0);
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
  assert.equal(collectPayeeStreamingPayments(tokens, ME).payments.length, 0);
});

test("keeps receiver-owned streams after an earlier end-date shortening", () => {
  const payment = streamingPaymentDatum({ id: 1, payoutAddress: vkAddress(ME), endDate: 200_000 });
  const tokens = [token(stateDatum([payment]), "cd".repeat(32), 0)];

  assert.equal(collectPayeeStreamingPayments(tokens, ME).payments.length, 1);
});

test("excludes a malformed payee credential hash", () => {
  const tokens = [
    token(
      stateDatum([
        streamingPaymentDatum({ id: 1, payoutAddress: vkAddress("11".repeat(27)), endDate: 200_000 })
      ]),
      "ce".repeat(32),
      0
    )
  ];

  assert.equal(collectPayeeStreamingPayments(tokens, "11".repeat(27)).payments.length, 0);
});

test("excludes a matching payment whose full payout address cannot be decoded", () => {
  const payoutAddress = vkAddress(ME);
  payoutAddress.fields[1] = { alternative: 0, fields: [] };
  const result = collectPayeeStreamingPayments(
    [
      token(
        stateDatum([
          streamingPaymentDatum({ id: 1, payoutAddress, endDate: 200_000 })
        ]),
        "cf".repeat(32),
        0
      )
    ],
    ME
  );

  assert.equal(result.payments.length, 0);
  assert.equal(result.entriesSkipped, 1);
});

test("classifies an on-chain amount outside the supported range as unreadable", () => {
  const payment = streamingPaymentDatum({
    id: 1,
    payoutAddress: vkAddress(ME),
    endDate: 200_000
  });
  payment.fields[5] = 9_007_199_254_740_993n;
  const datum = stateDatum([payment]);
  const plutusData = serializeData(datum, "Mesh");
  const utxo = {
    input: { txHash: "d0".repeat(32), outputIndex: 0 },
    output: { address: "addr_test1stt", amount: [], plutusData }
  } as unknown as UTxO;

  assert.match(
    validateStateDatum(datum).join(" "),
    /scheduled payment 1's amount per day must be a whole number/i
  );
  const decoded = decodeDatumFromUtxo(utxo);
  const result = collectPayeeStreamingPayments(
    [token(decoded, "d0".repeat(32), 0)],
    ME
  );

  assert.equal(decoded, null);
  assert.equal(result.payments.length, 0);
  assert.equal(result.walletsUnreadable, 1);
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
  assert.equal(collectPayeeStreamingPayments(tokens, "").payments.length, 0);
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
  const result = collectPayeeStreamingPayments(tokens, ME).payments;
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
  const result = collectPayeeStreamingPayments(tokens, ME).payments;
  assert.deepEqual(
    result.map((p) => p.streamingPaymentId).sort((a, b) => a - b),
    [1, 5]
  );
});

/**
 * The payer's identity was read out of the State and thrown away, leaving the payee an
 * invoice they could not attribute. And one "none found" line stood for four different
 * outcomes, so a failed read looked exactly like having no payments.
 */

test("the paying wallet is named on every payment it sends", () => {
  const nameHex = Buffer.from("Household wallet", "utf8").toString("hex");
  const datum = stateDatum(
    [streamingPaymentDatum({ id: 1, payoutAddress: vkAddress(ME), endDate: 200_000 })],
    NONE,
    nameHex
  );

  const [payment] = collectPayeeStreamingPayments([token(datum, "aa".repeat(32), 0)], ME)
    .payments;
  assert.equal(payment?.payerWalletName, "Household wallet");
});

test("the payout address travels with the payment, so the payout can be addressed", () => {
  const datum = stateDatum([
    streamingPaymentDatum({ id: 1, payoutAddress: vkAddress(ME), endDate: 200_000 })
  ]);

  const [payment] = collectPayeeStreamingPayments([token(datum, "aa".repeat(32), 0)], ME)
    .payments;
  assert.match(payment?.payoutAddress ?? "", /^addr_test1/);
});

test("a wallet with no datum is counted as unread, not as an absence of payments", () => {
  const result = collectPayeeStreamingPayments([token(null, "aa".repeat(32), 0)], ME);

  assert.equal(result.payments.length, 0);
  assert.equal(result.walletsScanned, 1);
  assert.equal(result.walletsUnreadable, 1);
});

test("a wallet whose State will not parse is counted as unread", () => {
  const broken = { alternative: 0, fields: ["not-an-access-control"] } as unknown as ConstrData;
  const result = collectPayeeStreamingPayments([token(broken, "aa".repeat(32), 0)], ME);

  assert.equal(result.walletsUnreadable, 1);
  assert.equal(result.entriesSkipped, 0);
});

test("a readable wallet with a malformed entry counts the entry, not the wallet", () => {
  const malformed = { alternative: 0, fields: [1, 2] } as unknown as ConstrData;
  const datum = stateDatum([
    malformed,
    streamingPaymentDatum({ id: 1, payoutAddress: vkAddress(ME), endDate: 200_000 })
  ]);
  const result = collectPayeeStreamingPayments([token(datum, "aa".repeat(32), 0)], ME);

  assert.equal(result.payments.length, 1);
  assert.equal(result.walletsUnreadable, 0);
  assert.equal(result.entriesSkipped, 1);
});

test("a clean scan reports nothing skipped", () => {
  const datum = stateDatum([
    streamingPaymentDatum({ id: 1, payoutAddress: vkAddress(ME), endDate: 200_000 })
  ]);
  const result = collectPayeeStreamingPayments([token(datum, "aa".repeat(32), 0)], ME);

  assert.equal(result.walletsUnreadable, 0);
  assert.equal(result.entriesSkipped, 0);
  assert.equal(result.walletsScanned, 1);
});
