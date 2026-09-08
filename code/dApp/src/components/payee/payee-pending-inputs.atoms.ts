import { atom } from "jotai";

type PendingInputDetails = {
  policyId: string;
  stateInput: string;
  streamKey: string;
  action: "collect" | "shorten";
};

type PendingInputAction = PendingInputDetails & (
  | { phase: "building" }
  | { phase: "submitted"; txHash: string }
);

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
  (get, set, { key, txHash }: { key: string; txHash: string }) => {
    const current = get(pendingPayeeInputActionsAtom);
    if (!current[key]) return;
    set(pendingPayeeInputActionsAtom, {
      ...current,
      [key]: { ...current[key], phase: "submitted", txHash }
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

/** Only call after adopting a successful full scan of this policy. */
export const reconcilePayeeInputsAtom = atom(
  null,
  (get, set, { policyId, inputKeys }: { policyId: string; inputKeys: ReadonlySet<string> }) => {
    const current = get(pendingPayeeInputActionsAtom);
    const next = { ...current };
    let changed = false;
    for (const [key, pending] of Object.entries(current)) {
      if (pending.policyId === policyId && pending.phase === "submitted" &&
          !inputKeys.has(pending.stateInput)) {
        delete next[key];
        changed = true;
      }
    }
    if (changed) set(pendingPayeeInputActionsAtom, next);
  }
);
