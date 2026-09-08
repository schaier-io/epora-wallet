import assert from "node:assert/strict";
import test from "node:test";

import { deriveWalletAccessSummary } from "./wallet-access-summary";
import {
  createDefaultStateForm,
  type BeneficiaryFormState,
  type UserFormState
} from "@/lib/contracts/state-form";

const KEY = "ab".repeat(28);

function user(overrides: Partial<UserFormState>): UserFormState {
  return {
    id: "0",
    wallets: [],
    perDayAllowance: [],
    remainingAllowance: [],
    nextAllowanceReset: "0",
    canRenewProofOfLife: false,
    multiSigPowerMode: "none",
    multiSigPower: "",
    isAdmin: false,
    preset: "custom",
    ...overrides
  };
}

function beneficiary(overrides: Partial<BeneficiaryFormState>): BeneficiaryFormState {
  return {
    id: "0",
    wallets: [],
    payoutAddress: "addr_test1recovery",
    unlockAfterMode: "none",
    unlockAfter: "",
    weight: "1",
    ...overrides
  };
}

test("summarizes every role and permission held by the connected key", () => {
  const state = createDefaultStateForm();
  state.multiSigThresholdMode = "some";
  state.multiSigThreshold = "3";
  state.proofOfLifeUnlockTimeMode = "some";
  state.proofOfLifeUnlockTime = "2000";
  state.users = [
    user({ wallets: [KEY], isAdmin: true, canRenewProofOfLife: true }),
    user({
      id: "1",
      wallets: [KEY],
      multiSigPowerMode: "some",
      multiSigPower: "2",
      perDayAllowance: [{ policyId: "", assetName: "", amount: "12" }]
    })
  ];
  state.beneficiaries = [
    beneficiary({ wallets: [KEY], unlockAfterMode: "some", unlockAfter: "3000", weight: "2" })
  ];

  const summary = deriveWalletAccessSummary(state, KEY);

  assert.deepEqual(summary.roles, ["owner", "co-signer", "spender", "proof-of-life", "recovery"]);
  assert.deepEqual(summary.approvalPowers, ["2"]);
  assert.equal(summary.approvalThreshold, "3");
  assert.deepEqual(summary.dailyAllowances, [
    { policyId: "", assetName: "", amount: "12" }
  ]);
  assert.equal(summary.canRenewProofOfLife, true);
  assert.deepEqual(summary.recoveryAccess, [{ weight: "2", unlockAfter: "3000" }]);
});

test("a listed user without permissions is not called a spender", () => {
  const state = createDefaultStateForm();
  state.users = [user({ wallets: [KEY] })];

  const summary = deriveWalletAccessSummary(state, KEY);

  assert.deepEqual(summary.roles, ["listed-user"]);
  assert.deepEqual(summary.dailyAllowances, []);
  assert.equal(summary.canSend, false);
});

test("a missing connected key produces a read-only summary", () => {
  const summary = deriveWalletAccessSummary(createDefaultStateForm(), null);

  assert.equal(summary.readOnly, true);
  assert.deepEqual(summary.roles, []);
});
