import assert from "node:assert/strict";
import test from "node:test";
import { settingsValidationTask } from "./settings-validation-task";
import { describeStateValidationError } from "./state-validation-copy";
test("maps translated validator subjects to the failing settings task", () => {
  for (const [path, task] of [["state.users[12].per_day_allowance", "settings-people"], ["state.wallet_name", "settings-wallet-name"], ["state.multi_sig_threshold.Some", "settings-multisig-threshold"], ["state.beneficiaries[3].unlock_after", "settings-people"], ["state.proof_of_life_increment.Some", "settings-proof-of-life"]]) {
    assert.equal(settingsValidationTask(describeStateValidationError(`${path} must be valid.`)), task);
  }
  assert.equal(
    settingsValidationTask("No group of co-signers can reach the approval power needed. Confirm it, or lower it."),
    "settings-multisig-threshold"
  );
  assert.equal(settingsValidationTask("Unknown global failure."), null);
});
