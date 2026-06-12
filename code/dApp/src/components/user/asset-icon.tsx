"use client";

import { useEffect, useMemo, useState } from "react";
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
}

function pickLogoFromMetadata(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const obj = meta as Record<string, unknown>;

  // Cardano Token Registry (CIP-26) returns logo as base64 PNG.
  if (typeof obj.logo === "string" && obj.logo.length > 0) {
    const value = obj.logo.startsWith("data:") || obj.logo.startsWith("http")
      ? obj.logo
      : `data:image/png;base64,${obj.logo}`;
    return value;
  }

  // CIP-25 NFT metadata often uses `image`. Can be ipfs://... or https://...
  if (typeof obj.image === "string" && obj.image.length > 0) {
    if (obj.image.startsWith("ipfs://")) {
      return `https://ipfs.io/ipfs/${obj.image.slice("ipfs://".length)}`;
    }
    if (obj.image.startsWith("http")) return obj.image;
  }

  return null;
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
      writeCache(unit, null);
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
  const cached = (() => {
    if (unit === "lovelace") {
      return { found: true, url: null };
    }

    if (knownMeta?.icon) {
      return { found: true, url: knownMeta.icon };
    }

    const cachedUrl = readCache(unit);
    return cachedUrl === undefined
      ? { found: false, url: null }
      : { found: true, url: cachedUrl };
  })();
  const [resolved, setResolved] = useState<{ unit: string; url: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (cached.found) {
      return;
    }

    void lookupAssetIcon(unit).then((resolved) => {
      if (!cancelled) setResolved({ unit, url: resolved });
    });
    return () => {
      cancelled = true;
    };
  }, [cached.found, unit]);

  if (cached.found) {
    return cached.url;
  }

  return resolved?.unit === unit ? resolved.url : null;
}

export function AssetIcon({ kind, unit, identity, Icon, className }: AssetIconProps) {
  const fallbackIdentity = useMemo(() => resolveAssetIdentity(unit), [unit]);
  const id = identity ?? fallbackIdentity;
  const url = useAssetIconUrl(unit, id.knownMeta);

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

  if (url) {
    return (
      <span className={badge}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt=""
          aria-hidden="true"
          className="h-full w-full object-cover"
          onError={(event) => {
            // If the URL fails to load, blank it so the Lucide fallback shows next render.
            event.currentTarget.style.display = "none";
            writeCache(unit, null);
          }}
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
