import assert from "node:assert/strict";
import test from "node:test";
import {
  isRepeatableBeneficiaryRecovery,
  REPEATABLE_RECOVERY_NOTICE
} from "@/lib/contracts/terminal-recovery";
import {
  createDefaultStateForm,
  stateFormToDatum
} from "@/lib/contracts/state-form";

const BENEFICIARY_PAYOUT_ADDRESS = "addr_test1vqg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygxrcya6";

function recoveryState(beneficiaryCount: number) {
  const state = createDefaultStateForm();
  state.beneficiaries = Array.from({ length: beneficiaryCount }, (_, index) => ({
    payoutAddress: BENEFICIARY_PAYOUT_ADDRESS,
    id: String(index + 1),
    wallets: [String(index + 1).padStart(56, "0")],
    unlockAfterMode: "none" as const,
    unlockAfter: "",
    weight: "1"
  }));
  state.proofOfLifeUnlockTimeMode = "some";
  state.proofOfLifeUnlockTime = "1000";
  state.proofOfLifeIncrementMode = "some";
  state.proofOfLifeIncrement = "60";
  return stateFormToDatum(state);
}

test("sole beneficiary recovery remains repeatable", () => {
  assert.equal(isRepeatableBeneficiaryRecovery(recoveryState(1)), true);
});

test("earlier beneficiary recovery remains one-shot", () => {
  assert.equal(isRepeatableBeneficiaryRecovery(recoveryState(2)), false);
});

test("repeatable recovery notice explains the remaining access path", () => {
  assert.match(REPEATABLE_RECOVERY_NOTICE, /stays available/i);
  assert.match(REPEATABLE_RECOVERY_NOTICE, /remaining/i);
  assert.match(REPEATABLE_RECOVERY_NOTICE, /funds sent later/i);
  assert.doesNotMatch(REPEATABLE_RECOVERY_NOTICE, /drains?/i);
});
