import { CARDANO_NETWORK } from "@/lib/cardano-network";
import { atom, type Getter } from "jotai";
import { routeStateAtom } from "./workspace-route.atoms";
import { selectedActionAtom } from "./workspace-selection.atoms";
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
  submittedAt?: number;
};

export const WALLET_STATE_STORAGE_KEY = `epora:${CARDANO_NETWORK}:pending-wallet-state:v1`;
export const WALLET_STATE_RECORD_PREFIX = `epora:${CARDANO_NETWORK}:pending-wallet-state:v2:`;
type PendingUpdates = Record<string, PendingWalletStateUpdate>;
function validPendingUpdates(value: unknown): value is PendingUpdates {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).every(([unit, entry]) => {
    const pending = entry as PendingWalletStateUpdate | null;
    return /^[0-9a-f]{58,120}$/i.test(unit) && unit.length % 2 === 0 &&
      pending?.walletUnit === unit && /^[0-9a-f]{64}$/i.test(pending.submittedTxHash) &&
      /^[0-9a-f]{64}$/i.test(pending.spentRef?.txHash) &&
      (pending.submittedAt === undefined || (Number.isSafeInteger(pending.submittedAt) && pending.submittedAt >= 0)) &&
      (pending.invalidHereafter === undefined || (Number.isSafeInteger(pending.invalidHereafter) && pending.invalidHereafter >= 0)) &&
      Number.isSafeInteger(pending.spentRef?.outputIndex) && pending.spentRef.outputIndex >= 0;
  });
}
function parseStoredValue(value: string | null): unknown {
  try { return value === null ? undefined : JSON.parse(value); } catch { return undefined; }
}

// Each wallet owns one key. Different tabs never replace one another's wallet map.
// Legacy records remain readable until a v2 record overrides them. A null v2 value
// is a tombstone: completion must not reveal the old v1 record on the next reload.
function readStoredPendingUpdates(): PendingUpdates | null {
  if (typeof window === "undefined") return null;
  const storage = window.localStorage;
  const legacy = parseStoredValue(storage.getItem(WALLET_STATE_STORAGE_KEY));
  const result: PendingUpdates = validPendingUpdates(legacy) ? { ...legacy } : {};
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(WALLET_STATE_RECORD_PREFIX)) continue;
    const unit = key.slice(WALLET_STATE_RECORD_PREFIX.length);
    const value = parseStoredValue(storage.getItem(key));
    if (value === null) delete result[unit];
    else if (validPendingUpdates({ [unit]: value })) result[unit] = value as PendingWalletStateUpdate;
  }
  return result;
}

function readPendingUpdatesOr(fallback: PendingUpdates): PendingUpdates {
  try { return readStoredPendingUpdates() ?? fallback; } catch { return fallback; }
}

