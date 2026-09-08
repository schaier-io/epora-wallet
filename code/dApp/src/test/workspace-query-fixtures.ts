import { atom } from "jotai";
import type { UTxO } from "@meshsdk/common";
import type { DetectedSttToken, SharedSttReferenceStoreInfo } from "@/lib/mesh/detection";
import type { PermissionWalletLockedSummary } from "@/components/user/workspace/types";

// Component fixtures. Production selectors remain read-only.
export const lockedContractUtxosAtom = atom<UTxO[]>([]);
export const lockedContractUtxosLoadingAtom = atom(false);
export const lockedContractUtxosErrorAtom = atom<string | null>(null);
export const detectedSttTokensAtom = atom<DetectedSttToken[]>([]);
export const detectedSttTokensLoadingAtom = atom(false);
export const detectedSttTokensErrorAtom = atom<string | null>(null);
export const permissionWalletSummariesAtom = atom<Record<string, PermissionWalletLockedSummary>>({});
export const permissionWalletSummariesLoadingAtom = atom(false);
export const sharedSttReferenceStoreAtom = atom<SharedSttReferenceStoreInfo | null>(null);
export const sharedSttReferenceStoreLoadingAtom = atom(false);
export const sharedSttReferenceStoreErrorAtom = atom<string | null>(null);
