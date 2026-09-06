import assert from "node:assert/strict";
import test from "node:test";
import { pubKeyAddress, scriptAddress, serializeAddressObj } from "@meshsdk/core";
import { CARDANO_NETWORK } from "@/lib/cardano-network";
import {
  createDefaultBeneficiaryFormState,
  createDefaultStateForm,
  stateFormFromDatum,
  stateFormToDatum,
  type BeneficiaryFormState
} from "./state-form";
import { validateMintStateDatum } from "./state-validation";
import { readStateSections } from "./state-layout";
import type { ConstrData } from "@/lib/types/contracts";

const PAYMENT_KEY = "11".repeat(28);
const PAYMENT_SCRIPT = "22".repeat(28);
const STAKE_KEY = "33".repeat(28);
const STAKE_SCRIPT = "44".repeat(28);
const NETWORK_ID = CARDANO_NETWORK === "mainnet" ? 1 : 0;

function form(payoutAddress: string) {
  return {
    ...createDefaultStateForm(),
    proofOfLifeUnlockTimeMode: "some" as const,
    proofOfLifeUnlockTime: "1000",
    proofOfLifeIncrementMode: "some" as const,
    proofOfLifeIncrement: "60",
    beneficiaries: [{
      ...createDefaultBeneficiaryFormState("9"),
      wallets: [PAYMENT_KEY], weight: "3", payoutAddress
    }]
  };
}

function beneficiary(datum: ConstrData): ConstrData {
  return readStateSections(datum).beneficiaries[0] as ConstrData;
}

for (const [name, address] of [
  ["payment key", pubKeyAddress(PAYMENT_KEY, undefined, undefined)],
  ["payment script", scriptAddress(PAYMENT_SCRIPT, undefined, undefined)],
  ["payment key with staking key", pubKeyAddress(PAYMENT_KEY, STAKE_KEY, false)],
  ["payment key with staking script", pubKeyAddress(PAYMENT_KEY, STAKE_SCRIPT, true)],
  ["payment script with staking key", scriptAddress(PAYMENT_SCRIPT, STAKE_KEY, false)],
  ["payment script with staking script", scriptAddress(PAYMENT_SCRIPT, STAKE_SCRIPT, true)]
] as const) {
  test(`beneficiary payout address round trips ${name}`, () => {
    const payoutAddress = serializeAddressObj(address, NETWORK_ID);
    const datum = stateFormToDatum(form(payoutAddress));
    const record = beneficiary(datum);
    assert.equal(record.fields.length, 5);
    assert.equal(record.fields[3], 3, "weight stays at index 3");
    assert.deepEqual(validateMintStateDatum(datum), []);
    assert.equal(stateFormFromDatum(datum).beneficiaries[0]!.payoutAddress, payoutAddress);
    assert.deepEqual(stateFormToDatum(stateFormFromDatum(datum)), datum);
  });
}

test("beneficiary address is explicit and is never inferred from signing keys", () => {
  assert.equal(createDefaultBeneficiaryFormState().payoutAddress, "");
  const input = form(serializeAddressObj(pubKeyAddress(PAYMENT_KEY, undefined, undefined), NETWORK_ID));
  input.beneficiaries[0] = { ...input.beneficiaries[0]!, payoutAddress: undefined } as unknown as BeneficiaryFormState;
  assert.throws(() => stateFormToDatum(input), /requires a payout address/);
  assert.throws(() => stateFormToDatum(form("")), /requires a payout address/);
});

test("legacy and unknown beneficiary schemas fail explicitly", () => {
  const payoutAddress = serializeAddressObj(pubKeyAddress(PAYMENT_KEY, undefined, undefined), NETWORK_ID);
  for (const fieldCount of [4, 6]) {
    const datum = stateFormToDatum(form(payoutAddress));
    const record = beneficiary(datum);
    record.fields = fieldCount === 4 ? record.fields.slice(0, 4) : [...record.fields, 0];
    assert.throws(() => stateFormFromDatum(datum), /unsupported schema.*five fields/i);
    assert.ok(validateMintStateDatum(datum).some((message) => /five fields.*payout address/i.test(message)));
  }
});

test("beneficiary payout address rejects malformed data and wrong-network input", () => {
  const address = pubKeyAddress(PAYMENT_KEY, undefined, undefined);
  assert.throws(() => stateFormToDatum(form("not-an-address")), /payout address/i);
  assert.throws(() => stateFormToDatum(form(serializeAddressObj(address, NETWORK_ID === 0 ? 1 : 0))), /payout address/i);
  for (const malformed of [PAYMENT_KEY, serializeAddressObj(address, NETWORK_ID), { alternative: 0, fields: [] }]) {
    const datum = stateFormToDatum(form(serializeAddressObj(address, NETWORK_ID)));
    beneficiary(datum).fields[4] = malformed;
    assert.throws(() => stateFormFromDatum(datum), /payout address/);
    assert.ok(validateMintStateDatum(datum).some((message) => /address/i.test(message)));
  }
});

test("beneficiary payout rejects a pointer address instead of dropping its staking credential", () => {
  const pointerDatum = {
    constructor: 0,
    fields: [
      { constructor: 0, fields: [{ bytes: PAYMENT_KEY }] },
      { constructor: 0, fields: [{ constructor: 1, fields: [{ int: 1 }, { int: 1 }, { int: 1 }] }] }
    ]
  };
  // Mesh's runtime serializes pointers, although its exported type lists only inline staking credentials.
  const pointerAddress = serializeAddressObj(pointerDatum as unknown as Parameters<typeof serializeAddressObj>[0], NETWORK_ID);
  assert.throws(() => stateFormToDatum(form(pointerAddress)), /cannot preserve the full address/i);
});

test("beneficiary payout accepts canonical bech32 case and whitespace normalization", () => {
  const address = serializeAddressObj(scriptAddress(PAYMENT_SCRIPT, STAKE_KEY, false), NETWORK_ID);
  const datum = stateFormToDatum(form(`  ${address.toUpperCase()}  `));
  assert.equal(stateFormFromDatum(datum).beneficiaries[0]!.payoutAddress, address);
});
