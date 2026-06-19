import assert from "node:assert/strict";
import test from "node:test";

import { serializeAssetsToValueData } from "@/lib/contracts/value-data";
import { deriveStreamingPaymentCancellationStateDatum } from "@/lib/contracts/streaming-cancel";
import { deriveStreamingPaymentPayoutStateDatum } from "@/lib/contracts/streaming-payout";
import { deriveAllowanceWithdrawalStateDatum } from "@/lib/contracts/use-allowance";
import { validateStateDatum } from "@/lib/contracts/state-validation";
import { buildSttSpendRedeemerData } from "@/lib/contracts/action-data";
import { deriveAccessIndexRemovalStateDatum } from "@/lib/contracts/access-removal";
import type { Asset, ConstrData, PayoutTransfer } from "@/lib/types/contracts";

const NONE: ConstrData = { alternative: 1, fields: [] };
const FALSE: ConstrData = { alternative: 0, fields: [] };
const PLACEHOLDER_ADDRESS: ConstrData = { alternative: 0, fields: [] };

function lovelace(quantity: number): Asset[] {
  return [{ unit: "lovelace", quantity: String(quantity) }];
}

function streamingPaymentDatum(opts: {
  id: number;
  paidOutAmount: number;
  policyId: string;
  assetName: string;
  startDate: number;
  endDate: number;
  amountPerDay: number;
}): ConstrData {
  return {
    alternative: 0,
    fields: [
      opts.id,
      PLACEHOLDER_ADDRESS,
      opts.paidOutAmount,
      opts.policyId,
      opts.assetName,
      opts.amountPerDay,
      opts.startDate,
      opts.endDate
    ]
  };
}

function stateDatum(opts: {
  users?: ConstrData[];
  beneficiaries?: ConstrData[];
  multiSigThreshold?: ConstrData;
  proofOfLife?: ConstrData;
  streamingPayments?: ConstrData[];
  walletName?: string;
}): ConstrData {
  const access: ConstrData = {
    alternative: 0,
    fields: [
      opts.users ?? [],
      opts.multiSigThreshold ?? NONE,
      opts.beneficiaries ?? []
    ]
  };
  const proofOfLife = opts.proofOfLife ?? { alternative: 0, fields: [NONE, NONE] };
  return {
    alternative: 0,
    fields: [
      access,
      proofOfLife,
      opts.streamingPayments ?? [],
      opts.walletName ?? "",
      NONE, // intended_stake_credential = None
      NONE // last_permissionless_payout_at = None
    ]
  };
}

function userDatum(opts: {
  id: number;
  wallets: string[];
  perDay: Asset[];
  remaining: Asset[];
  nextAllowanceReset: number;
}): ConstrData {
  return {
    alternative: 0,
    fields: [
      opts.id,
      opts.wallets,
      serializeAssetsToValueData(opts.perDay, "per_day_allowance"),
      serializeAssetsToValueData(opts.remaining, "remaining_allowance"),
      opts.nextAllowanceReset,
      FALSE, // can_renew_proof_of_life
      NONE, // multi_sig_power
      FALSE // is_admin
    ]
  };
}

// ---------------------------------------------------------------------------
// Streaming-payment payout: the forwarded State datum must preserve every field
// (dropping `wallet_name` field 3 yields a datum the on-chain
// `expect output_state: State = output_datum` cannot decode) AND stamp
// `last_permissionless_payout_at` (field 5) with the tx upper bound (ADR-0009).
// ---------------------------------------------------------------------------

