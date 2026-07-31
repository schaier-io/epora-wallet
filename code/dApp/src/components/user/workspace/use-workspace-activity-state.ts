"use client";
// State-acquisition hook for WorkspaceTransactionsView: bundles every atom
// subscription and workspace action the activity view needs into one object.
import { wealthSeriesAtom, wealthSeriesForAssetAtom } from "@/components/user/workspace/atoms/workspace-transfer-derivations.atoms";
import { activityPageCountAtom, activityRangeLabelAtom, activityVisibleEndAtom, activityVisibleStartAtom, normalizedActivityPageIndexAtom, paginatedWalletActivityEventsAtom, recentWalletActivityEventsAtom, walletTransactionsAtom } from "@/components/user/workspace/atoms/workspace-activity.atoms";
import { selectedDetectedTokenAtom } from "@/components/user/workspace/atoms/workspace-detected-token.atoms";
import { lockingContractAtom } from "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms";
import { activeAddressAtom } from "@/providers/wallet.atoms";
import { assetDetailUnitAtom, copyFeedbackAtom } from "@/components/user/workspace/atoms/workspace-ui.atoms";
import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";
import { useAtomValue, useSetAtom } from "jotai";

export function useWorkspaceActivityState() {
  const state = useWorkspaceActions();
  const wealthSeries = useAtomValue(wealthSeriesAtom);
  const wealthSeriesForAsset = useAtomValue(wealthSeriesForAssetAtom);
  const walletTransactions = useAtomValue(walletTransactionsAtom);
  const recentWalletActivityEvents = useAtomValue(recentWalletActivityEventsAtom);
  const activityPageCount = useAtomValue(activityPageCountAtom);
  const normalizedActivityPageIndex = useAtomValue(normalizedActivityPageIndexAtom);
  const paginatedWalletActivityEvents = useAtomValue(paginatedWalletActivityEventsAtom);
  const activityVisibleStart = useAtomValue(activityVisibleStartAtom);
  const activityVisibleEnd = useAtomValue(activityVisibleEndAtom);
  const activityRangeLabel = useAtomValue(activityRangeLabelAtom);
  const copyFeedback = useAtomValue(copyFeedbackAtom);
  const activeAddress = useAtomValue(activeAddressAtom);
  const lockingContract = useAtomValue(lockingContractAtom);
  const selectedDetectedToken = useAtomValue(selectedDetectedTokenAtom);
  const assetDetailUnit = useAtomValue(assetDetailUnitAtom);
  const setAssetDetailUnit = useSetAtom(assetDetailUnitAtom);
  const {
    copyTextToClipboard,
    openWorkspaceIntent,
    refreshWalletTransactions,
    setActivityPageIndex,
  } = state;

  return {
    wealthSeries,
    wealthSeriesForAsset,
    walletTransactions,
    recentWalletActivityEvents,
    activityPageCount,
    normalizedActivityPageIndex,
    paginatedWalletActivityEvents,
    activityVisibleStart,
    activityVisibleEnd,
    activityRangeLabel,
    copyFeedback,
    activeAddress,
    lockingContract,
    selectedDetectedToken,
    assetDetailUnit,
    setAssetDetailUnit,
    copyTextToClipboard,
    openWorkspaceIntent,
    refreshWalletTransactions,
    setActivityPageIndex,
  };
}
