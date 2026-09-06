import assert from "node:assert/strict";
import test from "node:test";
import { pubKeyAddress, serializeAddressObj, serializeData, resolveScriptHash, type UTxO } from "@meshsdk/core";
import { toScriptRef } from "@meshsdk/core-cst";
import { deserializeTx, type CstTransactionOutput } from "@/lib/mesh/cst";
import { getSttMintPolicyId, getSttSpendScript, getWalletSpendScript, resolveScriptAddress } from "@/lib/contracts/blueprint";
import { createDefaultStateForm, stateFormToDatum } from "@/lib/contracts/state-form";
import { buildBeneficiaryPreparationTx } from "./beneficiary-preparation";
import { createFixtureFetcher, createFixtureWallet } from "../../../../scripts/entrypoint-budget-fixture-support";
import type { BeneficiaryPreparationFormInput } from "@/lib/types/contracts";
import { ConsolidateTxRequestSchema } from "@/lib/api/tx-requests";
const KEY = "11".repeat(28);
const ADDRESS = serializeAddressObj(pubKeyAddress(KEY), 0);
const UNIT = "cc".repeat(28) + "01";
const amount = (ada: string, native = "5") => [{ unit: "lovelace", quantity: ada }, { unit: UNIT, quantity: native }];
function fixture() {
  const script = getSttSpendScript(), policy = getSttMintPolicyId(), name = "deadbeef";
  const walletScript = getWalletSpendScript({ sttPolicyId: policy, sttAssetNameHex: name });
  const walletAddress = resolveScriptAddress(walletScript);
  const form = createDefaultStateForm();
  form.proofOfLifeUnlockTimeMode = "some"; form.proofOfLifeUnlockTime = "1";
  form.proofOfLifeIncrementMode = "some"; form.proofOfLifeIncrement = "60";
  form.beneficiaries = [1, 3].map((weight, index) => ({ id: String(index), wallets: [index ? "22".repeat(28) : KEY], weight: String(weight), unlockAfterMode: "none", unlockAfter: "", payoutAddress: ADDRESS }));
  const datum = stateFormToDatum(form);
  const state: UTxO = { input: { txHash: "44".repeat(32), outputIndex: 0 }, output: { address: resolveScriptAddress(script), amount: [{ unit: "lovelace", quantity: "30000000" }, { unit: policy + name, quantity: "1" }], plutusData: serializeData(datum, "Mesh") } };
  const selected: UTxO = { input: { txHash: "55".repeat(32), outputIndex: 0 }, output: { address: walletAddress, amount: amount("10000000") } };
  const funding: UTxO = { input: { txHash: "aa".repeat(32), outputIndex: 0 }, output: { address: ADDRESS, amount: [{ unit: "lovelace", quantity: "2000000000" }] } };
  const collateral: UTxO = { input: { txHash: "bb".repeat(32), outputIndex: 0 }, output: { address: ADDRESS, amount: [{ unit: "lovelace", quantity: "20000000" }] } };
  const refs = [script, walletScript].map((referenceScript, index): UTxO => ({ input: { txHash: (index ? "66" : "77").repeat(32), outputIndex: 0 }, output: { address: ADDRESS, amount: [{ unit: "lovelace", quantity: "100000000" }], scriptRef: String(toScriptRef(referenceScript).toCbor()), scriptHash: resolveScriptHash(referenceScript.code, referenceScript.version) } }));
  const fetcher = createFixtureFetcher([state, selected, funding, collateral, ...refs]);
  fetcher.evaluateTx = async txHex => (deserializeTx(txHex).witnessSet().redeemers()?.values() ?? []).map(redeemer => ({ index: Number(redeemer.index()), tag: "SPEND", budget: { mem: 1000000, steps: 500000000 } }));
  const config = { walletPolicyId: policy, walletAssetNameHex: name, sttAssetNameHex: name, sttSpendReference: "77".repeat(32) + "#0", walletSpendReference: "66".repeat(32) + "#0" };
  const input: BeneficiaryPreparationFormInput = { sttInputTxHash: state.input.txHash, sttInputOutputIndex: 0, walletInputs: [selected.input], beneficiarySignerKeyHash: KEY, poolAssets: amount("8000000", "4"), expectedStateDatum: datum };
  return { selected, state, form, datum, config, input, fetcher, walletAddress, wallet: createFixtureWallet(funding, collateral) };
}
test("preparation builds exact pool and remainder from fresh inputs with existing Consolidate and external fees", async () => {
  const f = fixture();
  const result = await buildBeneficiaryPreparationTx(f.wallet, f.config, f.input, f.fetcher);
  const tx = deserializeTx(result.txHex);
  const outputs = tx.body().outputs() as CstTransactionOutput[];
  assert.deepEqual(outputs.filter(output => output.address().toBech32().toString() === f.walletAddress).map(output => output.amount().coin().toString()), ["8000000", "2000000"]);
  const stateOutput = outputs.find(output => output.address().toBech32().toString() === f.state.output.address)!;
  assert.equal((stateOutput.datum()?.asInlineData?.() as { toCbor(): string }).toCbor(), serializeData(f.datum, "Mesh"));
  assert.ok(tx.witnessSet().redeemers()?.values().some(redeemer => redeemer.data().toCbor() === serializeData({ alternative: 5, fields: [{ alternative: 2, fields: [] }] }, "Mesh")));
  assert.deepEqual(result.warnings, ["The connected wallet funds the transaction fee externally."]);
});
test("preparation merger forwards selected value without requiring exact divisibility", async () => {
  const f = fixture(); f.input.poolAssets = [];
  const result = await buildBeneficiaryPreparationTx(f.wallet, f.config, f.input, f.fetcher);
  const outputs = (deserializeTx(result.txHex).body().outputs() as CstTransactionOutput[]).filter(output => output.address().toBech32().toString() === f.walletAddress);
  assert.equal(outputs.length, 1);
  assert.equal(outputs[0]!.amount().coin().toString(), "10000000");
});
test("preparation rejects stale State, wrong or locked signer, foreign input, overdraw, and externally funded minimum-ADA shortfall", async () => {
  for (const reason of ["stale", "signer", "locked", "foreign", "overdraw", "deposit", "layout", "duplicate", "unknown-status"] as const) {
    const f = fixture();
    if (reason === "stale") f.form.walletName = "changed";
    if (reason === "locked") f.form.proofOfLifeUnlockTime = "18446744073709551615";
    if (reason === "signer") f.input.beneficiarySignerKeyHash = "22".repeat(28);
    if (reason === "foreign") f.selected.output.address = ADDRESS;
    if (reason === "overdraw") f.input.poolAssets = amount("12000000", "4");
    if (reason === "deposit") { f.selected.output.amount = amount("1500000"); f.input.poolAssets = amount("1000000", "4"); }
    if (reason === "layout") Object.assign(f.input, { walletOutputs: [] });
    if (reason === "duplicate") f.input.walletInputs.push(f.selected.input);
    if (reason === "unknown-status") {
      const get = f.fetcher.get;
      f.fetcher.get = async path => path === `txs/${f.selected.input.txHash}/utxos` ? { outputs: [{ output_index: 0 }] } : get(path);
    }
    f.state.output.plutusData = serializeData(stateFormToDatum(f.form), "Mesh");
    if (reason === "locked") f.input.expectedStateDatum = stateFormToDatum(f.form);
    const expected = reason === "stale" ? /State changed/ : reason === "signer" ? /match the connected/ : reason === "locked" ? /unlocked/ : reason === "foreign" ? /payment credential/ : reason === "overdraw" ? /exceeds/ : reason === "deposit" ? /more lovelace in the selected/ : reason === "layout" ? /Caller output layouts/ : reason === "duplicate" ? /Duplicate|duplicate/ : /verified unspent/;
    await assert.rejects(() => buildBeneficiaryPreparationTx(f.wallet, f.config, f.input, f.fetcher), expected, reason);
  }
});
test("consolidate API accepts preparation intent and rejects caller output layouts and authority overrides", () => {
  const f = fixture();
  const request = { address: ADDRESS, config: f.config, ...f.input, beneficiaryPreparation: true };
  assert.equal(ConsolidateTxRequestSchema.safeParse(request).success, true);
  for (const extra of [{ walletOutputs: [] }, { outputDatum: f.datum }, { outputAssets: [] }, { authorityPath: "admin" }, { extraTransfers: [] }]) {
    assert.equal(ConsolidateTxRequestSchema.safeParse({ ...request, ...extra }).success, false);
  }
});
