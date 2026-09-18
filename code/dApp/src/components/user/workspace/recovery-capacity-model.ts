import type { createStore } from "jotai/vanilla";
import { classifyTransactionCapacityFailure } from "@/lib/mesh/transaction-capacity";
import { recoveryCapacityFailureAtom, recoveryCapacitySignatureAtom } from "./atoms/recovery-capacity.atoms";
import { selectedActionAtom } from "./atoms/workspace-selection.atoms";

// jotai v3 no longer exports the `Store` type from a public entry point, so it
// is derived from the factory like in src/test/query-client.tsx.
type Store = ReturnType<typeof createStore>;

export function recordRecoveryCapacityFailure(store: Store, failedAction: string, error: unknown, startedSignature: string) {
  const kind = classifyTransactionCapacityFailure(error);
  if (failedAction !== "use-beneficiary" || store.get(selectedActionAtom) !== "use-beneficiary" || !kind || store.get(recoveryCapacitySignatureAtom) !== startedSignature) return;
  store.set(recoveryCapacityFailureAtom, { kind, signature: startedSignature });
}
