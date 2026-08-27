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
  decodeConstrDatumFromUtxo,
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
  assert.equal(accessBeneficiaries[0]!.fields[0], 1);
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

// --- decodeConstrDatumFromUtxo: only genuine constructor datums may pass ---

function utxoWithDatum(plutusData: string | undefined): Parameters<typeof decodeConstrDatumFromUtxo>[0] {
  return {
    input: { txHash: "0".repeat(64), outputIndex: 0 },
    output: { address: "addr_test1...", amount: [], plutusData },
  } as unknown as Parameters<typeof decodeConstrDatumFromUtxo>[0];
}

test("decodeConstrDatumFromUtxo decodes a constructor datum", () => {
  // CBOR d87980 = Constr 0 []
  const decoded = decodeConstrDatumFromUtxo(utxoWithDatum("d87980"));
  assert.deepEqual(decoded, { alternative: 0, fields: [] });
});

test("decodeConstrDatumFromUtxo returns null when no inline datum is present", () => {
  assert.equal(decodeConstrDatumFromUtxo(utxoWithDatum(undefined)), null);
});

test("decodeConstrDatumFromUtxo rejects a decodable non-constructor scalar datum", () => {
  // CBOR 182a = integer 42, which decodes to a non-object, so the isConstrData
  // guard rejects it (the old presence-only key check deferred this to
  // downstream field readers).
  assert.equal(decodeConstrDatumFromUtxo(utxoWithDatum("182a")), null);
});

test("decodeConstrDatumFromUtxo rejects a decodable non-constructor OBJECT datum", () => {
  // CBOR 80 = empty Plutus list, which deserializes to { list: [] }: a
  // decodable OBJECT lacking a numeric `alternative` / array `fields`. This
  // reaches the isConstrData guard's shape-rejection branch (a datum that is
  // present, valid Plutus Data, decodes cleanly, but is not a constructor).
  assert.equal(decodeConstrDatumFromUtxo(utxoWithDatum("80")), null);
});
