import { type RuntimeTxBuilder } from "./budget";
import { type ReferenceScriptResolution } from "./reference-scripts";
import { unwrapStateDatum } from "@/lib/contracts/stt-datum";
import { type ConstrData } from "@/lib/types/contracts";
import { type Budget, DEFAULT_REDEEMER_BUDGET, type LanguageVersion } from "@meshsdk/common";

export function applyMintWitness(
  txBuilder: RuntimeTxBuilder,
  policyId: string,
  assetName: string,
  script: { code: string; version: LanguageVersion },
  referenceScript: ReferenceScriptResolution | null,
  budget?: Budget
) {
  txBuilder.mintPlutusScript(script.version).mint("1", policyId, assetName);

  if (referenceScript) {
    txBuilder
      .mintTxInReference(
        referenceScript.utxo.input.txHash,
        referenceScript.utxo.input.outputIndex,
        referenceScript.scriptSize,
        referenceScript.scriptHash
      )
      .mintReferenceTxInRedeemerValue(
        { alternative: 0, fields: [] },
        "Mesh",
        budget
      );
    return;
  }

  txBuilder
    .mintingScript(script.code)
    .mintRedeemerValue({ alternative: 0, fields: [] }, "Mesh", budget);
}



export function applyWithdrawalWitness(
  txBuilder: RuntimeTxBuilder,
  script: { code: string; version: LanguageVersion },
  referenceScript: ReferenceScriptResolution | null,
  redeemer: ConstrData,
  budget?: Budget
) {
  txBuilder.withdrawalPlutusScriptV3();

  if (referenceScript) {
    txBuilder.withdrawalTxInReference(
      referenceScript.utxo.input.txHash,
      referenceScript.utxo.input.outputIndex,
      referenceScript.scriptSize,
      referenceScript.scriptHash
    );
  } else {
    txBuilder.withdrawalScript(script.code);
  }

  txBuilder.withdrawalRedeemerValue(redeemer, "Mesh", budget);
}



export function buildGovernanceScriptSource(
  script: { code: string; version: LanguageVersion },
  referenceScript: ReferenceScriptResolution | null
) {
  if (referenceScript) {
    return {
      type: "Inline" as const,
      txHash: referenceScript.utxo.input.txHash,
      txIndex: referenceScript.utxo.input.outputIndex,
      scriptHash: referenceScript.scriptHash,
      scriptSize: referenceScript.scriptSize,
      version: script.version
    };
  }

  return {
    type: "Provided" as const,
    script
  };
}



export function withWalletWitness(datum: ConstrData, _walletWitness: ConstrData): ConstrData {
  void _walletWitness;
  return unwrapStateDatum(datum, "STT state datum");
}



export function createMeshRedeemer(data: ConstrData): { data: { type: "Mesh"; content: ConstrData }; exUnits: Budget } {
  return {
    data: {
      type: "Mesh",
      content: data
    },
    exUnits: {
      mem: DEFAULT_REDEEMER_BUDGET.mem,
      steps: DEFAULT_REDEEMER_BUDGET.steps
    }
  };
}


