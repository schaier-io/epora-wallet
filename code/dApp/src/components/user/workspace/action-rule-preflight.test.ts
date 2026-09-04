import assert from "node:assert/strict";
import test from "node:test";

import type { Data } from "@meshsdk/common";

import {
  getBeneficiaryRuleError,
  getOperatorRuleError,
  getStreamingPayoutRuleError
} from "./action-rule-preflight";
import {
  createDefaultStateForm,
  createDefaultUserFormState
} from "@/lib/contracts/state-form";
import type { ConstrData } from "@/lib/types/contracts";

const SIGNER = "ab".repeat(28);
const OTHER = "cd".repeat(28);
const NONE: ConstrData = { alternative: 1, fields: [] };
const FALSE: ConstrData = { alternative: 0, fields: [] };
const TRUE: ConstrData = { alternative: 1, fields: [] };

function some(value: Data): ConstrData {
  return { alternative: 0, fields: [value] };
}

function payoutDatum(options: {
  signer: string;
  isAdmin?: boolean;
  lastPayoutAt?: number;
}): ConstrData {
  const user: ConstrData = {
    alternative: 0,
    fields: [
      0,
      [options.signer],
      [],
      [],
      0,
      FALSE,
      NONE,
      options.isAdmin ? TRUE : FALSE
    ]
  };
  return {
    alternative: 0,
    fields: [
      { alternative: 0, fields: [[user], NONE, []] },
      { alternative: 0, fields: [NONE, NONE] },
      [],
      "",
      NONE,
      options.lastPayoutAt === undefined ? NONE : some(options.lastPayoutAt)
    ]
  };
}

test("operator preflight rejects a connected key outside the selected path", () => {
  const state = createDefaultStateForm();
  state.users = [
    {
      ...createDefaultUserFormState("0"),
      wallets: [OTHER],
      isAdmin: true,
      preset: "admin"
    }
  ];

  assert.match(getOperatorRuleError(state, SIGNER, "admin") ?? "", /not an owner/);
});

test("operator preflight rejects an unreachable co-signer threshold", () => {
  const state = createDefaultStateForm();
  state.users = [
    {
      ...createDefaultUserFormState("0"),
      wallets: [SIGNER],
      multiSigPowerMode: "some",
      multiSigPower: "1"
    }
  ];
  state.multiSigThresholdMode = "some";
  state.multiSigThreshold = "2";

  assert.match(getOperatorRuleError(state, SIGNER, "multisig") ?? "", /cannot be met/);
});

test("beneficiary preflight uses the later recovery deadline", () => {
  const state = createDefaultStateForm();
  state.proofOfLifeUnlockTimeMode = "some";
  state.proofOfLifeUnlockTime = "1000";
  state.beneficiaries = [
    {
      id: "7",
      wallets: [SIGNER],
      unlockAfterMode: "some",
      unlockAfter: "2000",
      weight: "1"
    }
  ];

  assert.match(getBeneficiaryRuleError(state, SIGNER, 1999) ?? "", /still too early/);
  assert.equal(getBeneficiaryRuleError(state, SIGNER, 2000), null);
});

test("beneficiary preflight explains when recovery is off", () => {
  const state = createDefaultStateForm();
  state.beneficiaries = [
    {
      id: "7",
      wallets: [SIGNER],
      unlockAfterMode: "none",
      unlockAfter: "",
      weight: "1"
    }
  ];

  assert.match(getBeneficiaryRuleError(state, SIGNER, 2000) ?? "", /no proof of life deadline/);
});

test("scheduled-payment preflight rejects an unauthorized signer", () => {
  const error = getStreamingPayoutRuleError({
    stateDatum: payoutDatum({ signer: OTHER }),
    signerKeyHashes: [SIGNER],
    txEarliestTimeMs: 2_000,
    txLatestTimeMs: 3_000
  });

  assert.match(error ?? "", /not allowed to pay scheduled payments/);
});

test("scheduled-payment preflight enforces cooldown for a non-owner", () => {
  const error = getStreamingPayoutRuleError({
    stateDatum: payoutDatum({ signer: SIGNER, lastPayoutAt: 1_000 }),
    signerKeyHashes: [SIGNER],
    txEarliestTimeMs: 2_000,
    txLatestTimeMs: 3_000
  });

  assert.match(error ?? "", /cooldown/);
});

test("scheduled-payment preflight lets an owner bypass cooldown", () => {
  const error = getStreamingPayoutRuleError({
    stateDatum: payoutDatum({ signer: SIGNER, isAdmin: true, lastPayoutAt: 1_000 }),
    signerKeyHashes: [SIGNER],
    txEarliestTimeMs: 2_000,
    txLatestTimeMs: 3_000
  });

  assert.equal(error, null);
});
