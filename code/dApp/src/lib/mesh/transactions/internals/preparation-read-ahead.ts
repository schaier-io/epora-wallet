import type { WalletInputRef } from "@/lib/types/contracts";
import type { TxFetcher } from "@/lib/mesh/tx-context";
import { abortable } from "@/lib/mesh/build-cancellation";
import { parseReferenceUtxoConfig } from "./reference-utxo-config";

/** Retain early read results, including failures, until this preparation pass consumes them. */
export function createPreparationReadAhead(fetcher: TxFetcher) {
  function retainRead<Args extends unknown[], Value>(
    read: (...args: Args) => Promise<Value>,
    keyFor: (...args: Args) => string
  ) {
    const reads = new Map<string, Promise<Value>>();
    return async (...args: Args): Promise<Value> => {
      fetcher.signal?.throwIfAborted();
      const key = keyFor(...args);
      let pending = reads.get(key);
      if (!pending) {
        pending = Promise.resolve().then(() => read(...args));
        reads.set(key, pending);
        // Consumers report errors at their existing validation stage, with full diagnostics.
        void pending.catch(() => undefined);
      }
      const value = await abortable(fetcher.signal, () => pending!);
      fetcher.signal?.throwIfAborted();
      return structuredClone(value);
    };
  }

  const fetchUTxOs = retainRead(
    (hash: string, index?: number) => fetcher.fetchUTxOs(hash, index),
    (hash, index) => JSON.stringify([hash, index])
  );
  const get = retainRead((path: string) => fetcher.get(path), path => path);
  const scoped = new Proxy(fetcher, {
    get(target, property) {
      if (property === "fetchUTxOs") return fetchUTxOs;
      if (property === "get") return get;
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === "function"
        ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    }
  });

  function prefetchInput(ref: { txHash: string; outputIndex?: number }) {
    // Invalid locators still fail at their original validator, before a provider request.
    if (!/^[a-fA-F0-9]{64}$/.test(ref.txHash) ||
      (ref.outputIndex !== undefined && (!Number.isSafeInteger(ref.outputIndex) || ref.outputIndex < 0))) return;
    void fetchUTxOs(ref.txHash, ref.outputIndex).catch(() => undefined);
    void get(`txs/${ref.txHash}/utxos`).catch(() => undefined);
  }

  function prefetchReference(configuredReference: string | undefined) {
    let ref: WalletInputRef | null;
    try {
      ref = parseReferenceUtxoConfig(configuredReference, "Reference script UTxO");
    } catch {
      // Preserve validation order and the caller's original error label.
      return;
    }
    // An undefined reference can use saved storage. Read it at the existing consume point.
    if (ref) prefetchInput(ref);
  }

  return { fetcher: scoped, prefetchInput, prefetchReference };
}
