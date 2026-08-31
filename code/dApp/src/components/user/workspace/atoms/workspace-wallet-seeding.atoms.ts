import { atom } from "jotai";

import {
  consolidateStateFormAtom,
  consolidateSttAssetsAtom,
  consolidateSttInputHashAtom,
  consolidateSttInputIndexAtom,
  consolidateWalletInputsAtom,
  consolidateWalletOutputsAtom
} from "@/components/user/workspace/atoms/forms/consolidate-form.atoms";
import {
  publishSttAssetsAtom,
  publishSttInputHashAtom,
  publishSttInputIndexAtom,
  publishSttStateFormAtom,
  publishZeroAdminConfirmedAtom
} from "@/components/user/workspace/atoms/forms/publish-form.atoms";
import {
  streamingPaymentPayoutAmountsAtom,
  sttExtraTransfersAtom,
  sttInputOutputIndexAtom,
  sttInputTxHashAtom,
  sttOutputAssetsAtom,
  sttProofOfLifeOverrideModeAtom,
  sttProofOfLifeSpecificDateTimeAtom,
  sttStateFormAtom,
  sttTransferAddressAtom,
  sttTransferAmountsAtom,
  sttWalletInputsAtom,
  sttWalletOutputsAtom,
  sttZeroAdminConfirmedAtom
} from "@/components/user/workspace/atoms/forms/stt-spend-form.atoms";
import {
  transferCustomAddressAtom,
  transferDisplayAmountAtom,
  transferRecipientModeAtom,
  transferSelectedUnitAtom
} from "@/components/user/workspace/atoms/forms/transfer-form.atoms";
import {
  voteSttAssetsAtom,
  voteSttInputHashAtom,
  voteSttInputIndexAtom,
  voteSttStateFormAtom,
  voteZeroAdminConfirmedAtom
} from "@/components/user/workspace/atoms/forms/vote-form.atoms";
import {
  withdrawSttAssetsAtom,
  withdrawSttInputHashAtom,
  withdrawSttInputIndexAtom,
  withdrawSttStateFormAtom,
  withdrawZeroAdminConfirmedAtom
} from "@/components/user/workspace/atoms/forms/withdraw-form.atoms";
import { configAtom } from "@/components/user/workspace/atoms/workspace-config.atoms";
import { cloneStateForm } from "@/components/user/workspace/helpers/form-state";
import { stateFormFromDatum } from "@/lib/contracts/state-form";
import type { DetectedSttToken } from "@/lib/mesh/detection";

/** Replace every wallet-bound action draft when the active detected token changes. */
export const seedWorkspaceWalletAtom = atom(
  null,
  (_get, set, token: DetectedSttToken) => {
    const stateForm = stateFormFromDatum(token.datum);
    const inputTxHash = token.utxo.input.txHash;
    const inputOutputIndex = token.utxo.input.outputIndex.toString();

    set(configAtom, (current) => ({
      ...current,
      sttAssetNameHex: token.assetNameHex,
      walletPolicyId: token.policyId,
      walletAssetNameHex: token.assetNameHex
    }));

    set(sttInputTxHashAtom, inputTxHash);
    set(sttInputOutputIndexAtom, inputOutputIndex);
    set(sttZeroAdminConfirmedAtom, false);
    set(sttStateFormAtom, cloneStateForm(stateForm));
    set(sttOutputAssetsAtom, []);
    set(sttWalletInputsAtom, []);
    set(sttWalletOutputsAtom, []);
    set(sttExtraTransfersAtom, []);
    set(sttProofOfLifeOverrideModeAtom, "auto");
    set(sttProofOfLifeSpecificDateTimeAtom, "");
    set(sttTransferAddressAtom, "");
    set(sttTransferAmountsAtom, {});
    set(streamingPaymentPayoutAmountsAtom, {});

    set(transferRecipientModeAtom, "");
    set(transferCustomAddressAtom, "");
    set(transferSelectedUnitAtom, "lovelace");
    set(transferDisplayAmountAtom, "");

    set(withdrawSttInputHashAtom, inputTxHash);
    set(withdrawSttInputIndexAtom, inputOutputIndex);
    set(withdrawZeroAdminConfirmedAtom, false);
    set(withdrawSttStateFormAtom, cloneStateForm(stateForm));
    set(withdrawSttAssetsAtom, []);

    set(publishSttInputHashAtom, inputTxHash);
    set(publishSttInputIndexAtom, inputOutputIndex);
    set(publishZeroAdminConfirmedAtom, false);
    set(publishSttStateFormAtom, cloneStateForm(stateForm));
    set(publishSttAssetsAtom, []);

    set(voteSttInputHashAtom, inputTxHash);
    set(voteSttInputIndexAtom, inputOutputIndex);
    set(voteZeroAdminConfirmedAtom, false);
    set(voteSttStateFormAtom, cloneStateForm(stateForm));
    set(voteSttAssetsAtom, []);

    set(consolidateSttInputHashAtom, inputTxHash);
    set(consolidateSttInputIndexAtom, inputOutputIndex);
    set(consolidateStateFormAtom, cloneStateForm(stateForm));
    set(consolidateSttAssetsAtom, []);
    set(consolidateWalletInputsAtom, []);
    set(consolidateWalletOutputsAtom, []);
  }
);