test("streaming payout preserves State fields and stamps the cooldown clock", () => {
  const walletName = "deadbeef";
  const input = stateDatum({
    walletName,
    streamingPayments: [
      streamingPaymentDatum({
        id: 1,
        paidOutAmount: 0,
        policyId: "",
        assetName: "",
        startDate: 0,
        endDate: 259_200_000,
        amountPerDay: 1_000_000
      })
    ]
  });

  const transfers: PayoutTransfer[] = [
    {
      address: "",
      amount: lovelace(1_000_000),
      inlineDatum: {
        alternative: 0,
        fields: [1, "00".repeat(32), 0]
      }
    }
  ];

  const txLatestTimeMs = 90_000_000;
  const { outputDatum, payoutDelta } = deriveStreamingPaymentPayoutStateDatum(
    input,
    transfers,
    txLatestTimeMs
  );

  // The forwarded datum is a 6-field State, with wallet_name unchanged.
  assert.equal(outputDatum.fields.length, 6, "State datum must keep all 6 fields");
  assert.equal(outputDatum.fields[3], walletName, "wallet_name must be preserved");
  assert.deepEqual(
    outputDatum.fields[4],
    input.fields[4],
    "intended_stake_credential must be preserved"
  );

  // The crank stamps last_permissionless_payout_at = Some(tx_latest) (ADR-0009).
  assert.deepEqual(outputDatum.fields[5], {
    alternative: 0,
    fields: [txLatestTimeMs]
  });

  // access (0) and proof_of_life (1) are untouched.
  assert.deepEqual(outputDatum.fields[0], input.fields[0]);
  assert.deepEqual(outputDatum.fields[1], input.fields[1]);

  // The settled payment's paid_out_amount advanced by the payout delta.
  const nextStreamingPayments = outputDatum.fields[2] as ConstrData[];
  assert.equal(nextStreamingPayments[0]?.fields[2], 1_000_000);

  assert.deepEqual(payoutDelta, lovelace(1_000_000));
});

test("streaming payout rejects a non-State (3-field) input datum", () => {
  // A legacy 3-field datum (no wallet_name) must be rejected up front, not
  // silently forwarded.
  const threeField: ConstrData = {
    alternative: 0,
    fields: [
      { alternative: 0, fields: [[], NONE, []] },
      { alternative: 0, fields: [NONE, NONE] },
      []
    ]
  };

  assert.throws(() => deriveStreamingPaymentPayoutStateDatum(threeField, [], 0));
});

// ---------------------------------------------------------------------------
// Payee self-cancel: only the targeted streaming payment's end_date moves (capped
// at "now"); every other State field and every other payment is preserved. Mirrors
// the on-chain `is_payee_cancelled` rule.
// ---------------------------------------------------------------------------

test("cancel caps the targeted payment's end_date to the tx upper bound", () => {
  const walletName = "deadbeef";
  const input = stateDatum({
    walletName,
    streamingPayments: [
      streamingPaymentDatum({
        id: 1,
        paidOutAmount: 0,
        policyId: "",
        assetName: "",
        startDate: 0,
        endDate: 259_200_000,
        amountPerDay: 1_000_000
      }),
      streamingPaymentDatum({
        id: 2,
        paidOutAmount: 0,
        policyId: "",
        assetName: "",
        startDate: 0,
        endDate: 259_200_000,
        amountPerDay: 1_000_000
      })
    ]
  });

  const txLatestTimeMs = 90_000_000;
  const { outputDatum } = deriveStreamingPaymentCancellationStateDatum(
    input,
    1,
    txLatestTimeMs
  );

  // Still a 6-field State with every non-streaming field untouched.
  assert.equal(outputDatum.fields.length, 6);
  assert.deepEqual(outputDatum.fields[0], input.fields[0], "access preserved");
  assert.deepEqual(outputDatum.fields[1], input.fields[1], "proof_of_life preserved");
  assert.equal(outputDatum.fields[3], walletName, "wallet_name preserved");
  assert.deepEqual(outputDatum.fields[4], input.fields[4], "stake credential preserved");
  assert.deepEqual(outputDatum.fields[5], input.fields[5], "cooldown clock preserved");

  const nextStreamingPayments = outputDatum.fields[2] as ConstrData[];
  // id 1 capped to now; id 2 untouched.
  assert.equal(nextStreamingPayments[0]?.fields[7], txLatestTimeMs, "target end_date capped to now");
  assert.equal(nextStreamingPayments[1]?.fields[7], 259_200_000, "other payment untouched");
  // No other field of the target changed (e.g. amount_per_day, paid_out).
  assert.equal(nextStreamingPayments[0]?.fields[2], 0, "paid_out_amount preserved");
  assert.equal(nextStreamingPayments[0]?.fields[5], 1_000_000, "amount_per_day preserved");
});

test("cancel throws when the targeted payment already ends at/before now", () => {
  const input = stateDatum({
    streamingPayments: [
      streamingPaymentDatum({
        id: 1,
        paidOutAmount: 0,
        policyId: "",
        assetName: "",
        startDate: 0,
        endDate: 50_000,
        amountPerDay: 1_000_000
      })
    ]
  });

  // end_date 50_000 <= txLatest 90_000_000 → cap is a no-op the validator would
  // reject, so the builder refuses to construct it.
  assert.throws(() => deriveStreamingPaymentCancellationStateDatum(input, 1, 90_000_000));
});

