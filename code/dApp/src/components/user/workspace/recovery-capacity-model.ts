import type { Store } from "jotai/vanilla/store";
import { classifyTransactionCapacityFailure } from "@/lib/mesh/transaction-capacity";
import { recoveryCapacityFailureAtom, recoveryCapacitySignatureAtom } from "./atoms/recovery-capacity.atoms";
import { selectedActionAtom } from "./atoms/workspace-selection.atoms";

export function recordRecoveryCapacityFailure(store: Store, failedAction: string, error: unknown, startedSignature: string) {
  const kind = classifyTransactionCapacityFailure(error);
  if (failedAction !== "exit-beneficiary" || store.get(selectedActionAtom) !== "exit-beneficiary" || !kind || store.get(recoveryCapacitySignatureAtom) !== startedSignature) return;
  store.set(recoveryCapacityFailureAtom, { kind, signature: startedSignature });
}
