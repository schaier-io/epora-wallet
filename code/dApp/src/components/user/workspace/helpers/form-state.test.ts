import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_SAFETY_TIMER_MS } from "@/components/user/workspace/constants";
import {
  createDefaultBeneficiaryFormState,
  createDefaultStateForm,
  createDefaultStreamingPaymentFormState,
  createDefaultUserFormState
} from "@/lib/contracts/state-form";
import {
  approvalPowerForUser,
  reachableApprovalPower,
  scheduledPaymentRateForPeriod,
  withApprovalPowerEnabled,
  withMultiApprovalEnabled,
  withProofOfLifeIncrement,
  withProofOfLifeUnlockTime,
  withRecoveryContactAdded,
  withSafetyTimerEnabled,
  withScheduledPaymentAdded,
  withScheduledPaymentRate,
  withUserAdded,
  withUserAdminEnabled
} from "./form-state";

const NOW_MS = 1_750_000_000_000;

test("withUserAdded creates the requested role with the next id and an optional wallet", () => {
  const form = createDefaultStateForm();
  form.walletName = "Kept";
  form.users = [createDefaultUserFormState("2"), createDefaultUserFormState("draft")];

  const withOwner = withUserAdded(form, "admin", "  abcd  ");
  const owner = withOwner.users.at(-1)!;

  assert.equal(form.users.length, 2);
  assert.equal(withOwner.walletName, "Kept");
  assert.equal(owner.id, "3");
  assert.deepEqual(owner.wallets, ["abcd"]);
  assert.equal(owner.preset, "admin");
  assert.equal(owner.isAdmin, true);
  assert.equal(owner.canRenewProofOfLife, true);

  const withSpender = withUserAdded(form, "limited-withdrawal");
  const spender = withSpender.users.at(-1)!;
  assert.equal(spender.preset, "limited-withdrawal");
  assert.equal(spender.isAdmin, false);
  assert.deepEqual(spender.wallets, []);
});

test("withSafetyTimerEnabled changes both modes and preserves hidden values", () => {
  const form = createDefaultStateForm();
  const enabled = withSafetyTimerEnabled(form, true, NOW_MS);

  assert.equal(enabled.proofOfLifeUnlockTimeMode, "some");
  assert.equal(enabled.proofOfLifeIncrementMode, "some");
  assert.equal(
    enabled.proofOfLifeUnlockTime,
    String(NOW_MS + DEFAULT_SAFETY_TIMER_MS)
  );
  assert.equal(enabled.proofOfLifeIncrement, String(DEFAULT_SAFETY_TIMER_MS));

  const disabled = withSafetyTimerEnabled(enabled, false, NOW_MS + 1);
  assert.equal(disabled.proofOfLifeUnlockTimeMode, "none");
  assert.equal(disabled.proofOfLifeIncrementMode, "none");
  assert.equal(disabled.proofOfLifeUnlockTime, enabled.proofOfLifeUnlockTime);
  assert.equal(disabled.proofOfLifeIncrement, enabled.proofOfLifeIncrement);
});

test("proof-of-life value changes repair a half-configured timer", () => {
  const form = createDefaultStateForm();
  form.proofOfLifeUnlockTimeMode = "some";
  form.proofOfLifeUnlockTime = "";
  form.proofOfLifeIncrementMode = "none";
  form.proofOfLifeIncrement = "";

  const withUnlock = withProofOfLifeUnlockTime(form, "123", NOW_MS);
  assert.equal(withUnlock.proofOfLifeUnlockTime, "123");
  assert.equal(withUnlock.proofOfLifeIncrementMode, "some");
  assert.equal(withUnlock.proofOfLifeIncrement, String(DEFAULT_SAFETY_TIMER_MS));

  const withIncrement = withProofOfLifeIncrement(form, "456", NOW_MS);
  assert.equal(withIncrement.proofOfLifeIncrement, "456");
  assert.equal(withIncrement.proofOfLifeUnlockTimeMode, "some");
  assert.equal(
    withIncrement.proofOfLifeUnlockTime,
    String(NOW_MS + DEFAULT_SAFETY_TIMER_MS)
  );
});

