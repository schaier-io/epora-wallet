import { parseBuildParameters, protocolFromBuildParameters } from "@/lib/mesh/protocol-parameter-cache";
import { ServerFetcher } from "@/lib/mesh/server-fetcher";
import type { TxFetcher, WalletSource } from "@/lib/mesh/tx-context";
import { createBuildWalletSource } from "./build-wallet-source";
import { readImmutableInputMetadata } from "./immutable-input-cache";
import { evaluateDraftLocally } from "./local-draft-evaluation";

export const LATEST_PROTOCOL_PARAMETERS_PATH = "epochs/latest/parameters";
// Bound retained CBOR and evaluation context while exploring funding candidates.
export const MAX_CACHED_EVALUATIONS_PER_PASS = 64;

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
  const fetchRawParameters = fetcher.fetchBuildParameters
    ? reuseLatest(async () => parseBuildParameters(await fetcher.fetchBuildParameters!()))
    : reuseLatest(() => fetcher instanceof ServerFetcher
      ? fetcher.get(LATEST_PROTOCOL_PARAMETERS_PATH, true) : fetcher.get(LATEST_PROTOCOL_PARAMETERS_PATH));
  const fetchProtocolParameters = reuseLatest(
    async (epoch) => epoch !== undefined || !fetcher.fetchBuildParameters
      ? fetcher.fetchProtocolParameters(epoch)
      : protocolFromBuildParameters(parseBuildParameters(await fetchRawParameters()))
  );
  const fetchCostModels = reuseLatest(
    async (epoch) => {
      if (epoch !== undefined || !fetcher.fetchBuildParameters) return fetcher.fetchCostModels(epoch);
      const raw = parseBuildParameters(await fetchRawParameters());
      return [raw.cost_models_raw.PlutusV1, raw.cost_models_raw.PlutusV2, raw.cost_models_raw.PlutusV3];
    },
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
  let statusReads = new Map<string, Promise<unknown>>();
  let finalPass = false;
  // Reuse exact evaluation candidates in this pass. A final pass
  // always starts a new remote evaluation, even when its draft bytes match.
  let evaluations = new Map<string, ReturnType<TxFetcher["evaluateTx"]>>();
  const evaluateTx: TxFetcher["evaluateTx"] = async (tx, utxos, chained) => {
    fetcher.signal?.throwIfAborted();
    const [inputSnapshot, chainedSnapshot] = structuredClone([utxos, chained] as const);
    const key = JSON.stringify([tx, inputSnapshot, chainedSnapshot]);
    const pass = evaluations;
    let pending = pass.get(key);
    if (!pending) {
      const phase = finalPass ? "final" : "draft";
      pending = (async () => {
        let fallbackReason: string | undefined;
        if (phase === "draft" && fetcher instanceof ServerFetcher && typeof Worker !== "undefined" && !chainedSnapshot?.length) {
          const started = performance.now();
          try {
            const actions = await evaluateDraftLocally(scoped, tx, inputSnapshot);
            fetcher.signal?.throwIfAborted();
            console.debug("[tx-build:evaluation]", { phase, source: "local", outcome: "success", durationMs: performance.now() - started });
            return actions;
          } catch (error) {
            // Provider errors can contain transaction data. Only fixed reason codes leave this boundary.
            fallbackReason = fetcher.signal?.aborted ? "aborted"
              : error instanceof Error && error.message === "Local evaluation timed out." ? "timeout" : "evaluation-error";
            console.debug("[tx-build:evaluation]", {
              phase, source: "local", outcome: fallbackReason === "aborted" ? "cancelled" : "fallback",
              reason: fallbackReason, durationMs: performance.now() - started
            });
            fetcher.signal?.throwIfAborted();
          }
        }
        const startedAt = performance.now();
        try {
          const actions = await fetcher.evaluateTx(tx, inputSnapshot, chainedSnapshot);
          fetcher.signal?.throwIfAborted();
          console.debug("[tx-build:evaluation]", { phase, source: "remote", outcome: "success", fallbackReason, durationMs: performance.now() - startedAt });
          return actions;
        } catch (error) {
          console.debug("[tx-build:evaluation]", { phase, source: "remote", outcome: fetcher.signal?.aborted ? "cancelled" : "failed", fallbackReason, durationMs: performance.now() - startedAt });
          throw error;
        }
      })().then(actions => {
        fetcher.signal?.throwIfAborted();
        return structuredClone(actions);
      });
      pass.set(key, pending);
      if (pass.size > MAX_CACHED_EVALUATIONS_PER_PASS) pass.delete(pass.keys().next().value!);
      pending.catch(() => { if (pass.get(key) === pending) pass.delete(key); });
    }
    const actions = await pending;
    fetcher.signal?.throwIfAborted();
    return structuredClone(actions);
  };
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
      if (property === "evaluateTx") return evaluateTx;
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === "function"
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    }
  });
  buildPasses.set(scoped, () => { statusReads = new Map(); evaluations = new Map(); finalPass = true; });
  buildWallets.set(scoped, new WeakMap());
  return scoped;
}
