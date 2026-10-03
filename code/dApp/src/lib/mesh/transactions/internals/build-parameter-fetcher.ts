import { ServerFetcher } from "@/lib/mesh/server-fetcher";
import type { TxFetcher, WalletSource } from "@/lib/mesh/tx-context";
import { createBuildWalletSource } from "./build-wallet-source";
import { readImmutableInputMetadata } from "./immutable-input-cache";

export const LATEST_PROTOCOL_PARAMETERS_PATH = "epochs/latest/parameters";

const buildPasses = new WeakMap<TxFetcher, () => void>();

export function beginBuildPass(fetcher: TxFetcher) {
  buildPasses.get(fetcher)?.();
}

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
function reuseReads<Args extends unknown[], Value>(
  read: (...args: Args) => Promise<Value>,
  keyFor: (...args: Args) => string
) {
  const reads = new Map<string, Promise<Value>>();
  return async (...args: Args): Promise<Value> => {
    const key = keyFor(...args);
    let pending = reads.get(key);
    if (!pending) {
      pending = Promise.resolve().then(() => read(...args));
      reads.set(key, pending);
      pending.catch(() => reads.delete(key));
    }
    return structuredClone(await pending);
  };
}

// One wrapper per build shares parameter, address and wallet reads across passes.
// Input metadata is immutable. Status reads are shared only within one pass.
export function createBuildParameterFetcher(fetcher: TxFetcher): TxFetcher {
  const fetchProtocolParameters = reuseLatest(
    (epoch) => fetcher.fetchProtocolParameters(epoch)
  );
  const fetchCostModels = reuseLatest(
    (epoch) => fetcher.fetchCostModels(epoch),
    // Mesh falls back to defaults for invalid results. Let the next pass retry.
    (value) => Array.isArray(value) && value.length > 0
  );

  const fetchAddressUTxOs = reuseReads(
    (address: string, asset?: string) => fetcher.fetchAddressUTxOs(address, asset),
    (address, asset) => JSON.stringify([address, asset])
  );
  const cachedUTxOs = reuseReads(
    (hash: string, index?: number) => readImmutableInputMetadata(fetcher, hash, index),
    (hash, index) => JSON.stringify([hash.toLowerCase(), index])
  );
  const fetchUTxOs = async (hash: string, index?: number) => {
    fetcher.signal?.throwIfAborted();
    const value = await cachedUTxOs(hash, index);
    fetcher.signal?.throwIfAborted();
    return value;
  };
  const fetchRawParameters = reuseLatest(() => fetcher instanceof ServerFetcher
    ? fetcher.get(LATEST_PROTOCOL_PARAMETERS_PATH, true) : fetcher.get(LATEST_PROTOCOL_PARAMETERS_PATH));
  let statusReads = new Map<string, Promise<unknown>>();
  const get = (path: string) => {
    if (path === LATEST_PROTOCOL_PARAMETERS_PATH) return fetchRawParameters();
    if (!/^txs\/[a-fA-F0-9]{64}\/utxos$/.test(path)) return fetcher.get(path);
    const key = path.toLowerCase();
    const pass = statusReads;
    let pending = pass.get(key);
    if (!pending) {
      pending = Promise.resolve().then(() => fetcher.get(path));
      pass.set(key, pending);
      pending.catch(() => { if (pass.get(key) === pending) pass.delete(key); });
    }
    return pending.then(value => structuredClone(value));
  };

  const scoped = new Proxy(fetcher, {
    get(target, property) {
      if (property === "fetchAddressUTxOs") return fetchAddressUTxOs;
      if (property === "fetchUTxOs") return fetchUTxOs;
      if (property === "fetchProtocolParameters") return fetchProtocolParameters;
      if (property === "fetchCostModels") return fetchCostModels;
      if (property === "get") return get;
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === "function"
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    }
  });
  buildPasses.set(scoped, () => { statusReads = new Map(); });
  buildWallets.set(scoped, new WeakMap());
  return scoped;
}
