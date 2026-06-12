import assert from "node:assert/strict";
import test from "node:test";

import type { Data } from "@meshsdk/common";
import { crankSignerBypassesCooldown } from "@/lib/contracts/crank-cooldown";
import { deriveStreamingPaymentPayoutStateDatum } from "@/lib/contracts/streaming-payout";
import type { Asset, ConstrData, PayoutTransfer } from "@/lib/types/contracts";

const NONE: ConstrData = { alternative: 1, fields: [] };
const FALSE: ConstrData = { alternative: 0, fields: [] };
const TRUE: ConstrData = { alternative: 1, fields: [] };
const PLACEHOLDER_ADDRESS: ConstrData = { alternative: 0, fields: [] };

const SIGNER = "ab".repeat(28);
const OTHER = "cd".repeat(28);

function some(value: Data): ConstrData {
  return { alternative: 0, fields: [value] };
}

function user(opts: {
  id: number;
  wallets: string[];
  multiSigPower?: number;
  isAdmin?: boolean;
}): ConstrData {
  return {
    alternative: 0,
    fields: [
      opts.id,
      opts.wallets,
      [], // per_day_allowance
      [], // remaining_allowance
      0, // next_allowance_reset
      FALSE, // can_renew_proof_of_life
      opts.multiSigPower === undefined ? NONE : some(opts.multiSigPower),
      opts.isAdmin ? TRUE : FALSE
    ]
  };
}

function beneficiary(opts: {
  id: number;
  wallets: string[];
  unlockAfter?: number;
  weight?: number;
}): ConstrData {
  return {
    alternative: 0,
    fields: [
      opts.id,
      opts.wallets,
      opts.unlockAfter === undefined ? NONE : some(opts.unlockAfter),
      opts.weight ?? 1
    ]
  };
}

function state(opts: {
  users?: ConstrData[];
  multiSigThreshold?: number;
  beneficiaries?: ConstrData[];
  unlockTime?: number;
  lastPermissionlessPayoutAt?: ConstrData;
}): ConstrData {
  const access: ConstrData = {
    alternative: 0,
    fields: [
      opts.users ?? [],
      opts.multiSigThreshold === undefined ? NONE : some(opts.multiSigThreshold),
      opts.beneficiaries ?? []
    ]
  };
  const proofOfLife: ConstrData = {
    alternative: 0,
    fields: [opts.unlockTime === undefined ? NONE : some(opts.unlockTime), opts.unlockTime === undefined ? NONE : some(50)]
  };
  return {
    alternative: 0,
    fields: [
      access,
      proofOfLife,
      [], // streaming_payments
      "", // wallet_name
      NONE, // intended_stake_credential
      opts.lastPermissionlessPayoutAt ?? NONE // last_permissionless_payout_at
    ]
  };
}

// ---------------------------------------------------------------------------
// crankSignerBypassesCooldown — mirrors the on-chain bypass predicate
// (`stt_payout_cooldown_tests.ak`). A `true` result means the crank is
// authorized and MUST preserve the cooldown stamp.
// ---------------------------------------------------------------------------

test("admin signer bypasses the cooldown", () => {
  const datum = state({ users: [user({ id: 0, wallets: [SIGNER], isAdmin: true })] });
  assert.equal(crankSignerBypassesCooldown(datum, SIGNER, 1_000), true);
});

test("non-admin signer with no power and no beneficiary does not bypass", () => {
  const datum = state({ users: [user({ id: 0, wallets: [SIGNER] })] });
  assert.equal(crankSignerBypassesCooldown(datum, SIGNER, 1_000), false);
});

test("multisig signer meeting the threshold bypasses", () => {
  const datum = state({
    users: [user({ id: 0, wallets: [SIGNER], multiSigPower: 5 })],
    multiSigThreshold: 5
  });
  assert.equal(crankSignerBypassesCooldown(datum, SIGNER, 1_000), true);
});

test("multisig signer below the threshold does not bypass", () => {
  const datum = state({
    users: [user({ id: 0, wallets: [SIGNER], multiSigPower: 3 })],
    multiSigThreshold: 5
  });
  assert.equal(crankSignerBypassesCooldown(datum, SIGNER, 1_000), false);
});

