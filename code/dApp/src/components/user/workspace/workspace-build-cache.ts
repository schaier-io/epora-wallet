import { atom, type createStore } from "jotai";
import { SLOT_CONFIG_NETWORK, slotToBeginUnixTime } from "@meshsdk/core";
import { deserializeTx } from "@/lib/mesh/cst";
import { abortable } from "@/lib/mesh/build-cancellation";
import type { BuildResult } from "@/lib/types/contracts";
import { activePaymentKeyHashAtom } from "@/providers/wallet.atoms";
import { resolveWorkspaceTransactionInputs } from "./workspace-transaction-inputs";
import { safeStringify } from "./helpers";
import { activeInferredSttStateFormAtom } from "./queries/wallet-identity.atoms";
import { selectedDetectedTokenAtom } from "./queries/token-identity.atoms";
import { selectedActionAtom } from "./atoms/workspace-selection.atoms";
import { spendableWalletUtxosAtom } from "./atoms/workspace-spendable-utxos.atoms";
import { walletStateUpdatingAtom } from "./atoms/wallet-state-update.atoms";
import { activeBuildAtom, buildErrorStaleInputsAtom, buildRunAtom, previewSignatureAtom, submitHashAtom, workspaceSessionAtom } from "./atoms/transaction-flow.atoms";

type Store = ReturnType<typeof createStore>;
type BuildRecord = {
  key: string;
  promise: Promise<BuildResult | null>;
  result?: BuildResult;
  isCurrent: () => boolean;
  cancel: () => void;
};

const buildRecordAtom = atom<BuildRecord | null>(null);
export const workspaceBuildIdentityAtom = atom(get => {
  const inputs = resolveWorkspaceTransactionInputs({ get });
  const selectedToken = get(selectedDetectedTokenAtom);
  const action = get(selectedActionAtom);
  const selectedRefs = [...inputs.sttWalletInputs, ...inputs.consolidateWalletInputs];
  return safeStringify({
    inputs,
    action,
    paymentKeyHash: get(activePaymentKeyHashAtom),
    state: get(activeInferredSttStateFormAtom),
    token: selectedToken && { unit: selectedToken.unit, datum: selectedToken.datum, utxo: selectedToken.utxo },
    // Removing beneficiary access reviews omitted pools as well as selected inputs.
    fundPools: get(spendableWalletUtxosAtom).filter(utxo => action === "use-beneficiary" || selectedRefs.some(ref =>
      ref.txHash === utxo.input.txHash && ref.outputIndex === utxo.input.outputIndex))
  });
});

function validityEndTime(result: BuildResult): number | null {
  try {
    const ttl = deserializeTx(result.txHex).body().ttl();
    if (ttl === undefined) return null;
    const slot = Number(ttl);
    return Number.isSafeInteger(slot) ? slotToBeginUnixTime(slot, SLOT_CONFIG_NETWORK.preprod) : null;
  } catch {
    return null;
  }
}

export function isWorkspaceBuildResultExpired(result: BuildResult): boolean {
  const expires = validityEndTime(result);
  return expires !== null && expires <= Date.now();
}

/** Share one build per store, and retire it as soon as its transaction inputs change. */
export function runWorkspaceBuild(
  store: Store,
  key: string,
  run: (signal: AbortSignal) => Promise<BuildResult | null>
): Promise<BuildResult | null> {
  const previous = store.get(buildRecordAtom);
  if (previous?.key === key && previous.isCurrent() &&
      (!previous.result || (validityEndTime(previous.result) ?? 0) > Date.now())) {
    return previous.promise;
  }
  previous?.cancel();
  store.set(previewSignatureAtom, null);
  const token = store.get(buildRunAtom) + 1;
  store.set(buildRunAtom, token);
  const inputs = store.get(workspaceBuildIdentityAtom);
  const session = store.get(workspaceSessionAtom);
  const submittedHash = store.get(submitHashAtom);
  const controller = new AbortController();
  let staleErrorCleared = !store.get(buildErrorStaleInputsAtom);
  const hasNewStaleInputError = () => {
    if (!store.get(buildErrorStaleInputsAtom)) staleErrorCleared = true;
    return staleErrorCleared && store.get(buildErrorStaleInputsAtom);
  };
  const unsubscribe: Array<() => void> = [];
  const release = () => unsubscribe.splice(0).forEach(stop => stop());
  const record: BuildRecord = {
    key,
    promise: Promise.resolve(null),
    isCurrent: () => !hasNewStaleInputError() && !controller.signal.aborted && store.get(buildRecordAtom) === record &&
      store.get(workspaceBuildIdentityAtom) === inputs && store.get(workspaceSessionAtom) === session &&
      store.get(buildRunAtom) === token && !store.get(walletStateUpdatingAtom) &&
      (store.get(submitHashAtom) === submittedHash || store.get(submitHashAtom) === null),
    cancel: () => {
      release();
      if (store.get(buildRecordAtom) === record) {
        store.set(buildRecordAtom, null);
        store.set(buildRunAtom, value => value + 1);
        store.set(activeBuildAtom, null);
        store.set(previewSignatureAtom, null);
      }
      controller.abort();
    }
  };
  const invalidate = () => {
    if (!record.isCurrent()) record.cancel();
  };
  store.set(buildRecordAtom, record);
  for (const watched of [workspaceBuildIdentityAtom, workspaceSessionAtom, buildRunAtom, walletStateUpdatingAtom, submitHashAtom, buildErrorStaleInputsAtom]) {
    unsubscribe.push(store.sub(watched, invalidate));
  }
  // Install ownership and subscriptions before the builder can synchronously change state.
  let resolvePromise!: (result: BuildResult | null) => void;
  let rejectPromise!: (error: unknown) => void;
  record.promise = new Promise((resolve, reject) => { resolvePromise = resolve; rejectPromise = reject; });
  invalidate();
  void abortable(controller.signal, () => run(controller.signal))
    .then(result => {
      if (!record.isCurrent() || (result && isWorkspaceBuildResultExpired(result))) {
        record.cancel();
        return null;
      }
      if (result) record.result = result;
      else record.cancel();
      return result;
    }, error => {
      const canceled = controller.signal.aborted;
      record.cancel();
      if (canceled) return null;
      throw error;
    }).then(resolvePromise, rejectPromise);
  return record.promise;
}
