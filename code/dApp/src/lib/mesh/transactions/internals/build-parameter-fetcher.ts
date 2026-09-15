import type { TxFetcher } from "@/lib/mesh/tx-context";

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

// One wrapper per build: only stable parameter reads are shared across passes.
// Input freshness checks and evaluation always reach the original provider.
export function createBuildParameterFetcher(fetcher: TxFetcher): TxFetcher {
  const fetchProtocolParameters = reuseLatest(
    (epoch) => fetcher.fetchProtocolParameters(epoch)
  );
  const fetchCostModels = reuseLatest(
    (epoch) => fetcher.fetchCostModels(epoch),
    // Mesh falls back to defaults for invalid results. Let the next pass retry.
    (value) => Array.isArray(value) && value.length > 0
  );

  return new Proxy(fetcher, {
    get(target, property) {
      if (property === "fetchProtocolParameters") return fetchProtocolParameters;
      if (property === "fetchCostModels") return fetchCostModels;
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === "function"
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    }
  });
}
