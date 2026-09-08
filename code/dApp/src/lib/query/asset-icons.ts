import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { ServerFetcher } from "@/lib/mesh/server-fetcher";
import { queryKeys, queryPolicy } from "./keys";

const MAX_EMBEDDED_ICON_DATA_URI_LENGTH = 512 * 1024;
const PNG_DATA_URI_PREFIX = "data:image/png;base64,";
const MAX_ICON_CACHE_ENTRIES = 2_000;
const MAX_ICON_CACHE_BYTES = 8 * 1024 * 1024;
const budgetedClients = new WeakSet<QueryClient>();

/** Bound retained Query payloads without evicting icons that are still on screen. */
function enforceIconCacheBudget(client: QueryClient) {
  if (budgetedClients.has(client)) return;
  budgetedClients.add(client);
  const cache = client.getQueryCache();
  cache.subscribe(event => {
    if (event.type !== "observerRemoved" && !(event.type === "updated" && event.action.type === "success")) return;
    const key = event.query.queryKey as readonly unknown[];
    if (key[2] !== "asset-metadata" || key[4] !== "icon") return;
    const icons = cache.findAll({ queryKey: [...queryKeys.chain, "asset-metadata"] })
      .filter(query => query.queryKey[4] === "icon" && query.state.data !== undefined)
      .sort((left, right) => left.state.dataUpdatedAt - right.state.dataUpdatedAt);
    const size = (data: unknown) => typeof data === "string" ? data.length : 0;
    let count = icons.length;
    let bytes = icons.reduce((total, query) => total + size(query.state.data), 0);
    for (const query of icons) {
      if (count <= MAX_ICON_CACHE_ENTRIES && bytes <= MAX_ICON_CACHE_BYTES) break;
      if (query.getObserversCount() > 0 || query.state.fetchStatus !== "idle") continue;
      count -= 1;
      bytes -= size(query.state.data);
      cache.remove(query);
    }
  });
}

export function isSafeIconSource(value: string): boolean {
  const isLocalPath = value.startsWith("/") && !value.startsWith("//") && !value.includes("\\");
  const isEmbeddedRaster = /^data:image\/(?:avif|gif|jpeg|png|webp);base64,/i.test(value);
  return isLocalPath || (isEmbeddedRaster && value.length <= MAX_EMBEDDED_ICON_DATA_URI_LENGTH);
}

function pickLogoFromMetadata(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const obj = meta as Record<string, unknown>;

  // Token Registry logos can contain a raw base64 PNG or an embedded raster URI.
  if (typeof obj.logo === "string" && obj.logo.length > 0) {
    if (obj.logo.startsWith("data:image/")) return isSafeIconSource(obj.logo) ? obj.logo : null;
    if (obj.logo.startsWith("data:") || obj.logo.startsWith("http")) return null;
    if (obj.logo.length > MAX_EMBEDDED_ICON_DATA_URI_LENGTH - PNG_DATA_URI_PREFIX.length) return null;
    return `${PNG_DATA_URI_PREFIX}${obj.logo}`;
  }

  // Remote issuer images could link the viewer's IP to the displayed wallet.
  if (typeof obj.image === "string" && obj.image.startsWith("data:image/") && isSafeIconSource(obj.image)) {
    return obj.image;
  }
  return null;
}

export const assetIconQueryOptions = (unit: string) => queryOptions({
  queryKey: queryKeys.assetIcon(unit),
  queryFn: async ({ signal, client }): Promise<string | null> => {
    enforceIconCacheBudget(client);
    return pickLogoFromMetadata(await new ServerFetcher({ signal }).fetchAssetMetadata(unit));
  },
  staleTime: query => query.state.data === null
    ? queryPolicy.missingMetadataStaleMs
    : queryPolicy.metadataStaleMs,
  gcTime: queryPolicy.metadataGcMs
});

/** Prefetch uses the same freshness and deduplication as visible badges. */
export async function prefetchAssetIcons(client: QueryClient, units: string[]): Promise<void> {
  await Promise.all(units.filter(unit => !!unit && unit !== "lovelace")
    .map(unit => client.prefetchQuery(assetIconQueryOptions(unit))));
}
