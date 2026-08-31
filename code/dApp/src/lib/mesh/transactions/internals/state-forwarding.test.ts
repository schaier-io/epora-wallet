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
  redeemStateForwardingInput,
  resolveStateForwardingInput,
  resolveStateForwardingReference,
  sendStateForwardingOutput
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

function createFetcher(stateInput: UTxO, referenceInput: UTxO) {
  const addressCalls: string[] = [];
  const referenceCalls: Array<{ txHash: string; outputIndex?: number }> = [];
  const fetcher = {
    fetchAddressUTxOs: async (address: string) => {
      addressCalls.push(address);
      return [stateInput];
    },
    fetchUTxOs: async (txHash: string, outputIndex?: number) => {
      referenceCalls.push({ txHash, outputIndex });
      return [referenceInput];
    }
  } as unknown as TxFetcher;

  return { fetcher, addressCalls, referenceCalls };
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

test("resolveStateForwardingInput resolves the current State input", async () => {
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

  const resolved = await resolveStateForwardingInput(definition, fetcher, {
    txHash: STATE_TX_HASH,
    outputIndex: 1,
    stage: "wallet-vote:fetchSttUtxos",
    details: { action: "wallet-vote" }
  });

  assert.equal(resolved.input, stateInput);
  assert.equal(resolved.inputRef, `${STATE_TX_HASH}#1`);
  assert.deepEqual(addressCalls, [definition.address]);
  assert.deepEqual(referenceCalls, []);
});

test("resolveStateForwardingReference resolves the shared State reference", async () => {
  const definition = createStateForwarding({
    sttAssetNameHex: ASSET_NAME,
    walletPolicyId: POLICY_ID,
    sttSpendReference: `${REFERENCE_TX_HASH}#2`
  });
  const stateInput = makeStateInput(definition.address, definition.unit);
  const referenceInput = makeReferenceInput(definition.address, definition.script);
  const { fetcher, referenceCalls } = createFetcher(stateInput, referenceInput);
  const resolvedInput = await resolveStateForwardingInput(definition, fetcher, {
    txHash: STATE_TX_HASH,
    outputIndex: 1,
    stage: "wallet-vote:fetchSttUtxos"
  });

  const resolved = await resolveStateForwardingReference(resolvedInput, fetcher, {
    stage: "wallet-vote:resolveSharedSttReferenceScript"
  });

  assert.equal(resolved.referenceScript.utxo, referenceInput);
  assert.deepEqual(resolved.witness, {
    label: "STT",
    script: definition.script,
    reference: resolved.referenceScript
  });
  assert.deepEqual(referenceCalls, [
    { txHash: REFERENCE_TX_HASH, outputIndex: 2 }
  ]);
});

test("resolveStateForwardingInput excludes the consumed State input from reference use", async () => {
  const definition = createStateForwarding({
    sttAssetNameHex: ASSET_NAME,
    walletPolicyId: POLICY_ID,
    sttSpendReference: `${STATE_TX_HASH}#1`
  });
  const stateInput = makeStateInput(definition.address, definition.unit);
  const referenceInput = makeReferenceInput(definition.address, definition.script);
  const { fetcher } = createFetcher(stateInput, referenceInput);

  const resolvedInput = await resolveStateForwardingInput(definition, fetcher, {
    txHash: STATE_TX_HASH,
    outputIndex: 1,
    stage: "wallet-vote:fetchSttUtxos"
  });

  await assert.rejects(
    () => resolveStateForwardingReference(resolvedInput, fetcher, {
      stage: "wallet-vote:resolveSharedSttReferenceScript"
    }),
    /also being spent in this transaction/
  );
});

test("State forwarding permits caller work between redeem and continuing output", async () => {
  const definition = createStateForwarding({
    sttAssetNameHex: ASSET_NAME,
    walletPolicyId: POLICY_ID,
    sttSpendReference: `${REFERENCE_TX_HASH}#2`
  });
  const stateInput = makeStateInput(definition.address, definition.unit);
  const referenceInput = makeReferenceInput(definition.address, definition.script);
  const { fetcher } = createFetcher(stateInput, referenceInput);
  const resolvedInput = await resolveStateForwardingInput(definition, fetcher, {
    txHash: STATE_TX_HASH,
    outputIndex: 1,
    stage: "wallet-vote:fetchSttUtxos"
  });
  const resolved = await resolveStateForwardingReference(resolvedInput, fetcher, {
    stage: "wallet-vote:resolveSharedSttReferenceScript"
  });
  const spendValidatorsByRef = new Map<string, string>();
  const calls: Array<{ name: string; value: unknown }> = [];
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
        spendValidatorsByRef.get(resolved.inputRef),
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

  redeemStateForwardingInput({
    tx,
    resolved,
    redeemer,
    budget,
    spendValidatorsByRef
  });
  calls.push({ name: "callerWork", value: null });
  sendStateForwardingOutput({ tx, resolved, assets, datum });

  assert.equal(
    spendValidatorsByRef.get(`${STATE_TX_HASH}#1`),
    STT_SPEND_VALIDATOR
  );
  assert.deepEqual(calls.map((call) => call.name), [
    "redeemValue",
    "callerWork",
    "txOut",
    "txOutInlineDatumValue"
  ]);
  assert.deepEqual(calls[0]!.value, {
    value: stateInput,
    script: referenceInput,
    redeemer: { data: redeemer, budget }
  });
  assert.deepEqual(calls[2]!.value, {
    address: definition.address,
    amount: assets
  });
  assert.deepEqual(calls[3]!.value, { datum, encoding: "Mesh" });
});
