import { atom } from "jotai";
import type { UTxO } from "@meshsdk/core";
import type { WalletBalanceSummary, PermissionWalletLockedSummary } from "@/components/user/workspace/types";
import type { DetectedSttToken, SharedSttReferenceStoreInfo } from "@/lib/mesh/detection";
import type { BuildResult } from "@/lib/types/contracts";

/**
 * Atomic model of the workspace's shared, fetched ON-CHAIN data — the outputs that used to live
 * as `useState` inside the data-fetch hooks and were threaded through the controller's return
 * object. Promoting them to atoms makes the fetched data a true singleton, so derivations (as
 * derived atoms) and views (via `useAtomValue`) read it directly instead of through the
 * `useWorkspaceActions` barrel. The data-fetch hooks remain the single writers (one instance each,
 * mounted by the controller); everyone else reads.
 */

/** UTxOs at the selected wallet's locking-contract address. */
export const lockedContractUtxosAtom = atom<UTxO[]>([]);
export const lockedContractUtxosLoadingAtom = atom(false);
export const lockedContractUtxosErrorAtom = atom<string | null>(null);

/** The CONNECTED browser wallet's own balance (not the smart wallet's). */
export const walletBalanceSummaryAtom = atom<WalletBalanceSummary>({ assets: [], loading: false, error: null });

/** Detected minted STT tokens (the user's smart wallets) + their loading/error + per-wallet summaries. */
export const detectedSttTokensAtom = atom<DetectedSttToken[]>([]);
export const detectedSttTokensLoadingAtom = atom(true);
export const detectedSttTokensErrorAtom = atom<string | null>(null);
export const permissionWalletSummariesAtom = atom<Record<string, PermissionWalletLockedSummary>>({});
export const permissionWalletSummariesLoadingAtom = atom(false);

/** The shared STT reference-store setup helper flow (a one-time helper tx). */
export const sharedSttReferenceStoreAtom = atom<SharedSttReferenceStoreInfo | null>(null);
export const sharedSttReferenceStoreLoadingAtom = atom(false);
export const sharedSttReferenceStoreErrorAtom = atom<string | null>(null);
export const sharedReferencePreviewAtom = atom<BuildResult | null>(null);
export const sharedReferenceBuildErrorAtom = atom<string | null>(null);
export const sharedReferenceSubmitHashAtom = atom<string | null>(null);
export const sharedReferenceBusyAtom = atom<"build" | "submit" | null>(null);
