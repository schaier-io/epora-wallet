import assert from "node:assert/strict";
import { test } from "node:test";

import { createNoChangeAdaSelector } from "@/lib/mesh/transactions/internals/no-change-ada-selector";
import {
  LargestFirstInputSelector,
  type MeshTxBuilderOptions,
  type UTxO
} from "@meshsdk/core";

type InputSelector = NonNullable<MeshTxBuilderOptions["selector"]>;
type SelectArguments = Parameters<InputSelector["select"]>;
type Selection = Awaited<ReturnType<InputSelector["select"]>>;

const ADDRESS = "addr_test1qpayout";

function utxo(
  txHash: string,
  quantity: string,
  extraAsset?: { unit: string; quantity: string }
): UTxO {
  return {
    input: { txHash, outputIndex: 0 },
    output: {
      address: ADDRESS,
      amount: [
        { unit: "lovelace", quantity },
        ...(extraAsset ? [extraAsset] : [])
      ]
    }
  };
}

test("ADA payout selection absorbs every fee-pass change into the tagged sink", async () => {
  const pure = utxo("a".repeat(64), "4000000");
  const collateral = utxo("b".repeat(64), "5000000");
  const tokenBearing = utxo("c".repeat(64), "6000000", {
    unit: "d".repeat(56) + "01",
    quantity: "1"
  });
  const outputs = [{ address: ADDRESS, amount: [{ unit: "lovelace", quantity: "1500000" }] }];
  const proposedChange = [{ address: ADDRESS, amount: [{ unit: "lovelace", quantity: "2000000" }] }];

  const delegate: InputSelector = {
    async select(...args: SelectArguments): Promise<Selection> {
      const candidates = args[3];
      const constraints = args[5];

      assert.deepEqual(candidates, [pure]);
      await constraints.computeMinimumCost({
        newInputs: new Set([pure]),
        newOutputs: new Set(),
        change: proposedChange,
        fee: 200000n
      });
      await constraints.maxSizeExceed({
        newInputs: new Set([pure]),
        newOutputs: new Set(),
        change: proposedChange,
        fee: 200000n
      });

      return {
        newInputs: new Set([pure]),
        newOutputs: new Set(),
        change: proposedChange,
        fee: 200000n
      };
    }
  };
  const selector = createNoChangeAdaSelector({
    delegate,
    resolveSinkOutputIndex: () => 0,
    excludedInputRefs: () => new Set([`${collateral.input.txHash}#0`])
  });
  const observedSinkQuantities: string[] = [];
  const observedChangeCounts: number[] = [];
  const constraints: SelectArguments[5] = {
    computeMinimumCost: async (selection) => {
      observedSinkQuantities.push(outputs[0]!.amount[0]!.quantity);
      observedChangeCounts.push(selection.change.length);
      return { fee: 200000n };
    },
    maxSizeExceed: async (selection) => {
      observedSinkQuantities.push(outputs[0]!.amount[0]!.quantity);
      observedChangeCounts.push(selection.change.length);
      return false;
    },
    computeMinimumCoinQuantity: () => 1_000_000n,
    tokenBundleSizeExceedsLimit: () => false
  };

  const selection = await selector.select(
    [],
    outputs,
    { withdrawals: 0n, deposit: 0n, reclaimDeposit: 0n, mint: [] },
    [pure, collateral, tokenBearing],
    ADDRESS,
    constraints
  );

  assert.deepEqual(observedSinkQuantities, ["3500000", "3500000"]);
  assert.deepEqual(observedChangeCounts, [0, 0]);
  assert.equal(outputs[0]!.amount[0]!.quantity, "3500000");
  assert.deepEqual(selection.change, []);
});

