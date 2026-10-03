import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PROTOCOL_PARAMETERS, DEFAULT_V1_COST_MODEL_LIST, DEFAULT_V2_COST_MODEL_LIST, DEFAULT_V3_COST_MODEL_LIST } from "@meshsdk/common";
import { Transaction, resolveScriptHash, type UTxO } from "@meshsdk/core";
import { toScriptRef } from "@meshsdk/core-cst";
import type { WalletSource, TxFetcher } from "@/lib/mesh/tx-context";
import { MAX_EVALUATION_INPUTS } from "./constants";
import { executeMeshMethod } from "@/lib/mesh/blockfrost-server";
import type { RuntimeTxBuilder } from "./budget-runtime-builder";
import { addWalletInput } from "./utxo";
import type { BlockfrostProvider } from "@meshsdk/core";
import { setupTransaction } from "./core";
import { redeemValueWithInlineScript, redeemValueWithRequiredReferenceScript } from "./value";
import type { ReferenceScriptResolution } from "./reference-scripts";
import { deserializeTx, type CstCollection, type CstTransactionInput } from "@/lib/mesh/cst";

const ADDRESS = "addr_test1vqg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygxrcya6";
const SCRIPT = { code: "46010000200101", version: "V3" as const };
const REDEEMER = { data: { alternative: 0, fields: [] } };
const output = (hash: string): UTxO => ({ input: { txHash: hash.repeat(64), outputIndex: 0 },
  output: { address: ADDRESS, amount: [{ unit: "lovelace", quantity: "5000000" }], plutusData: "d87980" } });
const wallet = (utxos: UTxO[]): WalletSource => ({ getUtxos: async () => utxos,
  getChangeAddress: async () => ADDRESS, getUsedAddresses: async () => [ADDRESS], getUnusedAddresses: async () => [] });

test("setup supplies funding and collateral candidates without spending reference outputs", async () => {
  const funding = output("1");
  const collateral = output("2");
  const reference = output("3");
  reference.output.scriptRef = String(toScriptRef(SCRIPT).toCbor());
  const fetcher = { fetchProtocolParameters: async () => DEFAULT_PROTOCOL_PARAMETERS } as TxFetcher;
  const { tx } = await setupTransaction(wallet([funding, collateral, reference]), undefined, fetcher);
  assert.deepEqual(Object.values(tx.txBuilder.meshTxBuilderBody.inputsForEvaluation), [funding, collateral]);
});

test("redemption supplies consumed outputs and the exact reference script to Mesh evaluation", () => {
  const state = output("1");
  const locked = output("2");
  const reference = output("3");
  reference.output.scriptRef = String(toScriptRef(SCRIPT).toCbor());
  reference.output.scriptHash = resolveScriptHash(SCRIPT.code, SCRIPT.version);
  const resolution: ReferenceScriptResolution = { utxo: reference, reference: `${reference.input.txHash}#0`,
    source: "configured", scriptHash: reference.output.scriptHash, scriptSize: "7", validation: "hash-verified" };
  const tx = new Transaction({ initiator: { ...wallet([]), getCollateral: async () => [] } });
  redeemValueWithRequiredReferenceScript(tx, state, resolution, REDEEMER);
  redeemValueWithInlineScript(tx, locked, SCRIPT, REDEEMER);
  assert.deepEqual(Object.values(tx.txBuilder.meshTxBuilderBody.inputsForEvaluation), [state, reference, locked]);
});

test("a real build sends only serialized input outputs to evaluation for a large wallet", async () => {
  const funds = Array.from({ length: 150 }, (_, index) => ({ ...output("1"),
    input: { txHash: (index + 1).toString(16).padStart(64, "0"), outputIndex: 0 } }));
  funds[0]!.output.amount[0]!.quantity = "100000000";
  let evaluations = 0;
  const fetcher = {
    fetchProtocolParameters: async () => DEFAULT_PROTOCOL_PARAMETERS,
    fetchCostModels: async () => [DEFAULT_V1_COST_MODEL_LIST, DEFAULT_V2_COST_MODEL_LIST, DEFAULT_V3_COST_MODEL_LIST],
    evaluateTx: async (hex: string, supplied: UTxO[] = []) => {
      evaluations++;
      const transaction = deserializeTx(hex);
      const body = transaction.body();
      const inputs = body.inputs() as CstCollection<CstTransactionInput>;
      const required = new Set([...inputs.values(), ...(body.collateral()?.values() ?? []), ...(body.referenceInputs()?.values() ?? [])]
        .map(ref => `${ref.transactionId().toString()}#${ref.index()}`));
      assert.ok(supplied.length < funds.length);
      assert.deepEqual(new Set(supplied.map(utxo => `${utxo.input.txHash}#${utxo.input.outputIndex}`)), required);
      return [{ tag: "MINT" as const, index: 0, budget: { mem: 700_000, steps: 300_000_000 } }];
    }
  } as TxFetcher;
  const { tx } = await setupTransaction(wallet(funds), undefined, fetcher);
  tx.mintAsset(SCRIPT, { assetName: "token", assetQuantity: "1" }, REDEEMER);
  await tx.build();
  assert.ok(evaluations > 0);
});


test("a fragmented-wallet build reaches RPC evaluation with more than 64 required outputs", async () => {
  const funds = Array.from({ length: 65 }, (_, index): UTxO => ({
    input: { txHash: (index + 1).toString(16).padStart(64, "0"), outputIndex: 0 },
    output: { address: ADDRESS, amount: [{ unit: "lovelace", quantity: "4000000" }] }
  }));
  const collateral = output("f");
  const actions = [{ tag: "MINT" as const, index: 0, budget: { mem: 700_000, steps: 300_000_000 } }];
  let evaluations = 0;
  const provider = { evaluateTx: async (_hex: string, supplied: UTxO[]) => {
    evaluations++;
    assert.equal(supplied.length, 66);
    return actions;
  } } as unknown as BlockfrostProvider;
  const fetcher = {
    fetchProtocolParameters: async () => DEFAULT_PROTOCOL_PARAMETERS,
    fetchCostModels: async () => [DEFAULT_V1_COST_MODEL_LIST, DEFAULT_V2_COST_MODEL_LIST, DEFAULT_V3_COST_MODEL_LIST],
    evaluateTx: (hex: string, supplied?: UTxO[], chained?: string[]) =>
      executeMeshMethod(provider, "evaluateTx", [hex, supplied, chained])
  } as TxFetcher;
  const { tx } = await setupTransaction(wallet([...funds, collateral]), undefined, fetcher);
  for (const fund of funds) addWalletInput(tx.txBuilder as RuntimeTxBuilder, fund);
  tx.mintAsset(SCRIPT, { assetName: "token", assetQuantity: "1" }, REDEEMER);
  const hex = await tx.build();
  assert.ok(hex.length / 2 < DEFAULT_PROTOCOL_PARAMETERS.maxTxSize);
  assert.ok(evaluations > 0);
});


test("RPC evaluation retains a bounded additional input set", async () => {
  let calls = 0;
  const provider = { evaluateTx: async () => { calls++; return []; } } as unknown as BlockfrostProvider;
  await executeMeshMethod(provider, "evaluateTx", ["00", Array.from({ length: MAX_EVALUATION_INPUTS }, () => output("1"))]);
  assert.equal(calls, 1);
  await assert.rejects(executeMeshMethod(provider, "evaluateTx", ["00", Array.from({ length: MAX_EVALUATION_INPUTS + 1 }, () => output("1"))]), /at most 512 entries/);
  assert.equal(calls, 1);
});
