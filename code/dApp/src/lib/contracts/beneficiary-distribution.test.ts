import assert from "node:assert/strict";
import test from "node:test";
import { scriptAddress, serializeAddressObj } from "@meshsdk/core";
import { createDefaultStateForm, createDefaultBeneficiaryFormState, stateFormToDatum, type StateFormState } from "./state-form";
import { deriveBeneficiaryDistributionStateDatum } from "./beneficiary-distribution";
import { buildSttSpendRedeemerData, resolveStructuredOnChainAction } from "./action-data";
import type { Asset, ConstrData } from "@/lib/types/contracts";
const KEY = "11".repeat(28);
const ADDRESS = "addr_test1vqg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygxrcya6";
const SCRIPT_ADDRESS = serializeAddressObj(scriptAddress("22".repeat(28),"33".repeat(28),true),0);
const REF = {txHash:"44".repeat(32),outputIndex:2};
const UNIT = "ab".repeat(28)+"01";
function form():StateFormState {
  return {...createDefaultStateForm(),proofOfLifeUnlockTimeMode:"some",proofOfLifeUnlockTime:"1000",proofOfLifeIncrementMode:"some",proofOfLifeIncrement:"60",
    beneficiaries:[KEY,"55".repeat(28)].map((key,index) => ({...createDefaultBeneficiaryFormState(String(index+7)),wallets:[key],weight:String(index+2),payoutAddress:index?SCRIPT_ADDRESS:ADDRESS}))};
}
function derive(stateDatum=stateFormToDatum(form()),walletInputAmount:Asset[]=[{unit:"lovelace",quantity:"5000000"},{unit:UNIT,quantity:"10"}],changes={}) {
  return deriveBeneficiaryDistributionStateDatum({stateDatum,walletInputAmount,beneficiarySignerKeyHash:KEY,sttInput:REF,txEarliestTimeMs:2000,txLatestTimeMs:3000,...changes});
}
test("exact distribution pays every weighted asset to full configured addresses with distinct State-bound tags",()=>{
  const state=stateFormToDatum(form());const original=structuredClone(state);const result=derive(state);
  assert.equal(result.beneficiaryId,7);assert.equal(result.totalWeight,5n);assert.deepEqual(result.outputDatum,state);assert.deepEqual(state,original);
  assert.deepEqual(result.payouts.map(p=>p.address),[ADDRESS,SCRIPT_ADDRESS]);
  assert.deepEqual(result.payouts.map(p=>p.amount),[
    [{unit:"lovelace",quantity:"2000000"},{unit:UNIT,quantity:"4"}],
    [{unit:"lovelace",quantity:"3000000"},{unit:UNIT,quantity:"6"}]
  ]);
  assert.deepEqual(result.payouts.map(p=>p.inlineDatum),[{alternative:0,fields:[7,REF.txHash,2]},{alternative:0,fields:[8,REF.txHash,2]}]);
});
test("exact distribution rejects rounding for native assets and ADA",()=>{
  assert.throws(()=>derive(undefined,[{unit:"lovelace",quantity:"5000000"},{unit:UNIT,quantity:"1"}]),/cannot be split exactly/);
  assert.throws(()=>derive(undefined,[{unit:"lovelace",quantity:"5000001"},{unit:UNIT,quantity:"10"}]),/lovelace cannot be split exactly/);
  assert.throws(()=>derive(undefined,[{unit:UNIT,quantity:"-1"}]),/non-negative/);
});
test("exact distribution requires all unlocks and empty streams without removing beneficiary rights",()=>{
  const state=form();state.beneficiaries[1]!.unlockAfterMode="some";state.beneficiaries[1]!.unlockAfter="2001";
  assert.throws(()=>derive(stateFormToDatum(state)),/Beneficiary 8 is still locked/);
  state.beneficiaries[1]!.unlockAfter="2000";assert.doesNotThrow(()=>derive(stateFormToDatum(state)));
  state.proofOfLifeUnlockTime="2001";assert.throws(()=>derive(stateFormToDatum(state)),/Every beneficiary must be unlocked/);
  state.proofOfLifeUnlockTime="1000";
  state.streamingPayments=[{id:"1",payoutAddress:ADDRESS,paidOutAmount:"0",policyId:"",assetName:"",amountPerDay:"1",startDate:"0",endDate:"100000"}];
  assert.throws(()=>derive(stateFormToDatum(state)),/settled and removed/);
  assert.throws(()=>derive(undefined,undefined,{beneficiarySignerKeyHash:"99".repeat(28)}),/exactly one beneficiary/);
});
test("multiple beneficiaries preserve cadence; sole beneficiary stamps and must obey it",()=>{
  const state=form();state.lastNonAdminPayoutAt={alternative:0,fields:[1999]};
  assert.deepEqual(derive(stateFormToDatum(state)).outputDatum.fields[5],state.lastNonAdminPayoutAt);
  state.beneficiaries=state.beneficiaries.slice(0,1);
  assert.throws(()=>derive(stateFormToDatum(state)),/30-minute/);
  state.lastNonAdminPayoutAt={alternative:1,fields:[]};const input=stateFormToDatum(state);
  const result=derive(input);assert.deepEqual(result.outputDatum.fields[5],{alternative:0,fields:[3000]});
  assert.deepEqual((result.outputDatum.fields[0] as ConstrData).fields[2],(input.fields[0] as ConstrData).fields[2]);
  assert.deepEqual(result.payouts[0]!.amount,[{unit:"lovelace",quantity:"5000000"},{unit:UNIT,quantity:"10"}]);
  assert.throws(()=>derive(input,undefined,{txLatestTimeMs:3_602_001}),/1 hour|one hour|one-hour|60 minutes/);
});
test("exact distribution has no fixed native asset count cap",()=>{
  const assets=[{unit:"lovelace",quantity:"5000000"},...Array.from({length:8},(_,index)=>({unit:"ab".repeat(28)+String(index).padStart(2,"0"),quantity:"10"}))];
  assert.equal(derive(undefined,assets).payouts[0]!.amount.length,9);
});
test("distribution codec appends index9 without changing prior beneficiary actions",()=>{
  assert.deepEqual(resolveStructuredOnChainAction("distribute-beneficiaries"),{kind:"distribute-beneficiaries"});
  assert.deepEqual(buildSttSpendRedeemerData({kind:"distribute-beneficiaries",beneficiaryId:7}),{alternative:9,fields:[7]});
  assert.throws(()=>buildSttSpendRedeemerData({kind:"distribute-beneficiaries"}),/requires the initiating/);
  assert.throws(()=>buildSttSpendRedeemerData({kind:"distribute-beneficiaries",beneficiaryId:-1}),/must be between/);
  assert.deepEqual(buildSttSpendRedeemerData({kind:"beneficiary-withdrawal",beneficiaryId:7}),{alternative:3,fields:[7]});
  assert.deepEqual(buildSttSpendRedeemerData({kind:"beneficiary-exit",beneficiaryId:7}),{alternative:7,fields:[7]});
});
