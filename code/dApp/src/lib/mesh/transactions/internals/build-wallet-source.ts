import type { WalletSource } from "@/lib/mesh/tx-context";

function reuseRead<Value>(read: () => Promise<Value>) {
  let pending: Promise<Value> | undefined;
  return async (): Promise<Value> => {
    pending ??= Promise.resolve().then(() => read()).then(
      (value) => structuredClone(value),
      (error: unknown) => {
        pending = undefined;
        throw error;
      }
    );
    return structuredClone(await pending);
  };
}

export function createBuildWalletSource(wallet: WalletSource): WalletSource {
  return {
    getUtxos: reuseRead(() => wallet.getUtxos()),
    getChangeAddress: reuseRead(() => wallet.getChangeAddress()),
    getUsedAddresses: reuseRead(() => wallet.getUsedAddresses()),
    getUnusedAddresses: reuseRead(() => wallet.getUnusedAddresses())
  };
}