test("ADA payout selection restores the tagged sink when fee evaluation fails", async () => {
  const pure = utxo("a".repeat(64), "4000000");
  const outputs = [{ address: ADDRESS, amount: [{ unit: "lovelace", quantity: "1500000" }] }];
  const delegate: InputSelector = {
    async select(...args: SelectArguments): Promise<Selection> {
      await args[5].computeMinimumCost({
        newInputs: new Set([pure]),
        newOutputs: new Set(),
        change: [{ address: ADDRESS, amount: [{ unit: "lovelace", quantity: "2000000" }] }],
        fee: 200000n
      });
      throw new Error("unreachable");
    }
  };
  const selector = createNoChangeAdaSelector({
    delegate,
    resolveSinkOutputIndex: () => 0
  });

  await assert.rejects(
    selector.select(
      [],
      outputs,
      { withdrawals: 0n, deposit: 0n, reclaimDeposit: 0n, mint: [] },
      [pure],
      ADDRESS,
      {
        computeMinimumCost: async () => {
          throw new Error("evaluation failed");
        },
        maxSizeExceed: async () => false,
        computeMinimumCoinQuantity: () => 1_000_000n,
        tokenBundleSizeExceedsLimit: () => false
      }
    ),
    /evaluation failed/
  );
  assert.equal(outputs[0]!.amount[0]!.quantity, "1500000");
});

test("ADA payout selection uses the smallest sufficient funding UTxO", async () => {
  const fiveAda = utxo("a".repeat(64), "5000000");
  const thousandAda = utxo("b".repeat(64), "1000000000");
  const outputs = [{
    address: ADDRESS,
    amount: [{ unit: "lovelace", quantity: "300000" }]
  }];
  const selector = createNoChangeAdaSelector({
    resolveSinkOutputIndex: () => 0
  });

  const selection = await selector.select(
    [],
    outputs,
    { withdrawals: 0n, deposit: 0n, reclaimDeposit: 0n, mint: [] },
    [thousandAda, fiveAda],
    ADDRESS,
    {
      computeMinimumCost: async () => ({ fee: 200000n }),
      maxSizeExceed: async () => false,
      computeMinimumCoinQuantity: () => 1000000n,
      tokenBundleSizeExceedsLimit: () => false
    }
  );

  assert.deepEqual([...selection.newInputs], [fiveAda]);
  assert.deepEqual(selection.change, []);
  assert.equal(outputs[0]!.amount[0]!.quantity, "4800000");
});

test("ADA payout selection uses a small pair before a large singleton", async () => {
  const fiveAda = utxo("a".repeat(64), "5000000");
  const sevenAda = utxo("b".repeat(64), "7000000");
  const thousandAda = utxo("c".repeat(64), "1000000000");
  const outputs = [{
    address: ADDRESS,
    amount: [{ unit: "lovelace", quantity: "10000000" }]
  }];
  const selector = createNoChangeAdaSelector({
    resolveSinkOutputIndex: () => 0
  });

  const selection = await selector.select(
    [],
    outputs,
    { withdrawals: 0n, deposit: 0n, reclaimDeposit: 0n, mint: [] },
    [thousandAda, sevenAda, fiveAda],
    ADDRESS,
    {
      computeMinimumCost: async () => ({ fee: 200000n }),
      maxSizeExceed: async () => false,
      computeMinimumCoinQuantity: () => 1000000n,
      tokenBundleSizeExceedsLimit: () => false
    }
  );

  assert.deepEqual([...selection.newInputs], [sevenAda, fiveAda]);
  assert.deepEqual(selection.change, []);
  assert.equal(outputs[0]!.amount[0]!.quantity, "11800000");
});

test("ADA payout selection prefers an exact later singleton over an early prefix", async () => {
  const first499Ada = utxo("a".repeat(64), "499000000");
  const second499Ada = utxo("b".repeat(64), "499000000");
  const exact500Ada = utxo("c".repeat(64), "500000000");
  const outputs = [{
    address: ADDRESS,
    amount: [{ unit: "lovelace", quantity: "499800000" }]
  }];
  const selector = createNoChangeAdaSelector({
    resolveSinkOutputIndex: () => 0
  });

  const selection = await selector.select(
    [],
    outputs,
    { withdrawals: 0n, deposit: 0n, reclaimDeposit: 0n, mint: [] },
    [first499Ada, second499Ada, exact500Ada],
    ADDRESS,
    {
      computeMinimumCost: async () => ({ fee: 200000n }),
      maxSizeExceed: async () => false,
      computeMinimumCoinQuantity: () => 1000000n,
      tokenBundleSizeExceedsLimit: () => false
    }
  );

  assert.deepEqual([...selection.newInputs], [exact500Ada]);
  assert.deepEqual(selection.change, []);
  assert.equal(outputs[0]!.amount[0]!.quantity, "499800000");
});

