import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PROTOCOL_PARAMETERS, type Budget } from "@meshsdk/common";
import {
  resolveScriptHash,
  type Transaction,
  type UTxO
} from "@meshsdk/core";
import { toScriptRef } from "@meshsdk/core-cst";
import {
  createStateForwarding,
  runStateForwarding
} from "@/lib/mesh/transactions/internals/state-forwarding";
import { STT_SPEND_VALIDATOR } from "@/lib/mesh/transactions/internals/constants";
import type { TxFetcher } from "@/lib/mesh/tx-context";

const POLICY_ID = "ab".repeat(28);
const ASSET_NAME = "deadbeef";
const STATE_TX_HASH = "11".repeat(32);
const REFERENCE_TX_HASH = "22".repeat(32);

function makeStateInput(address: string, unit: string): UTxO {
  return {
    input: { txHash: STATE_TX_HASH, outputIndex: 1 },
    output: {
      address,
      amount: [
        { unit: "lovelace", quantity: "5000000" },
        { unit, quantity: "1" }
      ]
    }
  } as UTxO;
}

function makeReferenceInput(
  address: string,
  script: ReturnType<typeof createStateForwarding>["script"]
): UTxO {
  const scriptRef = String(toScriptRef(script).toCbor());

  return {
    input: { txHash: REFERENCE_TX_HASH, outputIndex: 2 },
    output: {
      address,
      amount: [{ unit: "lovelace", quantity: "5000000" }],
      scriptRef,
      scriptHash: resolveScriptHash(script.code, script.version)
    }
  } as UTxO;
}

type LifecycleCall = { name: string; value: unknown };

function createFetcher(
  stateInput: UTxO,
  referenceInput: UTxO,
  lifecycleCalls?: LifecycleCall[]
) {
  const addressCalls: string[] = [];
  const referenceCalls: Array<{ txHash: string; outputIndex?: number }> = [];
  const fetcher = {
    fetchAddressUTxOs: async (address: string) => {
      addressCalls.push(address);
      lifecycleCalls?.push({ name: "fetchStateInput", value: address });
      return [stateInput];
    },
    fetchUTxOs: async (txHash: string, outputIndex?: number) => {
      referenceCalls.push({ txHash, outputIndex });
      lifecycleCalls?.push({
        name: "fetchStateReference",
        value: { txHash, outputIndex }
      });
      return [referenceInput];
    }
  } as unknown as TxFetcher;

  return { fetcher, addressCalls, referenceCalls };
}

function createNoopTransaction(): Transaction {
  const txBuilder = {
    _protocolParams: DEFAULT_PROTOCOL_PARAMETERS,
    txOut() {
      return this;
    },
    txOutInlineDatumValue() {
      return this;
    }
  };
  return {
    txBuilder,
    redeemValue() {
      return this;
    }
  } as unknown as Transaction;
}

test("createStateForwarding resolves the State script definition once", () => {
  const definition = createStateForwarding({
    sttAssetNameHex: "ignored",
    walletPolicyId: ` ${POLICY_ID} `,
    walletAssetNameHex: ` ${ASSET_NAME} `,
    sttSpendReference: `${REFERENCE_TX_HASH}#2`
  });

  assert.deepEqual(definition.params, {
    sttPolicyId: POLICY_ID,
    sttAssetNameHex: ASSET_NAME
  });
  assert.equal(definition.unit, `${POLICY_ID}${ASSET_NAME}`);
  assert.match(definition.address, /^addr_test1w/);
  assert.equal(definition.configuredReference, `${REFERENCE_TX_HASH}#2`);
});

