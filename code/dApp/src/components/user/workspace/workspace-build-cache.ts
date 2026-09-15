import { atom, type createStore } from "jotai";
import { SLOT_CONFIG_NETWORK, slotToBeginUnixTime } from "@meshsdk/core";
import { deserializeTx } from "@/lib/mesh/cst";
import { abortable } from "@/lib/mesh/build-cancellation";
import type { BuildResult } from "@/lib/types/contracts";
import { workspaceTransactionSnapshotAtom } from "./workspace-prepared-transaction";
import { walletStateUpdatingAtom } from "./atoms/wallet-state-update.atoms";
import { activeBuildAtom, buildErrorStaleInputsAtom, buildRunAtom, previewSignatureAtom, submitHashAtom, workspaceSessionAtom } from "./atoms/transaction-flow.atoms";

type Store = ReturnType<typeof createStore>;
type BuildRecord = {
  key: string;
  promise: Promise<BuildResult | null>;
  isCurrent: () => boolean;
  cancel: () => void;
};

const buildRecordAtom = atom<BuildRecord | null>(null);
export const workspaceBuildIdentityAtom = workspaceTransactionSnapshotAtom;

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

/** Share one pending build per store, and cancel it as soon as its inputs change. */
export function runWorkspaceBuild(
  store: Store,
  key: string,
  run: (signal: AbortSignal) => Promise<BuildResult | null>
): Promise<BuildResult | null> {
  const previous = store.get(buildRecordAtom);
  if (previous?.key === key && previous.isCurrent()) {
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
      if (result) {
        // The prepared transaction atom owns completed results and their freshness checks.
        release();
        if (store.get(buildRecordAtom) === record) store.set(buildRecordAtom, null);
      } else record.cancel();
      return result;
    }, error => {
      const canceled = controller.signal.aborted;
      record.cancel();
      if (canceled) return null;
      throw error;
    }).then(resolvePromise, rejectPromise);
  return record.promise;
}
