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

  const allPermissionWalletCards = useMemo(
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
  // Every smart wallet on the policy is detected for everyone (`lib/mesh/detection.ts` scans
  // the policy, not the connected account), so the raw list above is the whole network's
  // wallets, not this signer's. The picker used to render it unfiltered: a fresh signer was
  // shown two "Receive only" wallets belonging to strangers and invited to open them. Every
  // surface that says "your smart wallets" -- the picker, the header count, the switcher --
  // reads THIS list, so the scoping happens once, here.
  //
  // Scoped only when there is a key to scope BY. `activePaymentKeyHash` is null for the
  // read-only demo wallet, on purpose (`providers/wallet-provider.tsx`), and every role test
  // is a `wallets.includes(paymentKeyHash)`, so a null key makes `holdsAnyRole` false for
  // every wallet on the network. Filtering on that would hand the demo tour an empty picker
  // and nothing to look at. No key means "we cannot tell whose these are", which is not the
  // same claim as "none of them is yours".
  const permissionWalletCards = useMemo(
    () =>
      activePaymentKeyHash
        ? allPermissionWalletCards.filter((entry) => holdsAnyRole(entry.capabilityMap))
        : allPermissionWalletCards,
    [activePaymentKeyHash, allPermissionWalletCards]
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
  const autoOpenDetectedWalletUnit = useMemo(
    () =>
      chooseAutoOpenDetectedWallet(
        permissionWalletCards.map((entry) => ({ unit: entry.token.unit }))
      ),
    [permissionWalletCards]
  );
  const defaultDetectedWalletUnit = useMemo(
    () => permissionWalletCards[0]?.token.unit ?? null,
    [permissionWalletCards]
  );
  // Deliberately NOT scoped to this signer, and deliberately unchanged. Its one caller reads
  // it only when detection reported zero wallets, as a guard against chain-detection
  // flakiness. Scoping it there would be pointless: with no detected tokens the scoped card
  // list is empty too, so a scoped count is always zero and the guard would never hold.
  //
  // It is a count of detected tokens that have a locked-asset summary, derived client-side
  // from the same detection (`use-detected-stt-tokens.ts`), not a server-side record.
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