const pendingUpdatesSnapshotAtom = atom<PendingUpdates | null>(null);
pendingUpdatesSnapshotAtom.onMount = setSnapshot => {
  setSnapshot(previous => readPendingUpdatesOr(previous ?? {}));
  if (typeof window === "undefined") return;
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== WALLET_STATE_STORAGE_KEY &&
        !event.key.startsWith(WALLET_STATE_RECORD_PREFIX)) return;
    // Events can be queued before a newer write. Read durable keys, not newValue.
    if (event.storageArea && event.storageArea !== window.localStorage) return;
    setSnapshot(previous => readPendingUpdatesOr(previous ?? {}));
  };
  window.addEventListener?.("storage", onStorage);
  return () => window.removeEventListener?.("storage", onStorage);
};
export const pendingWalletStateUpdatesAtom = atom(get =>
  get(pendingUpdatesSnapshotAtom) ?? readPendingUpdatesOr({})
);
const writePendingWalletRecordAtom = atom(null, (get, set, {
  unit, pending
}: { unit: string; pending: PendingWalletStateUpdate | null }) => {
  // Persist first. A missing or full browser store throws before broadcast and
  // before any observer can treat an unsuccessful deletion as confirmation.
  if (typeof window !== "undefined") {
    window.localStorage.setItem(WALLET_STATE_RECORD_PREFIX + unit, JSON.stringify(pending));
  }
  const next = { ...readPendingUpdatesOr(get(pendingWalletStateUpdatesAtom)) };
  if (pending) next[unit] = pending;
  else delete next[unit];
  set(pendingUpdatesSnapshotAtom, next);
});
// Signing is guarded before a submitted hash exists. Confirmed submissions use durable records.
export type WalletStateCheck = { txHash: string; checkedAt: number; lastSuccessfulAt: number | null; phase: "waiting" | "unavailable" };
export const walletStateChecksAtom = atom<Record<string, WalletStateCheck>>({});
export const walletStateRetryAtom = atom(0);
export const selectedWalletStateCheckAtom = atom(get => {
  const unit = get(routeStateAtom).selectedWalletUnit;
  const pending = unit ? get(pendingWalletStateUpdatesAtom)[unit] : null;
  if (!unit || !pending) return null;
  const check = get(walletStateChecksAtom)[unit];
  return { pending, check: check?.txHash === pending.submittedTxHash ? check : null };
});
export const walletStateSubmissionsAtom = atom<Record<string, boolean>>({});
// Scoped to the selected wallet. With no selection (landing, create wallet) another
// wallet's wait must not gate building, inventory or detection. The landing resume
// reads every record itself in `useWalletStateUpdate`.
export const pendingWalletStateUpdateAtom = atom(
  get => {
    const unit = get(routeStateAtom).selectedWalletUnit;
    return unit ? get(pendingWalletStateUpdatesAtom)[unit] ?? null : null;
  },
  (get, set, pending: PendingWalletStateUpdate | null) => {
    if (pending) set(writePendingWalletRecordAtom, { unit: pending.walletUnit, pending });
    else {
      const current = get(pendingWalletStateUpdateAtom);
      if (!current) return;
      set(writePendingWalletRecordAtom, { unit: current.walletUnit, pending: null });
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

// Actions that never spend the wallet's STT. Creating a wallet mints a new one; adding
// funds pays the smart wallet's address from the signer's own UTxOs.
const WALLET_STATE_INDEPENDENT_ACTIONS = new Set<string>(["mint", "lock-funds"]);

export function isWalletStateIndependentAction(action: string): boolean {
  return WALLET_STATE_INDEPENDENT_ACTIONS.has(action);
}

/**
 * Whether `action` must wait for the wallet-state update. A signing still in flight holds
 * every action, as before: one transaction at a time. Once it is submitted, only an action
 * that spends the STT has to wait, because its input is the UTxO the pending transaction
 * just spent. The others stay open, so a wait never locks the whole wallet. An
 * unrecognised label waits.
 */
export function walletStateBlocksAction(get: Getter, action: string): boolean {
  const unit = get(routeStateAtom).selectedWalletUnit;
  const submissions = get(walletStateSubmissionsAtom);
  const signing = unit ? Boolean(submissions[unit]) : Object.values(submissions).some(Boolean);
  return signing ||
    (get(pendingWalletStateUpdateAtom) !== null && !isWalletStateIndependentAction(action));
}

export const selectedActionWaitsForWalletStateAtom = atom(get =>
  walletStateBlocksAction(get, get(selectedActionAtom)));

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

// Undoes `beginWalletStateUpdateAtom` for a submission the server refused before any
// broadcast. Only the record this submission wrote goes: another tab may have stored a
// newer one for the same wallet since, and that one still guards a live broadcast.
export const discardWalletStateUpdateAtom = atom(
  null,
  (get, set, pending: Pick<PendingWalletStateUpdate, "walletUnit" | "submittedTxHash">) => {
    const latest = readPendingUpdatesOr(get(pendingWalletStateUpdatesAtom));
    if (latest[pending.walletUnit]?.submittedTxHash !== pending.submittedTxHash) return;
    set(writePendingWalletRecordAtom, { unit: pending.walletUnit, pending: null });
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
    const latest = readStoredPendingUpdates() ?? get(pendingWalletStateUpdatesAtom);
    const current = latest[payload.pending.walletUnit];
    if (!current ||
      (!payload.expired && sameRef(payload.replacementRef.txHash, String(payload.replacementRef.outputIndex), current.spentRef)) ||
      current.walletUnit !== payload.pending.walletUnit ||
      current.submittedTxHash !== payload.pending.submittedTxHash ||
      !sameRef(current.spentRef.txHash, String(current.spentRef.outputIndex), payload.pending.spentRef)) {
      return false;
    }

    set(writePendingWalletRecordAtom, { unit: current.walletUnit, pending: null });
    for (const [hashAtom, indexAtom] of DRAFT_REF_PAIRS) {
      if (sameRef(get(hashAtom), get(indexAtom), current.spentRef)) {
        set(hashAtom, payload.replacementRef.txHash);
        set(indexAtom, String(payload.replacementRef.outputIndex));
      }
    }
    return true;
  }
);
