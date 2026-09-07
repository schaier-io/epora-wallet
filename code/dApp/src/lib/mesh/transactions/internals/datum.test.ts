import assert from "node:assert/strict";
import test from "node:test";

import type { ConstrData } from "@/lib/types/contracts";
import {
  createDefaultStateForm,
  stateFormToDatum,
  type BeneficiaryFormState,
  type StateFormState
} from "@/lib/contracts/state-form";
import { buildSttSpendRedeemerData } from "@/lib/contracts/action-data";
import { MAX_ON_CHAIN_STATE_INTEGER } from "@/lib/contracts/on-chain-integer";
import {
  decodeConstrDatumFromUtxo,
  deriveBeneficiaryExitStateDatum,
  deriveBeneficiaryWithdrawalId,
  deriveBeneficiaryWithdrawalStateDatum
} from "@/lib/mesh/transactions/internals/datum";
import { serializeData, type UTxO } from "@meshsdk/core";

const BENEFICIARY_PAYOUT_ADDRESS = "addr_test1vqg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygxrcya6";

function beneficiary(id: string, wallets: string[]): BeneficiaryFormState {
  return { payoutAddress: BENEFICIARY_PAYOUT_ADDRESS, id, wallets, unlockAfterMode: "none", unlockAfter: "", weight: "1" };
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
  const output = deriveBeneficiaryWithdrawalStateDatum(input, 0, 2_000);

  const accessBeneficiaries = (output.fields[0] as ConstrData).fields[2] as ConstrData[];
  assert.equal(accessBeneficiaries.length, 1);
  assert.equal(accessBeneficiaries[0]!.fields[0], 1);
});

test("earlier beneficiary withdrawal preserves every other state field", () => {
  const input = stateWith([beneficiary("0", ["cc"]), beneficiary("1", ["dd"])], {
    walletName: "Vault",
    lastNonAdminPayoutAt: { alternative: 0, fields: [123] }
  });
  const output = deriveBeneficiaryWithdrawalStateDatum(input, 0, 2_000);

  // State fields: [access, proof_of_life, streaming_payments, wallet_name, intended_stake].
  // Only the access section (field 0) changes; the rest are untouched.
  assert.deepEqual(output.fields[1], input.fields[1]);
  assert.deepEqual(output.fields[2], input.fields[2]);
  assert.deepEqual(output.fields[3], input.fields[3]);
  assert.deepEqual(output.fields[4], input.fields[4]);
  assert.deepEqual(output.fields[5], input.fields[5]);
  // Users and multi-sig threshold inside the access section survive too.
  assert.deepEqual((output.fields[0] as ConstrData).fields[0], (input.fields[0] as ConstrData).fields[0]);
  assert.deepEqual((output.fields[0] as ConstrData).fields[1], (input.fields[0] as ConstrData).fields[1]);
});

test("final beneficiary withdrawal preserves the beneficiary and stamps the upper bound", () => {
  const input = stateWith([beneficiary("0", ["cc"])], { walletName: "Vault" });
  const output = deriveBeneficiaryWithdrawalStateDatum(input, 0, 2_000);

  assert.deepEqual(output.fields.slice(0, 5), input.fields.slice(0, 5));
  assert.deepEqual(output.fields[5], { alternative: 0, fields: [2_000] });
});

test("deriveBeneficiaryWithdrawalStateDatum throws when the id is absent", () => {
  const input = stateWith([beneficiary("0", ["cc"])]);
  assert.throws(
    () => deriveBeneficiaryWithdrawalStateDatum(input, 99, 2_000),
    /exactly one beneficiary with id 99/
  );
});