test("cancel throws on an unknown streaming-payment id", () => {
  const input = stateDatum({
    streamingPayments: [
      streamingPaymentDatum({
        id: 1,
        paidOutAmount: 0,
        policyId: "",
        assetName: "",
        startDate: 0,
        endDate: 259_200_000,
        amountPerDay: 1_000_000
      })
    ]
  });

  assert.throws(() => deriveStreamingPaymentCancellationStateDatum(input, 99, 90_000_000));
});

// ---------------------------------------------------------------------------
// Allowance reset: the "is the allowance reset?" decision must use the tx LOWER
// bound, mirroring `lib/state/allowance.ak::remaining_allowance_available_for_use`.
// In the window `earliest < next_allowance_reset <= latest`, a partially-spent
// user must still draw against `remaining`, not `per_day` — otherwise the
// contract recomputes `spent` and rejects the transaction.
// ---------------------------------------------------------------------------

const SIGNER = "ab".repeat(28);

function deriveAllowance(opts: {
  nextAllowanceReset: number;
  txEarliestTimeMs: number;
  txLatestTimeMs: number;
  spend: number;
}) {
  const state = stateDatum({
    users: [
      userDatum({
        id: 1,
        wallets: [SIGNER],
        perDay: lovelace(1_000_000),
        remaining: lovelace(400_000),
        nextAllowanceReset: opts.nextAllowanceReset
      })
    ]
  });

  return deriveAllowanceWithdrawalStateDatum({
    stateDatum: state,
    allowanceSignerKeyHash: SIGNER,
    walletInputAmounts: [lovelace(1_000_000)],
    walletOutputs: [],
    extraTransfers: [{ address: "", amount: lovelace(opts.spend) }],
    txEarliestTimeMs: opts.txEarliestTimeMs,
    txLatestTimeMs: opts.txLatestTimeMs
  });
}

function lovelaceQuantity(assets: Asset[]): string | undefined {
  return assets.find((asset) => asset.unit === "lovelace" || asset.unit === "")
    ?.quantity;
}

test("allowance reset in the boundary window draws against remaining, not per_day", () => {
  // earliest(100) < reset(150) <= latest(200): on-chain treats it as NOT reset,
  // so the effective base must be `remaining` (400k), and a 400k spend is the
  // most that is coverable.
  const computation = deriveAllowance({
    nextAllowanceReset: 150,
    txEarliestTimeMs: 100,
    txLatestTimeMs: 200,
    spend: 400_000
  });

  assert.equal(
    lovelaceQuantity(computation.effectiveRemainingAllowance),
    "400000",
    "boundary window must use remaining (400k), not per_day (1M)"
  );
});

test("allowance with a spend above remaining is rejected in the boundary window", () => {
  // Under the old upper-bound behaviour this 600k spend (>remaining, <per_day)
  // would have been accepted off-chain and then rejected on-chain. With the
  // lower-bound fix it is rejected up front.
  assert.throws(() =>
    deriveAllowance({
      nextAllowanceReset: 150,
      txEarliestTimeMs: 100,
      txLatestTimeMs: 200,
      spend: 600_000
    })
  );
});

// ---------------------------------------------------------------------------
// List-size caps (advisory mirror of lib/constants.ak). validateStateDatum must
// flag a config that exceeds the on-chain limits so the UI refuses it early.
// ---------------------------------------------------------------------------

function beneficiaryDatum(id: number): ConstrData {
  return {
    alternative: 0,
    fields: [id, [`b${id.toString(16).padStart(2, "0")}`.repeat(14)], { alternative: 1, fields: [] }, 1]
  };
}

function manyUsers(count: number): ConstrData[] {
  return Array.from({ length: count }, (_, i) =>
    userDatum({
      id: i,
      wallets: [`a${i.toString(16).padStart(2, "0")}`.repeat(14)],
      perDay: lovelace(1),
      remaining: lovelace(1),
      nextAllowanceReset: 0
    })
  );
}

test("validateStateDatum flags more than 15 users", () => {
  const errors = validateStateDatum(stateDatum({ users: manyUsers(16) }));
  assert.ok(
    errors.some((e) => e.includes("at most 15")),
    `expected a user-cap error, got: ${errors.join("; ")}`
  );
});

