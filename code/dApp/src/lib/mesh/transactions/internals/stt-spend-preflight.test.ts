import assert from "node:assert/strict";
import test from "node:test";
import { readCallerForwardedState, validateSttSpendInput } from "./stt-spend-preflight";
import { formatBeneficiaryStopTimestamp } from "./beneficiary-stream-stop-review";
import type { SttSpendFormInput } from "@/lib/types/contracts";
const ADDRESS = "addr_test1vqg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygxrcya6";
const base: SttSpendFormInput = {sttInputTxHash:"22".repeat(32),beneficiarySignerKeyHash:"11".repeat(28),beneficiaryStreamStopId:7};
test("stop preflight rejects each fund movement and missing identity before fetching", () => {
  assert.doesNotThrow(() => validateSttSpendInput("stop-beneficiary-stream",base));
  assert.throws(() => validateSttSpendInput("stop-beneficiary-stream",{...base,beneficiarySignerKeyHash:undefined}), /connected wallet/);
  assert.throws(() => validateSttSpendInput("stop-beneficiary-stream",{...base,beneficiaryStreamStopId:undefined}), /target streaming/);
  for (const extra of [
    {walletInputs:[{txHash:"33".repeat(32),outputIndex:0}]},
    {walletOutputs:[{amount:[{unit:"lovelace",quantity:"2000000"}]}]},
    {extraTransfers:[{address:ADDRESS,amount:[{unit:"lovelace",quantity:"2000000"}]}]}
  ]) assert.throws(() => validateSttSpendInput("stop-beneficiary-stream",{...base,...extra}), /cannot spend wallet inputs/);
});
test("extracted preflight preserves allowance and removal requirements", () => {
  assert.throws(() => validateSttSpendInput("remove-access-index",base), /requires a target/);
  assert.throws(() => validateSttSpendInput("use-allowance",base), /connected wallet/);
  assert.throws(() => validateSttSpendInput("use-allowance",{...base,allowanceSignerKeyHash:"11".repeat(28)}), /at least one locked/);
  assert.throws(() => validateSttSpendInput("use-allowance",{...base,allowanceSignerKeyHash:"11".repeat(28),walletInputs:[{txHash:"33".repeat(32),outputIndex:0}]}), /at least one forwarded/);
  assert.throws(() => readCallerForwardedState(base), /STT output datum/);
  const input = {...base,outputDatum:{alternative:0,fields:[]},outputAssets:[]};
  assert.deepEqual(readCallerForwardedState(input),{datum:input.outputDatum,assets:[]});
});
test("stop review timestamps keep UTC readable and preserve uint64 dates exactly", () => {
  assert.equal(formatBeneficiaryStopTimestamp(0),"1970-01-01 00:00:00.000 UTC");
  assert.equal(formatBeneficiaryStopTimestamp(18_446_744_073_709_551_615n),"18446744073709551615 ms (Unix)");
});
