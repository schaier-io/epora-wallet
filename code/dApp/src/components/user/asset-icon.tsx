"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { assetIconQueryOptions, isSafeIconSource } from "@/lib/query/asset-icons";
export { prefetchAssetIcons } from "@/lib/query/asset-icons";
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

/** Metadata belongs to Query; known registry icons remain static application data. */
function useAssetIconUrl(unit: string, knownMeta: KnownAssetMeta | null): string | null {
  const icon = useQuery({
    ...assetIconQueryOptions(unit),
    enabled: !!unit && unit !== "lovelace" && !knownMeta?.icon
  });
  return unit === "lovelace" ? null : knownMeta?.icon ?? icon.data ?? null;
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
