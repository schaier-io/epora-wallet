"use client";

import { atom } from "jotai";
import { stateFormToDatum } from "@/lib/contracts/state-form";
import {
  resolveWalletContinuingOutputAddress,
  resolveWalletSpendScriptHash,
  resolveWalletStakeScriptCredentialData
} from "@/lib/contracts/blueprint";
import { composeWalletReceiveAddress } from "@/lib/contracts/payout-address";
import { computeAllowancePreview } from "@/components/user/workspace/workspace-allowance-preview";
import {
  cloneStateForm,
  isAsset,
  mergeAmountLists,
  readProofOfLifeOption,
  resolveOperatorActionAlternative
} from "@/components/user/workspace/helpers";
import { lockedContractUtxosAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";
import { configAtom } from "@/components/user/workspace/atoms/workspace-config.atoms";
import { consolidateStateFormAtom } from "@/components/user/workspace/atoms/forms/consolidate-form.atoms";
import {
  sttExtraTransfersAtom,
  sttStateFormAtom,
  sttWalletInputsAtom,
  sttWalletOutputsAtom
} from "@/components/user/workspace/atoms/forms/stt-spend-form.atoms";
import { activePaymentKeyHashAtom } from "@/providers/wallet.atoms";
import { effectiveSttActionAtom } from "@/components/user/workspace/atoms/workspace-selection.atoms";
import {
  effectiveWalletAssetNameHexAtom,
  selectedDetectedTokenAtom,
  selectedDetectedTokenStateFormAtom
} from "@/components/user/workspace/atoms/workspace-detected-token.atoms";

/**
 * Wallet-level derivations (the inferred STT state, allowance preview, locking-contract / receive /
 * staking addresses, and locked-asset totals) as derived atoms over the selected token, the STT /
 * consolidate forms, config, and locked utxos — converted from the memo-only
 * useWorkspaceWalletDerivations. Every input is an atom, so these compute once in the atom graph.
 */
export const activeInferredSttStateFormAtom = atom((get) => {
  const selectedForm = get(selectedDetectedTokenStateFormAtom);
  if (selectedForm) return cloneStateForm(selectedForm);
  return cloneStateForm(
    get(effectiveSttActionAtom) === "consolidate-utxo"
      ? get(consolidateStateFormAtom)
      : get(sttStateFormAtom)
  );
});

export const useAllowancePreviewAtom = atom((get) =>
  computeAllowancePreview({
    effectiveSttAction: get(effectiveSttActionAtom),
    activePaymentKeyHash: get(activePaymentKeyHashAtom),
    selectedDetectedToken: get(selectedDetectedTokenAtom),
    activeInferredSttStateForm: get(activeInferredSttStateFormAtom),
    sttWalletOutputs: get(sttWalletOutputsAtom),
    sttExtraTransfers: get(sttExtraTransfersAtom),
    sttWalletInputs: get(sttWalletInputsAtom),
    lockedContractUtxos: get(lockedContractUtxosAtom)
  })
);

export const sttOutputDatumAtom = atom((get) => {
  try {
    return stateFormToDatum(
      cloneStateForm(get(activeInferredSttStateFormAtom)),
      resolveOperatorActionAlternative("admin")
    );
  } catch {
    return null;
  }
});

export const sttProofOfLifeIncrementAtom = atom((get) =>
  readProofOfLifeOption(get(sttOutputDatumAtom), 4)
);
export const sttProofOfLifeUnlockTimeAtom = atom((get) =>
  readProofOfLifeOption(get(sttOutputDatumAtom), 3)
);

export const lockingContractAtom = atom((get) => {
    const walletPolicyId = get(configAtom).walletPolicyId?.trim() ?? "";
    const walletAssetNameHex = get(effectiveWalletAssetNameHexAtom);
    if (!walletPolicyId || !walletAssetNameHex) {
      return {
        address: null,
        error:
          "Set wallet policy ID and asset name to derive the parameterized locking contract address."
      };
    }
    try {
      // Canonical wallet address = payment credential + the State's `intended_stake_credential`.
      return {
        address: resolveWalletContinuingOutputAddress({
          sttPolicyId: walletPolicyId,
          sttAssetNameHex: walletAssetNameHex,
          intendedStakeCredential: get(activeInferredSttStateFormAtom).intendedStakeCredential
        }),
        error: null
      };
    } catch (error) {
      return {
        address: null,
        error:
          error instanceof Error
            ? error.message
            : "Unable to derive the parameterized locking contract address."
      };
    }
  }
);

// The address shown for receiving funds: the spend-script payment credential combined with the
// STT datum's `intended_stake_credential` (today always None → enterprise address, == lockingContract).
export const walletReceiveAddressAtom = atom((get) => {
  const walletPolicyId = get(configAtom).walletPolicyId?.trim() ?? "";
  const walletAssetNameHex = get(effectiveWalletAssetNameHexAtom);
  const lockingAddress = get(lockingContractAtom).address;
  if (!walletPolicyId || !walletAssetNameHex) return lockingAddress;
  try {
    const paymentScriptHash = resolveWalletSpendScriptHash({
      sttPolicyId: walletPolicyId,
      sttAssetNameHex: walletAssetNameHex
    });
    return (
      composeWalletReceiveAddress(
        paymentScriptHash,
        get(activeInferredSttStateFormAtom).intendedStakeCredential
      ) ?? lockingAddress
    );
  } catch {
    return lockingAddress;
  }
});

// Whether this wallet has recorded a stake credential (intended_stake_credential is Some / ctor 0).
export const isWalletStakingEnabledAtom = atom((get) => {
  const cred = get(activeInferredSttStateFormAtom).intendedStakeCredential as
    | { alternative?: number }
    | null
    | undefined;
  return Boolean(cred && typeof cred === "object" && cred.alternative === 0);
});

// The base (staking) address this wallet will use once staking is enabled.
export const walletStakingBaseAddressAtom = atom((get) => {
  const walletPolicyId = get(configAtom).walletPolicyId?.trim() ?? "";
  const walletAssetNameHex = get(effectiveWalletAssetNameHexAtom);
  if (!walletPolicyId || !walletAssetNameHex) return null;
  try {
    return resolveWalletContinuingOutputAddress({
      sttPolicyId: walletPolicyId,
      sttAssetNameHex: walletAssetNameHex,
      intendedStakeCredential: resolveWalletStakeScriptCredentialData({
        sttPolicyId: walletPolicyId,
        sttAssetNameHex: walletAssetNameHex
      })
    });
  } catch {
    return null;
  }
});

export const totalLockedContractAssetsAtom = atom((get) =>
  mergeAmountLists(get(lockedContractUtxosAtom).map((utxo) => utxo.output.amount.filter(isAsset)))
);
