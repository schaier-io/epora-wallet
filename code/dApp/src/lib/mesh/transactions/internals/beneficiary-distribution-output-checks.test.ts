import assert from "node:assert/strict";
import test from "node:test";
import { MeshTxBuilder, pubKeyAddress, scriptAddress, serializeAddressObj } from "@meshsdk/core";
import { assertBeneficiaryDistributionOutputs, type BeneficiaryDistributionEvidence, type ExpectedDistributionOutput } from "./beneficiary-distribution-output-checks";
const STATE_HASH="aa".repeat(28),WALLET_HASH="bb".repeat(28);
const STATE=serializeAddressObj(scriptAddress(STATE_HASH),0);
const WALLET=serializeAddressObj(scriptAddress(WALLET_HASH),0);
const CHANGE=serializeAddressObj(pubKeyAddress("11".repeat(28)),0);
const PAYOUT=serializeAddressObj(scriptAddress("cc".repeat(28),"dd".repeat(28),true),0);
const UNIT="ee".repeat(28)+"01";
const STATE_REF={txHash:"22".repeat(32),outputIndex:0};
const WALLET_REF={txHash:"33".repeat(32),outputIndex:1};
function plan():BeneficiaryDistributionEvidence {
  return {changeAddress:CHANGE,sttInput:STATE_REF,walletInput:WALLET_REF,walletPaymentScriptHash:WALLET_HASH,
    outputs:[
      {address:STATE,amount:[{unit:"lovelace",quantity:"2000000"}],inlineDatum:{alternative:0,fields:[]}},
      ...[CHANGE,PAYOUT].map((address,index)=>({address,amount:[{unit:"lovelace",quantity:"5000000"},{unit:UNIT,quantity:"2"}],inlineDatum:{alternative:0,fields:[index+7,STATE_REF.txHash,0]}}))
    ]};
}
function encoded(outputs:ExpectedDistributionOutput[],skipWallet=false) {
  const tx=new MeshTxBuilder().txIn(STATE_REF.txHash,0,[{unit:"lovelace",quantity:"2000000"}],STATE);
  if(!skipWallet) tx.txIn(WALLET_REF.txHash,1,[{unit:"lovelace",quantity:"10200000"},{unit:UNIT,quantity:"4"}],WALLET);
  for(const output of outputs) tx.txOut(output.address,output.amount).txOutInlineDatumValue(output.inlineDatum,"Mesh");
  return tx.setFee("200000").completeSync();
}
test("exact output evidence validates full addresses, tags and all assets independently of output order",()=>{
  const evidence=plan();assert.doesNotThrow(()=>assertBeneficiaryDistributionOutputs(encoded([...evidence.outputs].reverse()),evidence));
  const increased=structuredClone(evidence.outputs);increased[1]!.amount[0]!.quantity="5100000";
  assert.doesNotThrow(()=>assertBeneficiaryDistributionOutputs(encoded(increased),evidence));
});
test("exact output evidence rejects underpaid ADA, native changes, extra native assets and changed full addresses",()=>{
  for(const mutate of [
    (out:ExpectedDistributionOutput[])=>{out[1]!.amount[0]!.quantity="4999999";},
    (out:ExpectedDistributionOutput[])=>{out[1]!.amount[1]!.quantity="1";},
    (out:ExpectedDistributionOutput[])=>{out[1]!.amount.push({unit:"ff".repeat(28)+"01",quantity:"1"});},
    (out:ExpectedDistributionOutput[])=>{out[2]!.address=serializeAddressObj(scriptAddress("cc".repeat(28)),0);}
  ]){const evidence=plan();const outputs=structuredClone(evidence.outputs);mutate(outputs);assert.throws(()=>assertBeneficiaryDistributionOutputs(encoded(outputs),evidence),/reduced|changed|unplanned native/);}
});
test("exact output evidence rejects duplicate tags, stale tags, missing inputs and wallet destinations",()=>{
  const evidence=plan();
  assert.throws(()=>assertBeneficiaryDistributionOutputs(encoded([...evidence.outputs,evidence.outputs[1]!]),evidence),/one distinct output/);
  const stale=structuredClone(evidence.outputs);stale[1]!.inlineDatum.fields[1]="99".repeat(32);
  assert.throws(()=>assertBeneficiaryDistributionOutputs(encoded(stale),evidence),/one distinct output/);
  assert.throws(()=>assertBeneficiaryDistributionOutputs(encoded(evidence.outputs,true),evidence),/required consumed input/);
  const selfPlan=plan();selfPlan.outputs[1]!.address=WALLET;
  assert.throws(()=>assertBeneficiaryDistributionOutputs(encoded(selfPlan.outputs),selfPlan),/continuing wallet/);
});
