import type { TxFetcher, WalletSource } from "@/lib/mesh/tx-context";
import { createBuildWalletSource } from "./build-wallet-source";

const buildWallets = new WeakMap<TxFetcher, WeakMap<WalletSource, WalletSource>>();

export function resolveBuildWalletSource(fetcher: TxFetcher, wallet: WalletSource): WalletSource {
  const wallets = buildWallets.get(fetcher);
  if (!wallets) return wallet;
  let source = wallets.get(wallet);
  if (!source) {
    source = createBuildWalletSource(wallet);
    wallets.set(wallet, source);
  }
  return source;
}

function reuseLatest<T>(
  read: (epoch?: number) => Promise<T>,
  canReuse: (value: T) => boolean = () => true
) {
  let latest: Promise<T> | undefined;

  return async (epoch?: number): Promise<T> => {
    if (epoch !== undefined) return read(epoch);

    latest ??= Promise.resolve().then(() => read()).then(
      (value) => {
        if (!canReuse(value)) latest = undefined;
        return structuredClone(value);
      },
      (error: unknown) => {
        latest = undefined;
        throw error;
      }
    );
    return structuredClone(await latest);
  };
}

// Draft and final passes discover the same address funds. Share each address read
// so both passes see one snapshot. Failed reads are dropped so a later pass retries.
function reuseAddressReads(read: TxFetcher["fetchAddressUTxOs"]): TxFetcher["fetchAddressUTxOs"] {
  const reads = new Map<string, ReturnType<TxFetcher["fetchAddressUTxOs"]>>();
  return async (address, asset) => {
    const key = `${address}\u0000${asset ?? ""}`;
    let pending = reads.get(key);
    if (!pending) {
      pending = Promise.resolve().then(() => read(address, asset));
      reads.set(key, pending);
      pending.catch(() => reads.delete(key));
    }
    return structuredClone(await pending);
  };
}

// One wrapper per build shares parameter, address and wallet reads across passes.
// Provider input checks and evaluation always reach the original provider.
export function createBuildParameterFetcher(fetcher: TxFetcher): TxFetcher {
  const fetchProtocolParameters = reuseLatest(
    (epoch) => fetcher.fetchProtocolParameters(epoch)
  );
  const fetchCostModels = reuseLatest(
    (epoch) => fetcher.fetchCostModels(epoch),
    // Mesh falls back to defaults for invalid results. Let the next pass retry.
    (value) => Array.isArray(value) && value.length > 0
  );

  const fetchAddressUTxOs = reuseAddressReads((address, asset) => fetcher.fetchAddressUTxOs(address, asset));

  const scoped = new Proxy(fetcher, {
    get(target, property) {
      if (property === "fetchAddressUTxOs") return fetchAddressUTxOs;
      if (property === "fetchProtocolParameters") return fetchProtocolParameters;
      if (property === "fetchCostModels") return fetchCostModels;
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === "function"
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    }
  });
  buildWallets.set(scoped, new WeakMap());
  return scoped;
}