test("runStateForwarding resolves the current State input", async () => {
  const definition = createStateForwarding({
    sttAssetNameHex: ASSET_NAME,
    walletPolicyId: POLICY_ID,
    sttSpendReference: `${REFERENCE_TX_HASH}#2`
  });
  const stateInput = makeStateInput(definition.address, definition.unit);
  const referenceInput = makeReferenceInput(definition.address, definition.script);
  const { fetcher, addressCalls, referenceCalls } = createFetcher(
    stateInput,
    referenceInput
  );

  const forwarding = await runStateForwarding({
    definition,
    fetcher,
    tx: createNoopTransaction(),
    input: {
      txHash: STATE_TX_HASH,
      outputIndex: 1,
      stage: "wallet-vote:fetchSttUtxos",
      details: { action: "wallet-vote" }
    },
    reference: { stage: "wallet-vote:resolveSharedSttReferenceScript" },
    spendValidatorsByRef: new Map(),
    afterInput: ({ input }) => input.input,
    beforeRedeem: () => ({
      assets: stateInput.output.amount,
      datum: { alternative: 0, fields: [] },
      redeemer: { alternative: 1, fields: [] }
    })
  });

  assert.equal(forwarding.input.input, stateInput);
  assert.equal(forwarding.input.inputRef, `${STATE_TX_HASH}#1`);
  assert.deepEqual(addressCalls, [definition.address]);
  assert.deepEqual(referenceCalls, [
    { txHash: REFERENCE_TX_HASH, outputIndex: 2 }
  ]);
});

test("runStateForwarding resolves the shared State reference", async () => {
  const definition = createStateForwarding({
    sttAssetNameHex: ASSET_NAME,
    walletPolicyId: POLICY_ID,
    sttSpendReference: `${REFERENCE_TX_HASH}#2`
  });
  const stateInput = makeStateInput(definition.address, definition.unit);
  const referenceInput = makeReferenceInput(definition.address, definition.script);
  const { fetcher, referenceCalls } = createFetcher(stateInput, referenceInput);
  const forwarding = await runStateForwarding({
    definition,
    fetcher,
    tx: createNoopTransaction(),
    input: {
      txHash: STATE_TX_HASH,
      outputIndex: 1,
      stage: "wallet-vote:fetchSttUtxos"
    },
    reference: { stage: "wallet-vote:resolveSharedSttReferenceScript" },
    spendValidatorsByRef: new Map(),
    afterInput: () => undefined,
    beforeRedeem: () => ({
      assets: stateInput.output.amount,
      datum: { alternative: 0, fields: [] },
      redeemer: { alternative: 1, fields: [] }
    })
  });

  assert.equal(forwarding.resolved.referenceScript.utxo, referenceInput);
  assert.deepEqual(forwarding.resolved.witness, {
    label: "STT",
    script: definition.script,
    reference: forwarding.resolved.referenceScript
  });
  assert.deepEqual(referenceCalls, [
    { txHash: REFERENCE_TX_HASH, outputIndex: 2 }
  ]);
});

test("runStateForwarding excludes the consumed State input from reference use", async () => {
  const definition = createStateForwarding({
    sttAssetNameHex: ASSET_NAME,
    walletPolicyId: POLICY_ID,
    sttSpendReference: `${STATE_TX_HASH}#1`
  });
  const stateInput = makeStateInput(definition.address, definition.unit);
  const referenceInput = makeReferenceInput(definition.address, definition.script);
  const { fetcher } = createFetcher(stateInput, referenceInput);

  await assert.rejects(
    () =>
      runStateForwarding({
        definition,
        fetcher,
        tx: createNoopTransaction(),
        input: {
          txHash: STATE_TX_HASH,
          outputIndex: 1,
          stage: "wallet-vote:fetchSttUtxos"
        },
        reference: { stage: "wallet-vote:resolveSharedSttReferenceScript" },
        spendValidatorsByRef: new Map(),
        afterInput: () => undefined,
        beforeRedeem: () => ({
          assets: stateInput.output.amount,
          datum: { alternative: 0, fields: [] },
          redeemer: { alternative: 1, fields: [] }
        })
      }),
    /also being spent in this transaction/
  );
});

