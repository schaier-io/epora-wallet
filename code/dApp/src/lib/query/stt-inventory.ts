import { QueryObserver, isCancelledError, queryOptions, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { detectSttInfo, type DetectedSttInfo } from "@/lib/mesh/detection";
import { queryKeys, queryPolicy } from "./keys";

export type SttInventorySnapshot = DetectedSttInfo & {
  /** A targeted read never establishes full inventory coverage. */
  fullScanAt: number | null;
  inventoryRead: { kind: "full" | "targeted"; revision: number };
};

// Only ordering metadata lives outside Query. Query GC also releases each attempt's metadata.
const revisions = new WeakMap<QueryClient, number>();
const attempts = new WeakMap<object, number>();
const MAX_ASSET_NAME_HEX_LENGTH = 64;
export const getSttInventoryReadRevision = (client: QueryClient): number => revisions.get(client) ?? 0;

function startRead(client: QueryClient, key: QueryKey): number {
  const revision = getSttInventoryReadRevision(client) + 1;
  revisions.set(client, revision);
  const query = client.getQueryCache().find({ queryKey: key, exact: true });
  if (query) attempts.set(query, revision);
  return revision;
}

function isLatestRead(client: QueryClient, policyId: string, revision: number, unit?: string): boolean {
  return !client.getQueryCache().findAll({ queryKey: queryKeys.chain }).some((query) => {
    const [, , kind, policy, walletUnit] = query.queryKey;
    if (policy !== policyId || (kind !== "stt-inventory" && kind !== "stt-wallet")) return false;
    return (unit === undefined || kind === "stt-inventory" || walletUnit === unit) &&
      (attempts.get(query) ?? 0) > revision;
  });
}

export function isCurrentSttInventoryRead(client: QueryClient, policyId: string, revision: number): boolean {
  return isLatestRead(client, policyId, revision);
}

function holdFullRead(client: QueryClient, queryKey: QueryKey, signal: AbortSignal): void {
  const query = client.getQueryCache().find({ queryKey, exact: true });
  if (!query) return;
  const observer = new QueryObserver(client, { ...query.options, queryKey, enabled: false });
  let unsubscribe = () => {};
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    signal.removeEventListener("abort", release);
    unsubscribe();
  };
  unsubscribe = observer.subscribe((result) => {
    if (result.fetchStatus === "idle") release();
  });
  signal.addEventListener("abort", release, { once: true });
}

function assertPolicy(detected: DetectedSttInfo, policyId: string): void {
  if (detected.policyId !== policyId) throw new Error("The detected wallet inventory belongs to a different STT policy.");
}

export function sttInventoryQueryOptions(policyId: string) {
  const queryKey = queryKeys.sttInventory(policyId);
  return queryOptions({
    queryKey,
    queryFn: async ({ client, signal }): Promise<SttInventorySnapshot> => {
      const revision = startRead(client, queryKey);
      // An imperative join is not an observer. Keep the shared read alive across
      // navigation; explicit refresh/cancellation still aborts the request.
      holdFullRead(client, queryKey, signal);
      const detected = await detectSttInfo(undefined, signal);
      signal.throwIfAborted();
      if (!isLatestRead(client, policyId, revision)) {
        await client.cancelQueries({ queryKey, exact: true });
        signal.throwIfAborted();
      }
      assertPolicy(detected, policyId);
      return { ...detected, fullScanAt: Date.now(), inventoryRead: { kind: "full", revision } };
    },
    staleTime: (query) => query.state.data?.fullScanAt === null ? 0 : queryPolicy.chainStaleMs,
    gcTime: queryPolicy.chainGcMs
  });
}

export function sttWalletQueryOptions(policyId: string, unit: string, client: QueryClient, force = false) {
  const queryKey = queryKeys.sttWallet(policyId, unit);
  const fullKey = queryKeys.sttInventory(policyId);
  return queryOptions({
    queryKey,
    queryFn: async ({ signal }): Promise<DetectedSttInfo> => {
      if (!unit.startsWith(policyId) || !/^[0-9a-f]+$/i.test(unit) ||
        unit.length <= policyId.length || unit.length > policyId.length + MAX_ASSET_NAME_HEX_LENGTH || unit.length % 2 !== 0) {
        throw new Error("The requested wallet asset does not match the current STT policy.");
      }
      const previous = client.getQueryData<DetectedSttInfo>(queryKey);
      const full = client.getQueryState<SttInventorySnapshot>(fullKey);
      if (!force && (full?.fetchStatus === "fetching" ||
        (full?.data && full.data.fullScanAt !== null && !full.isInvalidated &&
          Date.now() - full.dataUpdatedAt < queryPolicy.chainStaleMs))) {
        let snapshot: SttInventorySnapshot | undefined;
        try {
          snapshot = await client.fetchQuery({
            ...sttInventoryQueryOptions(policyId),
            ...(full?.fetchStatus === "fetching" ? { staleTime: 0 } : {})
          });
        } catch (error) {
          if (!isCancelledError(error)) throw error;
        }
        signal.throwIfAborted();
        // Cancellation can resolve cached data. A partial snapshot cannot cover this read.
        if (snapshot && snapshot.fullScanAt !== null && !client.getQueryState(fullKey)?.isInvalidated &&
          isLatestRead(client, policyId, snapshot.inventoryRead?.revision ?? 0)) {
          const tokens = snapshot.tokens.filter((token) => token.unit === unit);
          if (tokens.length) {
            return { ...snapshot, tokens, sttUtxos: tokens.map((token) => token.utxo) };
          }
        }
      }
      const revision = startRead(client, queryKey);
      await client.cancelQueries({ queryKey: fullKey, exact: true });
      signal.throwIfAborted();
      const inventory = client.getQueryData<SttInventorySnapshot>(fullKey);
      const next = await detectSttInfo(unit, signal);
      signal.throwIfAborted();
      if (!isLatestRead(client, policyId, revision, unit)) {
        await client.cancelQueries({ queryKey, exact: true });
        signal.throwIfAborted();
      }
      assertPolicy(next, policyId);
      if ((previous?.tokens.length || inventory?.tokens.some((token) => token.unit === unit)) && !next.tokens.length) {
        throw new Error("State token not indexed yet");
      }
      const before = client.getQueryState<SttInventorySnapshot>(fullKey);
      const tokens = [
        ...(before?.data?.tokens ?? []).filter((token) => token.unit !== unit),
        ...next.tokens.filter((token) => token.unit === unit)
      ];
      signal.throwIfAborted();
      client.setQueryData<SttInventorySnapshot>(fullKey, {
        ...next, tokens, sttUtxos: tokens.map((token) => token.utxo),
        fullScanAt: before?.data?.fullScanAt ?? null,
        inventoryRead: { kind: "targeted", revision }
      }, { updatedAt: before?.dataUpdatedAt ?? 0 });
      const projected = client.getQueryCache().find({ queryKey: fullKey, exact: true });
      // setQueryData clears invalidation and errors. A partial update cannot repair
      // a failed or invalidated full scan, even when its timestamp is preserved.
      if (before?.isInvalidated) projected?.invalidate();
      if (before?.error) projected?.setState({ error: before.error, errorUpdatedAt: before.errorUpdatedAt, status: "error" });
      return next;
    },
    staleTime: queryPolicy.chainStaleMs,
    gcTime: queryPolicy.chainGcMs
  });
}