test("ADA payout selection evaluates a non-contiguous pair with its own fee", async () => {
  const oneAda = utxo("a".repeat(64), "1000000");
  const eightAda = utxo("b".repeat(64), "8000000");
  const nineteenAda = utxo("c".repeat(64), "19000000");
  const outputs = [{
    address: ADDRESS,
    amount: [{ unit: "lovelace", quantity: "19800000" }]
  }];
  const selector = createNoChangeAdaSelector({
    resolveSinkOutputIndex: () => 0
  });

  const selection = await selector.select(
    [],
    outputs,
    { withdrawals: 0n, deposit: 0n, reclaimDeposit: 0n, mint: [] },
    [oneAda, eightAda, nineteenAda],
    ADDRESS,
    {
      computeMinimumCost: async (selection) => ({
        fee: selection.newInputs.has(eightAda) ? 300000n : 200000n
      }),
      maxSizeExceed: async () => false,
      computeMinimumCoinQuantity: () => 1000000n,
      tokenBundleSizeExceedsLimit: () => false
    }
  );

  assert.deepEqual([...selection.newInputs], [nineteenAda, oneAda]);
  assert.deepEqual(selection.change, []);
  assert.equal(outputs[0]!.amount[0]!.quantity, "19800000");
});

test("ADA payout selection derives the pair bound from a three-input prefix", async () => {
  const sixAda = utxo("a".repeat(64), "6000000");
  const sixAdaAndOneLovelace = utxo("b".repeat(64), "6000001");
  const fourteenPointTwoAda = utxo("c".repeat(64), "14200000");
  const outputs = [{
    address: ADDRESS,
    amount: [{ unit: "lovelace", quantity: "20000000" }]
  }];
  const selector = createNoChangeAdaSelector({
    resolveSinkOutputIndex: () => 0
  });

  const selection = await selector.select(
    [],
    outputs,
    { withdrawals: 0n, deposit: 0n, reclaimDeposit: 0n, mint: [] },
    [sixAda, sixAdaAndOneLovelace, fourteenPointTwoAda],
    ADDRESS,
    {
      computeMinimumCost: async (selection) => {
        if (selection.newInputs.size === 3) return { fee: 200003n };
        return {
          fee: selection.newInputs.has(sixAdaAndOneLovelace)
            ? 200002n
            : 200000n
        };
      },
      maxSizeExceed: async () => false,
      computeMinimumCoinQuantity: () => 1000000n,
      tokenBundleSizeExceedsLimit: () => false
    }
  );

  assert.deepEqual([...selection.newInputs], [fourteenPointTwoAda, sixAda]);
  assert.deepEqual(selection.change, []);
  assert.equal(outputs[0]!.amount[0]!.quantity, "20000000");
});

test("ADA payout selection keeps looking after a valid pair to reduce its surplus", async () => {
  const sixAda = utxo("a".repeat(64), "6000000");
  const firstLargeUtxo = utxo("b".repeat(64), "19200001");
  const laterLargeUtxo = utxo("c".repeat(64), "19200002");
  const outputs = [{
    address: ADDRESS,
    amount: [{ unit: "lovelace", quantity: "20000000" }]
  }];
  const selector = createNoChangeAdaSelector({
    resolveSinkOutputIndex: () => 0
  });

  const selection = await selector.select(
    [],
    outputs,
    { withdrawals: 0n, deposit: 0n, reclaimDeposit: 0n, mint: [] },
    [sixAda, firstLargeUtxo, laterLargeUtxo],
    ADDRESS,
    {
      computeMinimumCost: async (selection) => ({
        fee: selection.newInputs.has(laterLargeUtxo) ? 200002n : 200000n
      }),
      maxSizeExceed: async () => false,
      computeMinimumCoinQuantity: () => 1000000n,
      tokenBundleSizeExceedsLimit: () => false
    }
  );

  assert.deepEqual([...selection.newInputs], [laterLargeUtxo, sixAda]);
  assert.deepEqual(selection.change, []);
  assert.equal(outputs[0]!.amount[0]!.quantity, "25000000");
});

