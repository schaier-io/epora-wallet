import { atom } from "jotai";
import { queryClientAtom } from "jotai-tanstack-query";
import { getSttInventoryReadRevision } from "@/lib/query/stt-inventory";

type PendingInputDetails = {
  policyId: string;
  stateInput: string;
  streamKey: string;
  action: "collect" | "shorten";
};

type PendingInputAction = PendingInputDetails & (
  | { phase: "building" }
  | { phase: "submitted"; txHash: string; submittedAfterRevision: number; validUntilMs: number }
);

// The scan time is stamped when the read finishes and the indexer can trail the chain tip, so
// a scan only proves a dropped transaction can no longer land once it is this far past the
// window. The margin also absorbs modest clock skew between this browser and the chain.
export const SUBMITTED_INPUT_EXPIRY_GRACE_MS = 5 * 60_000;

export function payeePendingInputKey(policyId: string, stateInput: string): string {
  return `${policyId}:${stateInput}`;
}

// The input remains reserved while its transaction outlives the page that started it.
export const pendingPayeeInputActionsAtom = atom<Record<string, PendingInputAction>>({});

export const beginPayeeInputActionAtom = atom(null, (get, set, details: PendingInputDetails) => {
  const key = payeePendingInputKey(details.policyId, details.stateInput);
  const current = get(pendingPayeeInputActionsAtom);
  if (current[key]) return false;
  set(pendingPayeeInputActionsAtom, {
    ...current,
    [key]: { ...details, phase: "building" }
  });
  return true;
});

export const markPayeeInputSubmittedAtom = atom(
  null,
  (get, set, { key, txHash, validUntilMs }: { key: string; txHash: string; validUntilMs: number }) => {
    const current = get(pendingPayeeInputActionsAtom);
    if (!current[key]) return;
    set(pendingPayeeInputActionsAtom, {
      ...current,
      [key]: { ...current[key], phase: "submitted", txHash, validUntilMs, submittedAfterRevision: getSttInventoryReadRevision(get(queryClientAtom)) }
    });
  }
);

export const releasePayeeInputActionAtom = atom(null, (get, set, key: string) => {
  const current = get(pendingPayeeInputActionsAtom);
  if (!current[key]) return;
  const next = { ...current };
  delete next[key];
  set(pendingPayeeInputActionsAtom, next);
});

/**
 * Only call after adopting a successful full scan of this policy. A submitted input is freed
 * when the scan no longer holds it, or when it still holds it after the transaction's validity
 * window closed: a dropped transaction never spends it, and nothing else would free the row.
 */
export const reconcilePayeeInputsAtom = atom(
  null,
  (get, set, { policyId, inputKeys, fullReadRevision, scannedAtMs }: {
    policyId: string; inputKeys: ReadonlySet<string>; fullReadRevision: number; scannedAtMs: number;
  }) => {
    const current = get(pendingPayeeInputActionsAtom);
    const next = { ...current };
    let changed = false;
    for (const [key, pending] of Object.entries(current)) {
      if (pending.policyId === policyId && pending.phase === "submitted" &&
          fullReadRevision > pending.submittedAfterRevision &&
          (!inputKeys.has(pending.stateInput) ||
            scannedAtMs >= pending.validUntilMs + SUBMITTED_INPUT_EXPIRY_GRACE_MS)) {
        delete next[key];
        changed = true;
      }
    }
    if (changed) set(pendingPayeeInputActionsAtom, next);
  }
);
