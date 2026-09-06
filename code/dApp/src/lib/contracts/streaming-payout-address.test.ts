import assert from "node:assert/strict";
import test from "node:test";
import {
  pubKeyAddress,
  scriptAddress,
  serializeAddressObj,
  serializeRewardAddress
} from "@meshsdk/core";
import { CARDANO_NETWORK } from "@/lib/cardano-network";
import {
  createDefaultStateForm,
  stateFormFromDatum,
  stateFormToDatum
} from "@/lib/contracts/state-form";

const PAYMENT_KEY = "11".repeat(28);
const PAYMENT_SCRIPT = "22".repeat(28);
const STAKE_KEY = "33".repeat(28);
const STAKE_SCRIPT = "44".repeat(28);
const NETWORK_ID = CARDANO_NETWORK === "mainnet" ? 1 : 0;

function stateWithStreamingPayout(payoutAddress: string) {
  const state = createDefaultStateForm();
  state.streamingPayments = [
    {
      id: "1",
      payoutAddress,
      paidOutAmount: "0",
      policyId: "",
      assetName: "",
      amountPerDay: "1000000",
      startDate: "1",
      endDate: "2"
    }
  ];
  return state;
}

for (const [name, address] of [
  ["payment key", pubKeyAddress(PAYMENT_KEY, undefined, undefined)],
  ["payment script", scriptAddress(PAYMENT_SCRIPT, undefined, undefined)],
  ["payment key with staking key", pubKeyAddress(PAYMENT_KEY, STAKE_KEY, false)],
  ["payment key with staking script", pubKeyAddress(PAYMENT_KEY, STAKE_SCRIPT, true)],
  ["payment script with staking key", scriptAddress(PAYMENT_SCRIPT, STAKE_KEY, false)],
  ["payment script with staking script", scriptAddress(PAYMENT_SCRIPT, STAKE_SCRIPT, true)]
] as const) {
  test(`streaming payout address round trips ${name}`, () => {
    const payoutAddress = serializeAddressObj(address, NETWORK_ID);
    const datum = stateFormToDatum(stateWithStreamingPayout(payoutAddress));

    assert.equal(
      stateFormFromDatum(datum).streamingPayments[0]?.payoutAddress,
      payoutAddress
    );
    assert.deepEqual(stateFormToDatum(stateFormFromDatum(datum)), datum);
  });
}

test("streaming payout rejects malformed, wrong-network, and reward addresses", () => {
  const paymentAddress = pubKeyAddress(PAYMENT_KEY, undefined, undefined);
  const wrongNetworkAddress = serializeAddressObj(
    paymentAddress,
    NETWORK_ID === 0 ? 1 : 0
  );
  const rewardAddress = String(
    serializeRewardAddress(PAYMENT_KEY, false, NETWORK_ID)
  );

  for (const payoutAddress of [
    "not-an-address",
    wrongNetworkAddress,
    rewardAddress
  ]) {
    assert.throws(
      () => stateFormToDatum(stateWithStreamingPayout(payoutAddress)),
      /streaming payment 1 payout address/i
    );
  }
});

test("streaming payout rejects a pointer address instead of dropping its stake pointer", () => {
  const pointerDatum = {
    constructor: 0,
    fields: [
      { constructor: 0, fields: [{ bytes: PAYMENT_KEY }] },
      {
        constructor: 0,
        fields: [
          {
            constructor: 1,
            fields: [{ int: 1 }, { int: 1 }, { int: 1 }]
          }
        ]
      }
    ]
  };
  const pointerAddress = serializeAddressObj(
    pointerDatum as unknown as Parameters<typeof serializeAddressObj>[0],
    NETWORK_ID
  );

  assert.throws(
    () => stateFormToDatum(stateWithStreamingPayout(pointerAddress)),
    /cannot preserve the full address/i
  );
});