test("ADA payout selection permits a seven ADA surplus from 19 plus 8 ADA", async () => {
  const eightAda = utxo("a".repeat(64), "8000000");
  const nineteenAda = utxo("b".repeat(64), "19000000");
  const outputs = [{
    address: ADDRESS,
    amount: [{ unit: "lovelace", quantity: "19800000" }]
  }];
  const selector = createNoChangeAdaSelector({
    resolveSinkOutputIndex: () => 0
  });

  const selection = await selector.select(
    [],
    outputs,
    { withdrawals: 0n, deposit: 0n, reclaimDeposit: 0n, mint: [] },
    [eightAda, nineteenAda],
    ADDRESS,
    {
      computeMinimumCost: async () => ({ fee: 200000n }),
      maxSizeExceed: async () => false,
      computeMinimumCoinQuantity: () => 1000000n,
      tokenBundleSizeExceedsLimit: () => false
    }
  );

  assert.deepEqual([...selection.newInputs], [nineteenAda, eightAda]);
  assert.deepEqual(selection.change, []);
  assert.equal(outputs[0]!.amount[0]!.quantity, "26800000");
});

test("ADA payout selection keeps a valid singleton when pair improvement exceeds the size limit", async () => {
  const fiveAda = utxo("a".repeat(64), "5000000");
  const sevenAda = utxo("b".repeat(64), "7000000");
  const thousandAda = utxo("c".repeat(64), "1000000000");
  const outputs = [{
    address: ADDRESS,
    amount: [{ unit: "lovelace", quantity: "10000000" }]
  }];
  let sawOversizedPair = false;
  const selector = createNoChangeAdaSelector({
    resolveSinkOutputIndex: () => 0
  });

  const selection = await selector.select(
    [],
    outputs,
    { withdrawals: 0n, deposit: 0n, reclaimDeposit: 0n, mint: [] },
    [thousandAda, sevenAda, fiveAda],
    ADDRESS,
    {
      computeMinimumCost: async () => ({ fee: 200000n }),
      maxSizeExceed: async (candidate) => {
        sawOversizedPair ||= candidate.newInputs.size > 1;
        return candidate.newInputs.size > 1;
      },
      computeMinimumCoinQuantity: () => 1000000n,
      tokenBundleSizeExceedsLimit: () => false
    }
  );

  assert.equal(sawOversizedPair, true);
  assert.deepEqual([...selection.newInputs], [thousandAda]);
  assert.deepEqual(selection.change, []);
  assert.equal(outputs[0]!.amount[0]!.quantity, "999800000");
});

test("ADA payout pair improvement keeps delegate work linear for a fragmented wallet", async () => {
  const candidates = Array.from({ length: 100 }, (_, index) =>
    utxo(
      index.toString(16).padStart(64, "0"),
      ((index + 50) * 1_000_000).toString()
    )
  );
  const outputs = [{
    address: ADDRESS,
    amount: [{ unit: "lovelace", quantity: "99900000" }]
  }];
  const largestFirst = new LargestFirstInputSelector();
  let delegateCalls = 0;
  const selector = createNoChangeAdaSelector({
    delegate: {
      select: async (...args) => {
        delegateCalls += 1;
        return largestFirst.select(...args);
      }
    },
    resolveSinkOutputIndex: () => 0
  });

  const selection = await selector.select(
    [],
    outputs,
    { withdrawals: 0n, deposit: 0n, reclaimDeposit: 0n, mint: [] },
    candidates,
    ADDRESS,
    {
      computeMinimumCost: async () => ({ fee: 200000n }),
      maxSizeExceed: async () => false,
      computeMinimumCoinQuantity: () => 1000000n,
      tokenBundleSizeExceedsLimit: () => false
    }
  );

  assert.ok(selection.newInputs.size > 0);
  assert.deepEqual(selection.change, []);
  assert.ok(
    delegateCalls <= 110,
    `expected at most 110 delegate calls, received ${delegateCalls}`
  );
});
