import { atom } from "jotai";
import { activeAddressAtom, networkIdAtom } from "@/providers/wallet.atoms";
import { stateFormFromDatum, type StateFormState } from "@/lib/contracts/state-form";
import type { DetectedSttToken } from "@/lib/mesh/detection";
import { cloneStateForm, withBeneficiarySigningAddressesDerived } from "../helpers/form-state";
import { sttStateFormAtom, updateStateFormAtom, sttInputTxHashAtom, sttInputOutputIndexAtom } from "./forms/stt-spend-form.atoms";
import { consolidateStateFormAtom, consolidateSttInputHashAtom, consolidateSttInputIndexAtom } from "./forms/consolidate-form.atoms";
import { withdrawSttStateFormAtom, withdrawSttInputHashAtom, withdrawSttInputIndexAtom } from "./forms/withdraw-form.atoms";
import { publishSttStateFormAtom, publishSttInputHashAtom, publishSttInputIndexAtom } from "./forms/publish-form.atoms";
import { voteSttStateFormAtom, voteSttInputHashAtom, voteSttInputIndexAtom } from "./forms/vote-form.atoms";
import { resetAllFormsAtom } from "./forms/reset-all-forms.atom";
import { resetConfigAtom } from "./workspace-config.atoms";
import { routeStateAtom } from "./workspace-route.atoms";

export const workspaceDraftOwnerAtom = atom<string | null>(null);
export const workspaceDraftIdentityAtom = atom(get => `${get(networkIdAtom)}:${get(activeAddressAtom) ?? ""}`);
export const workspaceDraftBaseAtom = atom<{ token: DetectedSttToken; state: StateFormState } | null>(null);
export const workspaceDraftConflictsAtom = atom<Record<string, string[]>>({});
export const selectedDraftConflictAtom = atom(get => {
  const action = get(routeStateAtom).selectedAction;
  return action ? get(workspaceDraftConflictsAtom)[action] ?? [] : [];
});

export const ensureWorkspaceDraftOwnerAtom = atom(null, (get, set) => {
  if (!get(activeAddressAtom)) return;
  const identity = get(workspaceDraftIdentityAtom);
  const owner = get(workspaceDraftOwnerAtom);
  if (owner !== null && owner !== identity) {
    set(resetAllFormsAtom);
    set(resetConfigAtom);
    set(workspaceDraftBaseAtom, null);
    set(workspaceDraftConflictsAtom, {});
  }
  set(workspaceDraftOwnerAtom, identity);
});

/** Rebase untouched fields; conflicting edits remain visible until their task is reloaded. */
export function reconcileStateDraft(base: StateFormState, draft: StateFormState, latest: StateFormState) {
  const merged = cloneStateForm(draft);
  const conflicts: string[] = [];
  for (const field of Object.keys(latest) as (keyof StateFormState)[]) {
    const before = JSON.stringify(base[field]);
    const edited = JSON.stringify(draft[field]);
    const after = JSON.stringify(latest[field]);
    if (edited === before || edited === after) {
      Object.assign(merged, { [field]: latest[field] });
    } else if (before !== after) {
      conflicts.push(field);
    }
  }
  return { merged, conflicts };
}

const FORM_ACTIONS = [
  [sttStateFormAtom, "manage-streaming-payments"],
  [consolidateStateFormAtom, "consolidate-utxo"],
  [withdrawSttStateFormAtom, "wallet-withdraw"],
  [publishSttStateFormAtom, "wallet-publish"],
  [voteSttStateFormAtom, "wallet-vote"]
] as const;
const REFS = [
  [sttInputTxHashAtom, sttInputOutputIndexAtom],
  [consolidateSttInputHashAtom, consolidateSttInputIndexAtom],
  [withdrawSttInputHashAtom, withdrawSttInputIndexAtom],
  [publishSttInputHashAtom, publishSttInputIndexAtom],
  [voteSttInputHashAtom, voteSttInputIndexAtom]
] as const;
export const reconcileWorkspaceWalletAtom = atom(null, (get, set, token: DetectedSttToken) => {
  const base = get(workspaceDraftBaseAtom);
  if (!base || base.token.unit !== token.unit || !token.datum) return;
  if (JSON.stringify(base.token) === JSON.stringify(token)) return;
  const latest = stateFormFromDatum(token.datum);
  const nextConflicts = { ...get(workspaceDraftConflictsAtom) };
  for (const [form, action] of FORM_ACTIONS) {
    const draft = get(form);
    if (!draft) continue;
    const baseline = base.state;
    const current = latest;
    const result = reconcileStateDraft(baseline, draft, current);
    set(form, result.merged);
    const retained = (nextConflicts[action] ?? []).filter(field =>
      JSON.stringify(result.merged[field as keyof StateFormState]) !== JSON.stringify(current[field as keyof StateFormState]));
    nextConflicts[action] = [...new Set([...retained, ...result.conflicts])];
  }
  const settings = get(updateStateFormAtom);
  if (settings) {
    const current = withBeneficiarySigningAddressesDerived(latest);
    const result = reconcileStateDraft(withBeneficiarySigningAddressesDerived(base.state), settings, current);
    set(updateStateFormAtom, result.merged);
    const retained = (nextConflicts["update-state"] ?? []).filter(field =>
      JSON.stringify(result.merged[field as keyof StateFormState]) !== JSON.stringify(current[field as keyof StateFormState]));
    nextConflicts["update-state"] = [...new Set([...retained, ...result.conflicts])];
  }
  for (const [hash, index] of REFS) {
    if (get(hash) === base.token.utxo.input.txHash && get(index) === String(base.token.utxo.input.outputIndex)) {
      set(hash, token.utxo.input.txHash);
      set(index, String(token.utxo.input.outputIndex));
    }
  }
  set(workspaceDraftConflictsAtom, nextConflicts);
  set(workspaceDraftBaseAtom, { token, state: latest });
});
