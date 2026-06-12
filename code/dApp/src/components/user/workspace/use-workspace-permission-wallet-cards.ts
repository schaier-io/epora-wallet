"use client";
import { detectedSttTokensAtom, permissionWalletSummariesAtom, permissionWalletSummariesLoadingAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";
import { useAtomValue } from "jotai";
import { detectedTokenSearchAtom } from "@/components/user/workspace/atoms/workspace-ui.atoms";

import { useMemo } from "react";

import {
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
  const autoOpenDetectedWalletUnit = useMemo(() => {
    const relevantCards = permissionWalletCards.filter((entry) => {
      const roles = entry.roleBadges.filter((badge) => badge !== "Receive only");
      return roles.length > 0;
    });

    return chooseAutoOpenDetectedWallet(
      (relevantCards.length > 0 ? relevantCards : permissionWalletCards).map((entry) => ({
        unit: entry.token.unit
      }))
    );
  }, [permissionWalletCards]);
  const defaultDetectedWalletUnit = useMemo(() => {
    const relevantCards = permissionWalletCards.filter((entry) => {
      const roles = entry.roleBadges.filter((badge) => badge !== "Receive only");
      return roles.length > 0;
    });
    const candidateCards = relevantCards.length > 0 ? relevantCards : permissionWalletCards;
    return candidateCards[0]?.token.unit ?? null;
  }, [permissionWalletCards]);
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
