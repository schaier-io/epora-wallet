"use client";

import { Button } from "@/components/ui/button";
import { MAX_ORPHAN_SWEEP_INPUTS } from "@/components/user/workspace/constants";
import type { DiscoveredUtxo } from "@/lib/discovery/types";

function formatAda(lovelace: bigint): string {
  const ada = Number(lovelace) / 1_000_000;
  return ada.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

type OrphanUtxoNoticeProps = {
  orphans: DiscoveredUtxo[];
  orphanLovelace: bigint;
  busy?: boolean;
  onConsolidate: (orphans: DiscoveredUtxo[]) => void;
  onDismiss?: () => void;
  onRefresh?: () => void;
};

/// Surfaced when wallet funds are discovered at a stake credential other than
/// the wallet's intended one (e.g. an inbound deposit to a "Franken" address, or
/// a legacy UTxO left over from before the intended stake credential changed).
/// Offers to move them back to the wallet's intended address via consolidation.
export function OrphanUtxoNotice({
  orphans,
  orphanLovelace,
  busy = false,
  onConsolidate,
  onDismiss,
  onRefresh
}: OrphanUtxoNoticeProps) {
  if (orphans.length === 0) {
    return null;
  }

  const count = orphans.length;
  const plural = count === 1 ? "" : "s";
  const batched = count > MAX_ORPHAN_SWEEP_INPUTS;

  return (
    <div
      role="alert"
      className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100"
    >
      <div className="flex flex-col gap-1">
        <strong className="font-semibold">
          {count} wallet UTxO{plural} at a different stake address
        </strong>
        <p className="text-amber-100/80">
          About {formatAda(orphanLovelace)} ₳ of your wallet&apos;s funds sit at a
          stake address that isn&apos;t this wallet&apos;s intended one. The funds
          stay locked by your wallet script and can&apos;t be stolen, but their
          staking rewards and delegation aren&apos;t under your wallet&apos;s
          control, and they may not appear in your normal balance. Move them back
          to your wallet address to bring them under your wallet&apos;s control.
        </p>
        {batched ? (
          <p className="text-amber-100/70">
            Moves up to {MAX_ORPHAN_SWEEP_INPUTS} per transaction — sign, then
            Re-check to sweep the rest.
          </p>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={() => onConsolidate(orphans)}
        >
          {busy ? "Moving…" : "Move to my wallet address"}
        </Button>
        {onRefresh ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={onRefresh}
          >
            Re-check
          </Button>
        ) : null}
        {onDismiss ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={onDismiss}
          >
            Dismiss
          </Button>
        ) : null}
      </div>
    </div>
  );
}