test("State forwarding owns phase order, budgets, outputs, and diagnostics", async () => {
  const definition = createStateForwarding({
    sttAssetNameHex: ASSET_NAME,
    walletPolicyId: POLICY_ID,
    sttSpendReference: `${REFERENCE_TX_HASH}#2`
  });
  const stateInput = makeStateInput(definition.address, definition.unit);
  const referenceInput = makeReferenceInput(definition.address, definition.script);
  const calls: LifecycleCall[] = [];
  const { fetcher } = createFetcher(stateInput, referenceInput, calls);
  const spendValidatorsByRef = new Map<string, string>();
  const txBuilder = {
    _protocolParams: DEFAULT_PROTOCOL_PARAMETERS,
    txOut(address: string, amount: unknown) {
      calls.push({ name: "txOut", value: { address, amount } });
      return this;
    },
    txOutInlineDatumValue(datum: unknown, encoding: string) {
      calls.push({ name: "txOutInlineDatumValue", value: { datum, encoding } });
      return this;
    }
  };
  const tx = {
    txBuilder,
    redeemValue(value: unknown) {
      assert.equal(
        spendValidatorsByRef.get(`${STATE_TX_HASH}#1`),
        STT_SPEND_VALIDATOR
      );
      calls.push({ name: "redeemValue", value });
      return this;
    }
  } as unknown as Transaction;
  const datum = { alternative: 0, fields: [] };
  const assets = stateInput.output.amount;
  const redeemer = { alternative: 1, fields: [] };
  const budget: Budget = { mem: 123, steps: 456 };

  const forwarding = await runStateForwarding({
    definition,
    fetcher,
    tx,
    input: {
      txHash: STATE_TX_HASH,
      outputIndex: 1,
      stage: "wallet-vote:fetchSttUtxos"
    },
    reference: { stage: "wallet-vote:resolveSharedSttReferenceScript" },
    spendValidatorsByRef,
    afterInput: ({ input }) => {
      calls.push({ name: "afterInput", value: input.inputRef });
      return "prepared";
    },
    beforeRedeem: ({ resolved, value }) => {
      calls.push({ name: "beforeRedeem", value });
      assert.equal(resolved.referenceScript.utxo, referenceInput);
      return {
        redeemer,
        budget,
        additionalWitnesses: [
          { label: "Wallet spend", script: definition.script, reference: null }
        ],
        afterRedeem: () => {
          calls.push({ name: "afterRedeem", value: null });
        },
        createOutput: () => {
          calls.push({ name: "createOutput", value: null });
          return { assets, datum };
        },
        afterOutput: () => {
          calls.push({ name: "afterOutput", value: null });
        }
      };
    }
  });

  assert.equal(
    spendValidatorsByRef.get(`${STATE_TX_HASH}#1`),
    STT_SPEND_VALIDATOR
  );
  assert.deepEqual(calls.map((call) => call.name), [
    "fetchStateInput",
    "afterInput",
    "fetchStateReference",
    "beforeRedeem",
    "redeemValue",
    "afterRedeem",
    "createOutput",
    "txOut",
    "txOutInlineDatumValue",
    "afterOutput"
  ]);
  assert.deepEqual(calls[4]!.value, {
    value: stateInput,
    script: referenceInput,
    redeemer: { data: redeemer, budget }
  });
  assert.deepEqual(calls[7]!.value, {
    address: definition.address,
    amount: assets
  });
  assert.deepEqual(calls[8]!.value, { datum, encoding: "Mesh" });
  assert.equal(forwarding.diagnostics.sttAddress, definition.address);
  assert.equal(
    forwarding.diagnostics.scriptWitnessDiagnostics.referenceScriptCount,
    1
  );
  assert.deepEqual(
    forwarding.diagnostics.scriptWitnessDiagnostics.inlineScripts.map(
      (entry) => entry.label
    ),
    ["Wallet spend"]
  );
  assert.match(forwarding.referenceScriptUsage, /reference script/i);
});
