"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { ServerFetcher } from "@/lib/mesh/server-fetcher";

const fetcher = new ServerFetcher();
import {
  resolveAssetIdentity,
  type KnownAssetMeta
} from "@/lib/cardano-assets";

type AssetKind = "ada" | "stable" | "nft" | "token";

type AssetIconProps = {
  kind: AssetKind;
  unit: string;
  identity?: ReturnType<typeof resolveAssetIdentity>;
  Icon: LucideIcon;
  className?: string;
};

const ASSET_BADGE_STYLES: Record<AssetKind, string> = {
  ada: "border-emerald-300/40 bg-emerald-400/10 text-emerald-200",
  stable: "border-sky-300/40 bg-sky-400/10 text-sky-200",
  nft: "border-fuchsia-300/40 bg-fuchsia-400/10 text-fuchsia-200",
  token: "border-amber-300/40 bg-amber-400/10 text-amber-200"
};

const STORAGE_KEY = "smart-wallet:asset-icon-cache:v1";
const STORAGE_NOT_FOUND = "__none__";
const MAX_CACHE_ENTRIES = 200;

type AssetIconCacheEntry = {
  url: string | typeof STORAGE_NOT_FOUND;
  fetchedAt: number;
};

const memoryCache = new Map<string, AssetIconCacheEntry>();
const inflight = new Map<string, Promise<string | null>>();
let storageHydrated = false;

// The cache is an external store, so the components reading it subscribe rather than each
// holding their own copy of the answer. A second badge for the same asset now updates with
// the first, instead of waiting for its own lookup.
const cacheListeners = new Set<() => void>();

function subscribeToCache(listener: () => void) {
  cacheListeners.add(listener);
  return () => {
    cacheListeners.delete(listener);
  };
}

function readStorage(): Record<string, AssetIconCacheEntry> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, AssetIconCacheEntry>) : {};
  } catch {
    return {};
  }
}

function writeStorage(snapshot: Record<string, AssetIconCacheEntry>) {
  if (typeof window === "undefined") return;
  try {
    const entries = Object.entries(snapshot);
    if (entries.length > MAX_CACHE_ENTRIES) {
      entries.sort(([, a], [, b]) => a.fetchedAt - b.fetchedAt);
      const trimmed = Object.fromEntries(entries.slice(-MAX_CACHE_ENTRIES));
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      return;
    }
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    /* storage may be disabled (private mode, quota); fall back to in-memory */
  }
}

function hydrateOnce() {
  if (storageHydrated) return;
  storageHydrated = true;
  const snapshot = readStorage();
  for (const [unit, entry] of Object.entries(snapshot)) {
    memoryCache.set(unit, entry);
  }
}

function persist() {
  const snapshot: Record<string, AssetIconCacheEntry> = {};
  for (const [unit, entry] of memoryCache) snapshot[unit] = entry;
  writeStorage(snapshot);
}

/** Read AssetIcon URL from cache. Returns `null` if not cached. */
function readCache(unit: string): string | null | undefined {
  hydrateOnce();
  const entry = memoryCache.get(unit);
  if (!entry) return undefined;
  return entry.url === STORAGE_NOT_FOUND ? null : entry.url;
}

function writeCache(unit: string, url: string | null) {
  memoryCache.set(unit, {
    url: url ?? STORAGE_NOT_FOUND,
    fetchedAt: Date.now()
  });
  persist();
  for (const listener of cacheListeners) listener();
}

function pickLogoFromMetadata(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const obj = meta as Record<string, unknown>;

  // Cardano Token Registry (CIP-26) returns logo as base64 PNG.
  if (typeof obj.logo === "string" && obj.logo.length > 0) {
    if (obj.logo.startsWith("data:image/")) return obj.logo;
    if (obj.logo.startsWith("data:") || obj.logo.startsWith("http")) return null;
    return `data:image/png;base64,${obj.logo}`;
  }

  // Do not load remote CIP-25 images in the browser. A token issuer could use
  // one as a tracking pixel that links a wallet view to the viewer's IP.
  if (typeof obj.image === "string" && obj.image.startsWith("data:image/")) return obj.image;

  return null;
}

