import { CARDANO_NETWORK } from "@/lib/cardano-network";
import { atom } from "jotai";
import { atomWithStorage, createJSONStorage, unstable_withStorageValidator as withStorageValidator } from "jotai/utils";
import { routeStateAtom } from "./workspace-route.atoms";
import type { createStore } from "jotai";

import type { UserActionKind } from "@/components/user/flow-types";
import {
  consolidateSttInputHashAtom,
  consolidateSttInputIndexAtom
} from "@/components/user/workspace/atoms/forms/consolidate-form.atoms";
import {
  publishSttInputHashAtom,
  publishSttInputIndexAtom
} from "@/components/user/workspace/atoms/forms/publish-form.atoms";
import {
  sttInputOutputIndexAtom,
  sttInputTxHashAtom
} from "@/components/user/workspace/atoms/forms/stt-spend-form.atoms";
import {
  voteSttInputHashAtom,
  voteSttInputIndexAtom
} from "@/components/user/workspace/atoms/forms/vote-form.atoms";
import {
  withdrawSttInputHashAtom,
  withdrawSttInputIndexAtom
} from "@/components/user/workspace/atoms/forms/withdraw-form.atoms";
import type { DetectedSttToken } from "@/lib/mesh/detection";

export type SttInputRef = { txHash: string; outputIndex: number };

export type PendingWalletStateUpdate = {
  walletUnit: string;
  submittedTxHash: string;
  spentRef: SttInputRef;
  invalidHereafter?: number;
};

export const WALLET_STATE_STORAGE_KEY = `epora:${CARDANO_NETWORK}:pending-wallet-state:v1`;
type PendingUpdates = Record<string, PendingWalletStateUpdate>;
function validPendingUpdates(value: unknown): value is PendingUpdates {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).every(([unit, entry]) => {
    const pending = entry as PendingWalletStateUpdate | null;
    return /^[0-9a-f]{58,120}$/i.test(unit) && unit.length % 2 === 0 &&
      pending?.walletUnit === unit && /^[0-9a-f]{64}$/i.test(pending.submittedTxHash) &&
      /^[0-9a-f]{64}$/i.test(pending.spentRef?.txHash) &&
      (pending.invalidHereafter === undefined || (Number.isSafeInteger(pending.invalidHereafter) && pending.invalidHereafter >= 0)) &&
      Number.isSafeInteger(pending.spentRef?.outputIndex) && pending.spentRef.outputIndex >= 0;
  });
}
const jsonStorage = createJSONStorage<unknown>();
const storage = withStorageValidator(validPendingUpdates)({
  ...jsonStorage,
  setItem: (key: string, value: unknown) => {
    // A missing browser store must stop broadcast, not silently discard its guard.
    if (typeof window !== "undefined") window.localStorage.setItem(key, JSON.stringify(value));
  }
});
export const pendingWalletStateUpdatesAtom = atomWithStorage<PendingUpdates>(
  WALLET_STATE_STORAGE_KEY, {}, storage, { getOnInit: true }
);
// Signing is guarded before a submitted hash exists. Confirmed submissions use durable records.
export const walletStateSubmissionsAtom = atom<Record<string, boolean>>({});
export const pendingWalletStateUpdateAtom = atom(
  get => {
    const updates = get(pendingWalletStateUpdatesAtom);
    const unit = get(routeStateAtom).selectedWalletUnit;
    return unit ? updates[unit] ?? null : Object.values(updates)[0] ?? null;
  },
  (get, set, pending: PendingWalletStateUpdate | null) => {
    if (pending) set(pendingWalletStateUpdatesAtom, { ...get(pendingWalletStateUpdatesAtom), [pending.walletUnit]: pending });
    else {
      const current = get(pendingWalletStateUpdateAtom);
      if (!current) return;
      const remaining = { ...get(pendingWalletStateUpdatesAtom) };
      delete remaining[current.walletUnit];
      set(pendingWalletStateUpdatesAtom, remaining);
    }
  }
);
export const walletStateUpdatingAtom = atom((get) => {
  const unit = get(routeStateAtom).selectedWalletUnit;
  const submissions = get(walletStateSubmissionsAtom);
  return get(pendingWalletStateUpdateAtom) !== null ||
    (unit ? Boolean(submissions[unit]) : Object.values(submissions).some(Boolean));
});

