import { deserializeAddress, serializeData, type UTxO } from "@meshsdk/core";
import type { Protocol } from "@meshsdk/common";
import type { BeneficiaryPreparationFormInput, ConstrData, WalletScriptOutput } from "@/lib/types/contracts";
import { assertBeneficiaryPreparationAuthority, planBeneficiaryRecoveryPreparation } from "@/lib/contracts/beneficiary-recovery-preparation";
import { resolveWalletContinuingOutputAddressFromState } from "@/lib/contracts/blueprint";
import { unwrapStateDatum } from "@/lib/contracts/stt-datum";
import { assertValidAssetList, assertValidConstrData, assertValidWalletInputRefs } from "./guards";
import { mergeAssetLists } from "./value";
import { decodeConstrDatumFromUtxo } from "./datum";
import { getValidityWindow } from "./core";
export type PreparationConsolidateInput = BeneficiaryPreparationFormInput & {
  beneficiaryPreparation: true;
};
export function validateBeneficiaryPreparationInput(input: PreparationConsolidateInput) {
  for (const key of ["outputDatum", "outputAssets", "walletOutputs", "extraTransfers", "authorityPath"]) {
    if (key in input) {
      throw new Error("Recovery preparation derives the State, outputs and beneficiary authority. Caller output layouts and authority overrides are not allowed.");
    }
  }
  if (!/^[0-9a-f]{56}$/i.test(input.beneficiarySignerKeyHash)) {
    throw new Error("Recovery preparation requires a beneficiary payment key hash.");
  }
  assertValidWalletInputRefs(input.walletInputs, "Preparation wallet inputs");
  assertValidAssetList(input.poolAssets, "Preparation pool assets");
  if (input.expectedStateDatum !== undefined) {
    assertValidConstrData(input.expectedStateDatum, "Expected preparation State");
  }
}

export function resolveBeneficiaryPreparation(input: PreparationConsolidateInput, stateInput: UTxO, walletInputs: UTxO[], changeAddress: string, protocolParams: Protocol, referenceTime: number, params: {
  sttPolicyId: string;
  sttAssetNameHex: string;
}) {
  const stateDatum = decodeConstrDatumFromUtxo(stateInput);
  if (!stateDatum) {
    throw new Error("Recovery preparation requires an inline State datum.");
  }
  const state = unwrapStateDatum(stateDatum, "Preparation State");
  if (input.expectedStateDatum && serializeData(unwrapStateDatum(input.expectedStateDatum, "Expected preparation State"), "Mesh") !== serializeData(state, "Mesh")) {
    throw new Error("Recovery preparation State changed. Refresh the wallet and review a new preparation plan.");
  }
  const signer = deserializeAddress(changeAddress).pubKeyHash;
  if (!signer || signer !== input.beneficiarySignerKeyHash.toLowerCase()) {
    throw new Error("Recovery preparation beneficiary signer must match the connected wallet.");
  }
  assertBeneficiaryPreparationAuthority(state, signer, getValidityWindow(referenceTime).earliestTimeMs);
  const walletAddress = resolveWalletContinuingOutputAddressFromState({
    ...params,
    stateDatum: state
  });
  const plan = planBeneficiaryRecoveryPreparation({
    stateDatum: state,
    selectedAmount: mergeAssetLists(walletInputs.map(utxo => utxo.output.amount)),
    poolAssets: input.poolAssets,
    walletAddress,
    protocolParams
  });
  if (!plan.isReady) {
    if (plan.depositShortfall > 0n) {
      throw new Error(`Recovery preparation needs at least ${plan.depositShortfall} more lovelace in the selected wallet inputs. Deposit ADA into the wallet, then select it and rebuild.`);
    }
    throw new Error(`Recovery preparation needs a different ADA allocation. The clean pool needs at least ${plan.minimumPoolLovelace} lovelace, in multiples of ${plan.quantum}; its remainder needs ${plan.minimumRemainderLovelace} lovelace. Selected wallet ADA can cover this. Adjust the pool amount and rebuild.`);
  }
  return {
    state,
    walletAddress,
    plan
  };
}

export type PreparationOutputEvidence = {
  stateInput: UTxO;
  walletInputs: UTxO[];
  stateDatum: ConstrData;
  walletAddress: string;
  walletOutputs: WalletScriptOutput[];
  changeAddress: string;
};