function isSafeIconSource(value: string): boolean {
  const isLocalPath = value.startsWith("/") && !value.startsWith("//") && !value.includes("\\");
  const isEmbeddedRaster = /^data:image\/(?:avif|gif|jpeg|png|webp);base64,/i.test(value);
  return isLocalPath || isEmbeddedRaster;
}

async function lookupAssetIcon(unit: string): Promise<string | null> {
  if (unit === "lovelace") return null;
  const cached = readCache(unit);
  if (cached !== undefined) return cached;

  const existing = inflight.get(unit);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const metadata: unknown = await fetcher.fetchAssetMetadata(unit);
      const url = pickLogoFromMetadata(metadata);
      writeCache(unit, url);
      return url;
    } catch {
      // A failed lookup (rate limit, dropped connection) is not "no logo"; caching
      // it would hide the logo for the rest of the session.
      return null;
    } finally {
      inflight.delete(unit);
    }
  })();

  inflight.set(unit, promise);
  return promise;
}

/** Prefetch logos for a list of known assets. Safe to call repeatedly. */
export function prefetchAssetIcons(units: string[]) {
  if (typeof window === "undefined") return;
  hydrateOnce();
  for (const unit of units) {
    if (!unit || unit === "lovelace") continue;
    if (readCache(unit) !== undefined) continue;
    void lookupAssetIcon(unit);
  }
}

/** Hook returning a resolved icon URL for an asset, or null while unresolved. */
function useAssetIconUrl(unit: string, knownMeta: KnownAssetMeta | null): string | null {
  // `useSyncExternalStore`, not a plain call to `readCache`. The cache is hydrated from
  // `sessionStorage`, which the server cannot see, and `readCache` hydrates it on first use.
  // Reading it straight from the render body meant the first client render disagreed with
  // the server HTML for any asset an earlier visit had cached: the server drew the Lucide
  // fallback, the client drew the logo, and React throws the mismatched subtree away and
  // rebuilds it. `getServerSnapshot` reports "nothing cached" for both the server render and
  // the hydration render, and the store's own update paints the logo straight afterwards,
  // with no second lookup.
  const cachedUrl = useSyncExternalStore(
    subscribeToCache,
    () => readCache(unit),
    () => undefined
  );

  const cached = (() => {
    if (unit === "lovelace") {
      return { found: true, url: null };
    }

    if (knownMeta?.icon) {
      return { found: true, url: knownMeta.icon };
    }

    return cachedUrl === undefined
      ? { found: false, url: null }
      : { found: true, url: cachedUrl };
  })();

  useEffect(() => {
    if (cached.found) {
      return;
    }

    // No cancellation flag and no local copy of the answer: a successful lookup writes to
    // the cache, and the subscription above delivers it to every badge showing that asset.
    // A failed lookup writes nothing on purpose, so the fallback stays and the next mount
    // tries again.
    void lookupAssetIcon(unit);
  }, [cached.found, unit]);

  return cached.url;
}

export function AssetIcon({ kind, unit, identity, Icon, className }: AssetIconProps) {
  const fallbackIdentity = useMemo(() => resolveAssetIdentity(unit), [unit]);
  const id = identity ?? fallbackIdentity;
  const resolvedUrl = useAssetIconUrl(unit, id.knownMeta);
  const url = resolvedUrl && isSafeIconSource(resolvedUrl) ? resolvedUrl : null;
  // A URL whose image failed to load; the Lucide fallback takes its place.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  const badge = cn(
    "inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border",
    ASSET_BADGE_STYLES[kind],
    className
  );

  if (kind === "ada") {
    return (
      <span className={badge} aria-hidden="true">
        <span
          className="font-semibold"
          style={{
            fontFamily:
              "ui-sans-serif, system-ui, -apple-system, 'Segoe UI Symbol', 'Helvetica Neue', sans-serif",
            fontSize: "20px",
            lineHeight: 1,
            transform: "translateY(-0.5px)"
          }}
        >
          ₳
        </span>
      </span>
    );
  }

  if (url && url !== failedUrl) {
    return (
      <span className={badge}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt=""
          aria-hidden="true"
          className="h-full w-full object-cover"
          onError={() => setFailedUrl(url)}
        />
      </span>
    );
  }

  return (
    <span className={badge} aria-hidden="true">
      <Icon className="h-4 w-4" />
    </span>
  );
}