test("beneficiary recovery reads and builds the exact uint64 maximum id", () => {
  const input = stateWith([
    beneficiary(MAX_ON_CHAIN_STATE_INTEGER.toString(), ["cc"])
  ]);
  const plutusData = serializeData(input, "Mesh");
  const decoded = decodeConstrDatumFromUtxo({
    input: { txHash: "a".repeat(64), outputIndex: 0 },
    output: { address: "addr_test1", amount: [], plutusData }
  } as unknown as UTxO);

  assert.ok(decoded);
  const beneficiaryId = deriveBeneficiaryWithdrawalId(decoded, "cc");
  assert.equal(beneficiaryId, MAX_ON_CHAIN_STATE_INTEGER);
  const output = deriveBeneficiaryWithdrawalStateDatum(
    decoded,
    beneficiaryId,
    MAX_ON_CHAIN_STATE_INTEGER
  );
  assert.deepEqual(output.fields[5], {
    alternative: 0,
    fields: [MAX_ON_CHAIN_STATE_INTEGER]
  });
  assert.deepEqual(
    buildSttSpendRedeemerData({ kind: "beneficiary-withdrawal", beneficiaryId }),
    { alternative: 3, fields: [MAX_ON_CHAIN_STATE_INTEGER] }
  );
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

// 2^53 + 1 fits a Plutus integer but not a JS number. It must remain bigint so
// Mesh forwards it as an integer instead of changing it into Plutus bytes.
test("decodeConstrDatumFromUtxo preserves an integer above the safe number range", () => {
  const plutusData = serializeData({ alternative: 0, fields: [9007199254740993n] }, "Mesh");
  const utxo = {
    input: { txHash: "a".repeat(64), outputIndex: 0 },
    output: { address: "addr_test1", amount: [], plutusData }
  } as unknown as UTxO;
  assert.deepEqual(decodeConstrDatumFromUtxo(utxo), {
    alternative: 0,
    fields: [9007199254740993n]
  });
});

test("decodeConstrDatumFromUtxo still reads integers up to the safe limit", () => {
  const plutusData = serializeData({ alternative: 0, fields: [9007199254740991n] }, "Mesh");
  const utxo = {
    input: { txHash: "a".repeat(64), outputIndex: 0 },
    output: { address: "addr_test1", amount: [], plutusData }
  } as unknown as UTxO;
  assert.deepEqual(decodeConstrDatumFromUtxo(utxo), {
    alternative: 0,
    fields: [9007199254740991]
  });
});


test("permanent final exit removes the beneficiary and stamps its upper bound", () => {
  const input = stateWith([beneficiary("0", ["cc"])], { walletName: "Vault" });
  const output = deriveBeneficiaryExitStateDatum(input, 0, 1_000, 2_000);
  assert.deepEqual((output.fields[0] as ConstrData).fields[2], []);
  assert.deepEqual((output.fields[0] as ConstrData).fields.slice(0, 2), (input.fields[0] as ConstrData).fields.slice(0, 2));
  assert.deepEqual(output.fields.slice(1, 5), input.fields.slice(1, 5));
  assert.deepEqual(output.fields[5], { alternative: 0, fields: [2_000] });
  assert.equal(((input.fields[0] as ConstrData).fields[2] as unknown[]).length, 1);
  const decoded = decodeConstrDatumFromUtxo(utxoWithDatum(serializeData(output)));
  assert.deepEqual(decoded, output);
});

test("permanent earlier exit preserves streams and cadence", () => {
  const input = stateWith([beneficiary("0", ["cc"]), beneficiary("1", ["dd"])], {
    lastNonAdminPayoutAt: { alternative: 0, fields: [999] }
  });
  input.fields[2] = [{ alternative: 0, fields: [] }];
  assert.deepEqual(deriveBeneficiaryExitStateDatum(input, 0, 1_000, 2_000), deriveBeneficiaryWithdrawalStateDatum(input, 0, 2_000));
});

test("permanent final exit requires empty streams and the finite cooldown window", () => {
  const input = stateWith([beneficiary("0", ["cc"])]);
  const withStream = structuredClone(input);
  withStream.fields[2] = [{ alternative: 0, fields: [] }];
  assert.throws(() => deriveBeneficiaryExitStateDatum(withStream, 0, 1_000, 2_000), /settled and removed/);
  assert.throws(() => deriveBeneficiaryExitStateDatum(input, 0, 0, 3_600_001), /window/i);
  assert.throws(() => deriveBeneficiaryExitStateDatum(input, 0, Infinity, Infinity), /finite/i);
  input.fields[5] = { alternative: 0, fields: [1_000] };
  assert.throws(() => deriveBeneficiaryExitStateDatum(input, 0, 1_800_999, 1_801_999), /cooldown/i);
  assert.doesNotThrow(() => deriveBeneficiaryExitStateDatum(input, 0, 1_801_000, 1_802_000));
  assert.throws(() => deriveBeneficiaryExitStateDatum(input, 99, 1_801_000, 1_802_000), /exactly one beneficiary/);
});
