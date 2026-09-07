import assert from "node:assert/strict";
import test from "node:test";

import {
  createDefaultStreamingPaymentFormState
} from "@/lib/contracts/state-form";
import { checkSelectedFundPoolCoverage } from "./workspace-fund-selection";

const TX_HASH = "aa".repeat(32);
const selectedRefs = [{ txHash: TX_HASH, outputIndex: 0 }];
const lockedUtxos = [
  {
    input: selectedRefs[0],
    output: {
      address: "addr_test1vqg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygxrcya6",
      amount: [{ unit: "lovelace", quantity: "5000000" }]
    }
  }
];
const transfers = [
  {
    address: "addr_test1recipient",
    amount: [{ unit: "lovelace", quantity: "3000000" }]
  }
];
const streamingPayments = [
  {
    ...createDefaultStreamingPaymentFormState("1"),
    amountPerDay: "86400000000000",
    startDate: "0",
    endDate: "1000",
    paidOutAmount: "0"
  }
];

test("checks selected pools against the reserve at the build upper bound", () => {
  assert.equal(
    checkSelectedFundPoolCoverage({
      lockedUtxos: lockedUtxos as never,
      selectedRefs,
      transfers,
      streamingPayments,
      txLatestTimeMs: 1
    }),
    "covered"
  );
  assert.equal(
    checkSelectedFundPoolCoverage({
      lockedUtxos: lockedUtxos as never,
      selectedRefs,
      transfers,
      streamingPayments,
      txLatestTimeMs: 2
    }),
    "insufficient"
  );
});

test("defers to the builder when a selected pool is not loaded", () => {
  assert.equal(
    checkSelectedFundPoolCoverage({
      lockedUtxos: [],
      selectedRefs,
      transfers,
      streamingPayments,
      txLatestTimeMs: 101
    }),
    "not-loaded"
  );
});

test("checks the continuing address minimum for a selected orphan fund pool", () => {
  const tokenPool = {
    input: selectedRefs[0],
    output: {
      ...lockedUtxos[0].output,
      amount: [
        { unit: "lovelace", quantity: "5000000" },
        { unit: `${"ab".repeat(28)}01`, quantity: "1" }
      ]
    }
  };
  const input = {
    lockedUtxos: [tokenPool] as never,
    selectedRefs,
    transfers: [{ address: "addr_test1recipient", amount: [{ unit: "lovelace", quantity: "3900000" }] }],
    streamingPayments: [],
    txLatestTimeMs: 1
  };
  assert.equal(checkSelectedFundPoolCoverage(input), "covered");
  assert.equal(checkSelectedFundPoolCoverage({
    ...input,
    continuingOutputAddress:
      "addr_test1qz7r704wjqh275anmzsln4ad9e4nwrutnmyvnd32jpzy2kal8d9m8yxj9gwg0ddh4nhj6zqwad8px7u45ljczt4ajfps72xr59"
  }), "insufficient");
});
