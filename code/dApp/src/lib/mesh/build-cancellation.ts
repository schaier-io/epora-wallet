import type { WalletSource } from "./tx-context";

// Native wallet promises cannot be interrupted. Reject the caller immediately,
// consume any late result, and guard the next wallet read.
export async function abortable<T>(
  signal: AbortSignal | undefined,
  run: () => Promise<T>
): Promise<T> {
  signal?.throwIfAborted();
  if (!signal) return run();
  let onAbort: () => void = () => {};
  const canceled = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    // The executor starts work now and converts synchronous throws to rejection.
    const operation = new Promise<T>((resolve) => resolve(run()));
    const result = await Promise.race([operation, canceled]);
    signal.throwIfAborted();
    return result;
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

export function createAbortableWalletSource(
  wallet: WalletSource,
  signal: AbortSignal
): WalletSource {
  return {
    getUtxos: (...args) => abortable(signal, () => wallet.getUtxos(...args)),
    getChangeAddress: (...args) => abortable(signal, () => wallet.getChangeAddress(...args)),
    getUsedAddresses: (...args) => abortable(signal, () => wallet.getUsedAddresses(...args)),
    getUnusedAddresses: (...args) => abortable(signal, () => wallet.getUnusedAddresses(...args))
  };
}
