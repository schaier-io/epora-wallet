"use client";
import { detectedSttTokensAtom, permissionWalletSummariesAtom, permissionWalletSummariesLoadingAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";
import { useAtomValue } from "jotai";
import { detectedTokenSearchAtom } from "@/components/user/workspace/atoms/workspace-ui.atoms";

import { useMemo } from "react";

import {
  holdsAnyRole,
  resolveTokenCapabilityMap
} from "@/components/user/wizard-capabilities";
import { type useSmartWalletDisplay } from "@/providers/smart-wallet-display";

import {
  countAdminUsersInStateForm,
  stateFormFromDatum
} from "@/lib/contracts/state-form";
import {
  normalizeWalletName } from "@/lib/contracts/state-wallet-name";

import {
  chooseAutoOpenDetectedWallet,
  derivePermissionWalletBadgeLabels } from "@/lib/user-flow/guided-helpers";

import { getDetectedTokenWarningMessage } from "@/components/user/workspace/helpers";

export interface WorkspacePermissionWalletCardsInputs {
  activePaymentKeyHash: string | null;
  selectedDetectedTokenUnit: string;
  smartWalletDisplay: ReturnType<typeof useSmartWalletDisplay>;
}

export function useWorkspacePermissionWalletCards(inputs: WorkspacePermissionWalletCardsInputs) {
  const {
    activePaymentKeyHash,
    selectedDetectedTokenUnit,
    smartWalletDisplay
  } = inputs;
  const detectedSttTokens = useAtomValue(detectedSttTokensAtom);
  const permissionWalletSummaries = useAtomValue(permissionWalletSummariesAtom);
  const permissionWalletSummariesLoading = useAtomValue(permissionWalletSummariesLoadingAtom);
  const detectedTokenSearch = useAtomValue(detectedTokenSearchAtom);

  const permissionWalletCards = useMemo(
    () =>
      detectedSttTokens.map((token) => {
        const state = stateFormFromDatum(token.datum);
        const lockedSummary = permissionWalletSummaries[token.unit];
        const capabilityMap = resolveTokenCapabilityMap({
          state,
          paymentKeyHash: activePaymentKeyHash,
          lockedUtxoCount: lockedSummary?.lockedUtxoCount ?? 0,
          lockedUtxosLoading: permissionWalletSummariesLoading
        });
        const roleBadges = derivePermissionWalletBadgeLabels(capabilityMap);
        const adminCount = countAdminUsersInStateForm(state);
        const walletName = normalizeWalletName(state.walletName);
        const multisigUsersCount = state.users.filter(
          (user) =>
            user.multiSigPowerMode === "some" && user.multiSigPower.trim().length > 0
        ).length;

        return {
          token,
          state,
          capabilityMap,
          roleBadges,
          primaryLabel: walletName,
          secondaryLabel: token.utxo.input.txHash.slice(0, 10),
          warning: getDetectedTokenWarningMessage(state),
          lockedSummary,
          adminCount,
          multisigUsersCount
        };
      }),
    [
      activePaymentKeyHash,
      detectedSttTokens,
      permissionWalletSummaries,
      permissionWalletSummariesLoading
    ]
  );
  const filteredPermissionWalletCards = useMemo(() => {
    const query = detectedTokenSearch.trim().toLowerCase();

    return permissionWalletCards.filter((entry) => {
      if (!query) {
        return true;
      }

      const txRef = `${entry.token.utxo.input.txHash}#${entry.token.utxo.input.outputIndex}`.toLowerCase();
      return (
        entry.primaryLabel.toLowerCase().includes(query) ||
        entry.secondaryLabel.toLowerCase().includes(query) ||
        entry.token.assetNameHex.toLowerCase().includes(query) ||
        txRef.includes(query)
      );
    });
  }, [detectedTokenSearch, permissionWalletCards]);
  // Every smart wallet on the policy is listed to everyone (`lib/mesh/detection.ts` scans
  // the policy, not the connected account), so which of them to OPEN has to be decided by
  // the connected key's roles. Both selectors used to fall back to the unfiltered list when
  // the key held no role anywhere, which opened a stranger's wallet and presented it as the
  // user's own. With no role there is nothing to open: the wallet picker is the right
  // landing place.
  const relevantCards = useMemo(
    () => permissionWalletCards.filter((entry) => holdsAnyRole(entry.capabilityMap)),
    [permissionWalletCards]
  );
  const autoOpenDetectedWalletUnit = useMemo(
    () => chooseAutoOpenDetectedWallet(relevantCards.map((entry) => ({ unit: entry.token.unit }))),
    [relevantCards]
  );
  const defaultDetectedWalletUnit = useMemo(
    () => relevantCards[0]?.token.unit ?? null,
    [relevantCards]
  );
  // Stable "this signer already has smart wallets" signal. `detectedSttTokens`
  // can transiently read 0 (chain-detection flakiness); the server-side
  // summaries persist, so they tell us whether to offer onboarding.
  const knownPermissionWalletCount = Object.keys(permissionWalletSummaries).length;
  const selectedPermissionWalletCard = useMemo(
    () =>
      permissionWalletCards.find((entry) => entry.token.unit === selectedDetectedTokenUnit) ??
      null,
    [permissionWalletCards, selectedDetectedTokenUnit]
  );

  // Publish the active smart wallet name + a switch handler so chrome outside
  // the workspace (top nav, etc.) can show it and open the picker.
  const smartWalletDisplayPublish = smartWalletDisplay.publish;
  const smartWalletDisplayReset = smartWalletDisplay.reset;

  return {
    permissionWalletCards,
    filteredPermissionWalletCards,
    autoOpenDetectedWalletUnit,
    defaultDetectedWalletUnit,
    knownPermissionWalletCount,
    selectedPermissionWalletCard,
    smartWalletDisplayPublish,
    smartWalletDisplayReset
  };
}