const STT_CONSUMING_ACTIONS = new Set<UserActionKind>([
  "use",
  "renew-proof-of-life",
  "update-state",
  "manage-streaming-payments",
  "use-allowance",
  "use-beneficiary",
  "stop-beneficiary-stream",
  "distribute-beneficiaries",
  "payout-streaming-payment",
  "consolidate-utxo",
  "wallet-withdraw",
  "wallet-publish",
  "wallet-vote",
  "set-intended-stake-credential"
]);

export function isSttConsumingWorkspaceAction(action: UserActionKind): boolean {
  return STT_CONSUMING_ACTIONS.has(action);
}

function readRef(hash: string, index: string): SttInputRef | null {
  const txHash = hash.trim();
  const outputIndex = index.trim();
  if (!txHash || !/^\d+$/.test(outputIndex)) return null;
  return { txHash, outputIndex: Number(outputIndex) };
}

export function resolveSpentSttRef(
  store: ReturnType<typeof createStore>,
  action: UserActionKind,
  selectedToken: DetectedSttToken | null
): SttInputRef | null {
  if (!isSttConsumingWorkspaceAction(action)) return null;
  if (action === "consolidate-utxo") {
    return readRef(store.get(consolidateSttInputHashAtom), store.get(consolidateSttInputIndexAtom));
  }
  if (action === "wallet-withdraw") {
    return readRef(store.get(withdrawSttInputHashAtom), store.get(withdrawSttInputIndexAtom))
      ?? selectedToken?.utxo.input ?? null;
  }
  if (action === "wallet-publish") {
    return readRef(store.get(publishSttInputHashAtom), store.get(publishSttInputIndexAtom))
      ?? selectedToken?.utxo.input ?? null;
  }
  if (action === "wallet-vote") {
    return readRef(store.get(voteSttInputHashAtom), store.get(voteSttInputIndexAtom))
      ?? selectedToken?.utxo.input ?? null;
  }
  if (action === "set-intended-stake-credential") {
    return selectedToken?.utxo.input ?? null;
  }
  return readRef(store.get(sttInputTxHashAtom), store.get(sttInputOutputIndexAtom));
}

export const beginWalletStateUpdateAtom = atom(
  null,
  (_get, set, pending: PendingWalletStateUpdate) => {
    set(pendingWalletStateUpdateAtom, pending);
  }
);

const DRAFT_REF_PAIRS = [
  [sttInputTxHashAtom, sttInputOutputIndexAtom],
  [consolidateSttInputHashAtom, consolidateSttInputIndexAtom],
  [withdrawSttInputHashAtom, withdrawSttInputIndexAtom],
  [publishSttInputHashAtom, publishSttInputIndexAtom],
  [voteSttInputHashAtom, voteSttInputIndexAtom]
] as const;

function sameRef(hash: string, index: string, ref: SttInputRef) {
  return hash.trim().toLowerCase() === ref.txHash.toLowerCase() &&
    index.trim() === String(ref.outputIndex);
}

export const completeWalletStateUpdateAtom = atom(
  null,
  (get, set, payload: { pending: PendingWalletStateUpdate; replacementRef: SttInputRef; expired?: boolean }) => {
    const current = get(pendingWalletStateUpdatesAtom)[payload.pending.walletUnit];
    if (!current ||
      (!payload.expired && sameRef(payload.replacementRef.txHash, String(payload.replacementRef.outputIndex), current.spentRef)) ||
      current.walletUnit !== payload.pending.walletUnit ||
      current.submittedTxHash !== payload.pending.submittedTxHash ||
      !sameRef(current.spentRef.txHash, String(current.spentRef.outputIndex), payload.pending.spentRef)) {
      return false;
    }

    for (const [hashAtom, indexAtom] of DRAFT_REF_PAIRS) {
      if (sameRef(get(hashAtom), get(indexAtom), current.spentRef)) {
        set(hashAtom, payload.replacementRef.txHash);
        set(indexAtom, String(payload.replacementRef.outputIndex));
      }
    }
    const remaining = { ...get(pendingWalletStateUpdatesAtom) };
    delete remaining[current.walletUnit];
    set(pendingWalletStateUpdatesAtom, remaining);
    return true;
  }
);
