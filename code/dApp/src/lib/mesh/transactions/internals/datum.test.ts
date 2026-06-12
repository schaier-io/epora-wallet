import assert from "node:assert/strict";
import test from "node:test";

import type { ConstrData } from "@/lib/types/contracts";
import {
  createDefaultStateForm,
  stateFormToDatum,
  type BeneficiaryFormState,
  type StateFormState
} from "@/lib/contracts/state-form";
import {
  deriveBeneficiaryWithdrawalId,
  deriveBeneficiaryWithdrawalStateDatum
} from "@/lib/mesh/transactions/internals/datum";

function beneficiary(id: string, wallets: string[]): BeneficiaryFormState {
  return { id, wallets, unlockAfterMode: "none", unlockAfter: "", weight: "1" };
}

function stateWith(
  beneficiaries: BeneficiaryFormState[],
  overrides: Partial<StateFormState> = {}
): ConstrData {
  return stateFormToDatum({
    ...createDefaultStateForm(),
    beneficiaries,
    proofOfLifeUnlockTimeMode: "some",
    proofOfLifeUnlockTime: "1000",
    proofOfLifeIncrementMode: "some",
    proofOfLifeIncrement: "60",
    ...overrides
  });
}

// --- deriveBeneficiaryWithdrawalId -------------------------------------------

test("deriveBeneficiaryWithdrawalId returns the id of the matching beneficiary", () => {
  const datum = stateWith([beneficiary("0", ["cc"]), beneficiary("1", ["dd"])]);
  assert.equal(deriveBeneficiaryWithdrawalId(datum, "cc"), 0);
  assert.equal(deriveBeneficiaryWithdrawalId(datum, "dd"), 1);
});

test("deriveBeneficiaryWithdrawalId throws when no beneficiary matches the signer", () => {
  const datum = stateWith([beneficiary("0", ["cc"])]);
  assert.throws(() => deriveBeneficiaryWithdrawalId(datum, "zz"), /exactly one beneficiary/);
});

test("deriveBeneficiaryWithdrawalId throws when more than one beneficiary matches", () => {
  const datum = stateWith([beneficiary("0", ["cc"]), beneficiary("1", ["cc", "dd"])]);
  assert.throws(() => deriveBeneficiaryWithdrawalId(datum, "cc"), /exactly one beneficiary/);
});

// --- deriveBeneficiaryWithdrawalStateDatum -----------------------------------

test("deriveBeneficiaryWithdrawalStateDatum removes exactly the named beneficiary", () => {
  const input = stateWith([beneficiary("0", ["cc"]), beneficiary("1", ["dd"])], {
    walletName: "Vault"
  });
  const output = deriveBeneficiaryWithdrawalStateDatum(input, 0);

  const accessBeneficiaries = (output.fields[0] as ConstrData).fields[2] as ConstrData[];
  assert.equal(accessBeneficiaries.length, 1);
  assert.equal(accessBeneficiaries[0].fields[0], 1);
});

test("deriveBeneficiaryWithdrawalStateDatum preserves every other state field", () => {
  const input = stateWith([beneficiary("0", ["cc"]), beneficiary("1", ["dd"])], {
    walletName: "Vault"
  });
  const output = deriveBeneficiaryWithdrawalStateDatum(input, 0);

  // State fields: [access, proof_of_life, streaming_payments, wallet_name, intended_stake].
  // Only the access section (field 0) changes; the rest are untouched.
  assert.deepEqual(output.fields[1], input.fields[1]);
  assert.deepEqual(output.fields[2], input.fields[2]);
  assert.deepEqual(output.fields[3], input.fields[3]);
  assert.deepEqual(output.fields[4], input.fields[4]);
  // Users and multi-sig threshold inside the access section survive too.
  assert.deepEqual((output.fields[0] as ConstrData).fields[0], (input.fields[0] as ConstrData).fields[0]);
  assert.deepEqual((output.fields[0] as ConstrData).fields[1], (input.fields[0] as ConstrData).fields[1]);
});

test("deriveBeneficiaryWithdrawalStateDatum throws when the id is absent", () => {
  const input = stateWith([beneficiary("0", ["cc"])]);
  assert.throws(() => deriveBeneficiaryWithdrawalStateDatum(input, 99), /exactly one beneficiary with id 99/);
});
