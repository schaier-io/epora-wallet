import { atom } from "jotai";
import { resolveWalletContinuingOutputAddress, resolveWalletContinuingOutputAddressFromState } from "@/lib/contracts/blueprint";
import { getUserFacingErrorMessage } from "@/lib/utils/errors";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceAtomsWorkspaceWalletDerivationsAtoms.json";
import { cloneStateForm } from "../helpers/form-state";
import { configAtom } from "../atoms/workspace-config.atoms";
import { effectiveSttActionAtom } from "../atoms/workspace-selection.atoms";
import { consolidateStateFormAtom } from "../atoms/forms/consolidate-form.atoms";
import { sttStateFormAtom } from "../atoms/forms/stt-spend-form.atoms";
import { effectiveWalletAssetNameHexAtom, selectedDetectedTokenAtom, selectedDetectedTokenStateFormAtom } from "./token-identity.atoms";

const i18n = createDefaultTranslator("ComponentsUserWorkspaceAtomsWorkspaceWalletDerivationsAtoms", defaultMessages);

export const activeInferredSttStateFormAtom = atom((get) => {
  const selectedForm = get(selectedDetectedTokenStateFormAtom);
  if (selectedForm) return cloneStateForm(selectedForm);
  return cloneStateForm(
    get(effectiveSttActionAtom) === "consolidate-utxo"
      ? get(consolidateStateFormAtom)
      : get(sttStateFormAtom)
  );
});

export const lockingContractAtom = atom((get) => {
    const selected = get(selectedDetectedTokenAtom);
    const walletPolicyId = selected?.policyId ?? get(configAtom).walletPolicyId?.trim() ?? "";
    const walletAssetNameHex = selected?.assetNameHex ?? get(effectiveWalletAssetNameHexAtom);
    if (!walletPolicyId || !walletAssetNameHex) {
      return {
        address: null,
        error:
          i18n("chooseASmartWalletFirstItsAddressComes")
      };
    }
    try {
      // Canonical wallet address = payment credential + the State's `intended_stake_credential`.
      return {
        address: selected ? resolveWalletContinuingOutputAddressFromState({
          sttPolicyId: selected.policyId,
          sttAssetNameHex: selected.assetNameHex,
          stateDatum: selected.datum
        }) : resolveWalletContinuingOutputAddress({
          sttPolicyId: walletPolicyId,
          sttAssetNameHex: walletAssetNameHex,
          intendedStakeCredential: get(activeInferredSttStateFormAtom).intendedStakeCredential
        }),
        error: null
      };
    } catch (error) {
      return {
        address: null,
        error: getUserFacingErrorMessage(error, i18n("couldNotWorkOutThisSmartWalletS"))
      };
    }
  }
);
