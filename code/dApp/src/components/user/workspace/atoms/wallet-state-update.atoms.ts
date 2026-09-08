import { atom } from "jotai";
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
};

export const pendingWalletStateUpdateAtom = atom<PendingWalletStateUpdate | null>(null);
export const walletStateUpdateRunAtom = atom(0);
export const walletStateUpdatingAtom = atom((get) => get(pendingWalletStateUpdateAtom) !== null);

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
  (get, set, pending: PendingWalletStateUpdate) => {
    set(walletStateUpdateRunAtom, get(walletStateUpdateRunAtom) + 1);
    set(pendingWalletStateUpdateAtom, pending);
  }
);

export const retireWalletStateUpdateAtom = atom(null, (get, set) => {
  set(walletStateUpdateRunAtom, get(walletStateUpdateRunAtom) + 1);
  set(pendingWalletStateUpdateAtom, null);
});

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
  (get, set, payload: { pending: PendingWalletStateUpdate; replacementRef: SttInputRef }) => {
    const current = get(pendingWalletStateUpdateAtom);
    if (!current ||
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
    set(walletStateUpdateRunAtom, get(walletStateUpdateRunAtom) + 1);
    set(pendingWalletStateUpdateAtom, null);
    return true;
  }
);