test("validateStateDatum accepts exactly 15 users", () => {
  const errors = validateStateDatum(stateDatum({ users: manyUsers(15) }));
  assert.ok(
    !errors.some((e) => e.includes("at most 15")),
    `unexpected user-cap error at the limit: ${errors.join("; ")}`
  );
});

test("validateStateDatum flags more than 25 beneficiaries", () => {
  const beneficiaries = Array.from({ length: 26 }, (_, i) => beneficiaryDatum(i));
  const errors = validateStateDatum(
    stateDatum({
      beneficiaries,
      proofOfLife: { alternative: 0, fields: [{ alternative: 0, fields: [0] }, { alternative: 0, fields: [1] }] }
    })
  );
  assert.ok(
    errors.some((e) => e.includes("at most 25")),
    `expected a beneficiary-cap error, got: ${errors.join("; ")}`
  );
});

test("validateStateDatum flags more than 25 streaming payments", () => {
  const streamingPayments = Array.from({ length: 26 }, (_, i) =>
    streamingPaymentDatum({
      id: i,
      paidOutAmount: 0,
      policyId: "",
      assetName: "",
      startDate: 0,
      endDate: 259_200_000,
      amountPerDay: 1_000_000
    })
  );
  const errors = validateStateDatum(stateDatum({ streamingPayments }));
  assert.ok(
    errors.some((e) => e.includes("at most 25")),
    `expected a streaming-cap error, got: ${errors.join("; ")}`
  );
});

// ---------------------------------------------------------------------------
// RemoveAccessIndex: the cheap per-entry access removal. The derive must splice
// out exactly the targeted entry and preserve all four State fields; the
// encoding must match the on-chain redeemer shape.
// ---------------------------------------------------------------------------

test("access removal splices a user and preserves all 6 State fields", () => {
  const input = stateDatum({
    users: [
      userDatum({ id: 1, wallets: ["aa"], perDay: lovelace(1), remaining: lovelace(1), nextAllowanceReset: 0 }),
      userDatum({ id: 2, wallets: ["bb"], perDay: lovelace(1), remaining: lovelace(1), nextAllowanceReset: 0 })
    ],
    walletName: "feed"
  });

  const out = deriveAccessIndexRemovalStateDatum(input, { list: "user", index: 0 });

  assert.equal(out.fields.length, 6, "State datum must keep all 6 fields");
  assert.equal(out.fields[3], "feed", "wallet_name must be preserved");
  const users = (out.fields[0] as ConstrData).fields[0] as ConstrData[];
  assert.equal(users.length, 1);
  assert.equal(users[0]?.fields[0], 2, "the surviving user is the one not at index 0");
});

test("access removal rejects an out-of-range index", () => {
  const input = stateDatum({
    users: [userDatum({ id: 1, wallets: ["aa"], perDay: lovelace(1), remaining: lovelace(1), nextAllowanceReset: 0 })]
  });
  assert.throws(() => deriveAccessIndexRemovalStateDatum(input, { list: "user", index: 5 }));
});

test("RemoveAccessIndex redeemer encodes to the on-chain shape", () => {
  const redeemer = buildSttSpendRedeemerData({
    kind: "remove-access-index",
    operatorPath: "multisig",
    target: { list: "beneficiary", index: 3 }
  });

  assert.deepEqual(redeemer, {
    alternative: 0, // RunOperator
    fields: [
      {
        alternative: 0, // OperatorAction { path, kind }
        fields: [
          { alternative: 1, fields: [] }, // Multisig
          {
            alternative: 3, // RemoveAccessIndex
            fields: [{ alternative: 1, fields: [3] }] // BeneficiaryIndex(3)
          }
        ]
      }
    ]
  });
});

test("allowance reset that has truly elapsed draws the full per_day", () => {
  // reset(50) <= earliest(100): genuinely reset, so the full per_day (1M) is
  // available and a 1M spend is coverable.
  const computation = deriveAllowance({
    nextAllowanceReset: 50,
    txEarliestTimeMs: 100,
    txLatestTimeMs: 200,
    spend: 1_000_000
  });

  assert.equal(
    lovelaceQuantity(computation.effectiveRemainingAllowance),
    "1000000",
    "an elapsed reset must restore the full per_day allowance"
  );
});