test("withRecoveryContactAdded adds required proof-of-life defaults without replacing timer input", () => {
  const form = createDefaultStateForm();
  form.beneficiaries = [createDefaultBeneficiaryFormState("4")];
  form.proofOfLifeUnlockTime = "111";
  form.proofOfLifeIncrement = "222";

  const next = withRecoveryContactAdded(form, NOW_MS);

  assert.equal(form.beneficiaries.length, 1);
  assert.equal(next.beneficiaries.length, 2);
  assert.equal(next.beneficiaries[1]?.id, "5");
  assert.equal(next.proofOfLifeUnlockTimeMode, "some");
  assert.equal(next.proofOfLifeIncrementMode, "some");
  assert.equal(next.proofOfLifeUnlockTime, "111");
  assert.equal(next.proofOfLifeIncrement, "222");
});

test("withScheduledPaymentAdded creates an unsettled payment with the next id", () => {
  const form = createDefaultStateForm();
  form.streamingPayments = [createDefaultStreamingPaymentFormState("7")];

  const next = withScheduledPaymentAdded(form);

  assert.equal(form.streamingPayments.length, 1);
  assert.equal(next.streamingPayments.length, 2);
  assert.equal(next.streamingPayments[1]?.id, "8");
  assert.equal(next.streamingPayments[1]?.paidOutAmount, "0");
});

test("user role and approval transitions preserve unrelated custom fields", () => {
  const user = createDefaultUserFormState("1");
  user.preset = "custom";
  user.perDayAllowance = [{ policyId: "", assetName: "", amount: "10" }];
  user.canRenewProofOfLife = false;
  user.multiSigPower = "9";

  const owner = withUserAdminEnabled(user, true);
  assert.equal(owner.isAdmin, true);
  assert.equal(owner.canRenewProofOfLife, true);
  assert.deepEqual(owner.perDayAllowance, user.perDayAllowance);

  const formerOwner = withUserAdminEnabled(owner, false);
  assert.equal(formerOwner.isAdmin, false);
  assert.equal(formerOwner.canRenewProofOfLife, true);

  const approvalEnabled = withApprovalPowerEnabled(user, true);
  assert.equal(approvalEnabled.multiSigPowerMode, "some");
  assert.equal(approvalEnabled.multiSigPower, "9");
  assert.equal(withApprovalPowerEnabled(approvalEnabled, false).multiSigPowerMode, "none");
});

test("approval power distinguishes configured power from reachable power", () => {
  const configured = createDefaultUserFormState("1");
  configured.multiSigPowerMode = "some";
  configured.multiSigPower = "5";
  const reachable = { ...configured, id: "2", wallets: ["abcd"], multiSigPower: "3" };
  const ignored = ["", "0", "-1", "words"].map((power, index) => ({
    ...configured,
    id: String(index + 3),
    wallets: ["abcd"],
    multiSigPower: power
  }));

  assert.equal(approvalPowerForUser(configured), 5);
  assert.equal(reachableApprovalPower([configured, reachable, ...ignored]), 3);
  assert.equal(
    approvalPowerForUser({ ...configured, multiSigPowerMode: "none", multiSigPower: "5" }),
    0
  );
});

test("withMultiApprovalEnabled supplies one usable default and keeps typed input", () => {
  const form = createDefaultStateForm();
  const enabled = withMultiApprovalEnabled(form, true);
  assert.equal(enabled.multiSigThresholdMode, "some");
  assert.equal(enabled.multiSigThreshold, "2");

  enabled.multiSigThreshold = "5";
  const disabled = withMultiApprovalEnabled(enabled, false);
  assert.equal(disabled.multiSigThresholdMode, "none");
  assert.equal(disabled.multiSigThreshold, "5");
});

test("scheduled-payment rates convert ADA and native-asset periods without fractions", () => {
  const ada = createDefaultStreamingPaymentFormState("1");
  const adaPerDay = withScheduledPaymentRate(ada, "7", 7);
  assert.equal(adaPerDay.amountPerDay, "1000000");
  assert.equal(scheduledPaymentRateForPeriod(adaPerDay, 7), "7000000");

  const nativeAsset = {
    ...ada,
    policyId: "aa",
    assetName: "bb"
  };
  const nativePerDay = withScheduledPaymentRate(nativeAsset, "10", 7);
  assert.equal(nativePerDay.amountPerDay, "1");
  assert.equal(scheduledPaymentRateForPeriod(nativePerDay, 7), "7");
  assert.equal(withScheduledPaymentRate(nativeAsset, "draft", 30).amountPerDay, "draft");
});
