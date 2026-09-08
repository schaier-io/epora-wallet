import { atom } from "jotai";
import { queryClientAtom } from "jotai-tanstack-query";
import { queryKeys } from "@/lib/query/keys";
import { lockedUtxosRefreshAtom } from "../queries/locked-utxos.atoms";
import type { BuildResult } from "@/lib/types/contracts";

// Remote state is owned by Query. These read-only exports preserve the existing view API.
export { lockedContractUtxosAtom, lockedContractUtxosLoadingAtom, lockedContractUtxosErrorAtom } from "../queries/locked-utxos.atoms";
export { detectedSttTokensAtom, detectedSttTokensLoadingAtom, detectedSttTokensErrorAtom } from "../queries/stt-queries.atoms";
export { permissionWalletSummariesAtom, permissionWalletSummariesLoadingAtom } from "../queries/summary-queries.atoms";
export { sharedSttReferenceStoreAtom, sharedSttReferenceStoreLoadingAtom, sharedSttReferenceStoreErrorAtom } from "../queries/shared-reference.atoms";
export { walletBalanceSummaryAtom } from "../queries/signer-balance";

export const sharedReferencePreviewAtom = atom<BuildResult | null>(null);
export const sharedReferenceBuildErrorAtom = atom<string | null>(null);
export const sharedReferenceSubmitHashAtom = atom<string | null>(null);
export const sharedReferenceBusyAtom = atom<"build" | "submit" | null>(null);

/** Drop the session's remote snapshots on disconnect; route trips keep the warm cache. */
export const resetWorkspaceDataAtom = atom(null, (get, set) => {
  const client = get(queryClientAtom);
  client.removeQueries({ queryKey: queryKeys.chain });
  client.removeQueries({ queryKey: queryKeys.signer });
  set(lockedUtxosRefreshAtom, null);
  set(sharedReferencePreviewAtom, null);
  set(sharedReferenceBuildErrorAtom, null);
  set(sharedReferenceSubmitHashAtom, null);
  set(sharedReferenceBusyAtom, null);
});