test("multisig power across two records counts per record (on-chain weight mechanism)", () => {
  const datum = state({
    users: [
      user({ id: 0, wallets: [SIGNER], multiSigPower: 3 }),
      user({ id: 1, wallets: [SIGNER], multiSigPower: 3 })
    ],
    multiSigThreshold: 5
  });
  assert.equal(crankSignerBypassesCooldown(datum, SIGNER, 1_000), true);
});

test("no multisig threshold means power alone does not bypass", () => {
  const datum = state({ users: [user({ id: 0, wallets: [SIGNER], multiSigPower: 99 })] });
  assert.equal(crankSignerBypassesCooldown(datum, SIGNER, 1_000), false);
});

test("unlocked beneficiary bypasses (tx_earliest at/after effective unlock)", () => {
  const datum = state({
    beneficiaries: [beneficiary({ id: 7, wallets: [SIGNER], unlockAfter: 100 })],
    unlockTime: 100
  });
  // tx_earliest == effective unlock (max(100, 100)) → reached (<=).
  assert.equal(crankSignerBypassesCooldown(datum, SIGNER, 100), true);
});

test("locked beneficiary does not bypass (unlock_after far out)", () => {
  const datum = state({
    beneficiaries: [beneficiary({ id: 7, wallets: [SIGNER], unlockAfter: 10_000 })],
    unlockTime: 100
  });
  assert.equal(crankSignerBypassesCooldown(datum, SIGNER, 200), false);
});

test("beneficiary with no global unlock_time never bypasses", () => {
  const datum = state({
    beneficiaries: [beneficiary({ id: 7, wallets: [SIGNER] })]
    // unlockTime omitted → proof-of-life unconfigured
  });
  assert.equal(crankSignerBypassesCooldown(datum, SIGNER, 1_000_000), false);
});

test("a signer absent from every access list does not bypass", () => {
  const datum = state({
    users: [user({ id: 0, wallets: [OTHER], isAdmin: true, multiSigPower: 9 })],
    multiSigThreshold: 1,
    beneficiaries: [beneficiary({ id: 7, wallets: [OTHER], unlockAfter: 0 })],
    unlockTime: 0
  });
  assert.equal(crankSignerBypassesCooldown(datum, SIGNER, 1_000), false);
});

// ---------------------------------------------------------------------------
// deriver preserve-vs-stamp: an authorized crank preserves the field, a
// permissionless crank stamps Some(tx_latest).
// ---------------------------------------------------------------------------

function streamingPayment(): ConstrData {
  return {
    alternative: 0,
    fields: [1, PLACEHOLDER_ADDRESS, 0, "", "", 1_000_000, 0, 259_200_000]
  };
}

function payoutTransfers(): PayoutTransfer[] {
  const amount: Asset[] = [{ unit: "lovelace", quantity: "1000000" }];
  return [
    {
      address: "",
      amount,
      inlineDatum: { alternative: 0, fields: [1, "00".repeat(32), 0] }
    }
  ];
}

test("authorized crank preserves last_permissionless_payout_at", () => {
  const input = state({
    lastPermissionlessPayoutAt: some(50_000)
  });
  input.fields[2] = [streamingPayment()];

  const { outputDatum } = deriveStreamingPaymentPayoutStateDatum(
    input,
    payoutTransfers(),
    90_000_000,
    true // authorized → preserve
  );

  assert.deepEqual(
    outputDatum.fields[5],
    input.fields[5],
    "authorized crank must leave last_permissionless_payout_at unchanged"
  );
});

test("permissionless crank stamps last_permissionless_payout_at = Some(tx_latest)", () => {
  const input = state({
    lastPermissionlessPayoutAt: some(50_000)
  });
  input.fields[2] = [streamingPayment()];

  const txLatestTimeMs = 90_000_000;
  const { outputDatum } = deriveStreamingPaymentPayoutStateDatum(
    input,
    payoutTransfers(),
    txLatestTimeMs,
    false // permissionless → stamp
  );

  assert.deepEqual(outputDatum.fields[5], { alternative: 0, fields: [txLatestTimeMs] });
});
