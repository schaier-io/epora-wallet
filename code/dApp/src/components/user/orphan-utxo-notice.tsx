"use client";

import { Button } from "@/components/ui/button";
import { MAX_ORPHAN_SWEEP_INPUTS } from "@/components/user/workspace/constants";
import type { DiscoveredUtxo } from "@/lib/discovery/types";
import { formatLovelaceAsAda } from "@/lib/units/lovelace";

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
  const batched = count > MAX_ORPHAN_SWEEP_INPUTS;

  return (
    <div
      role="alert"
      className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100"
    >
      {/*
        This used to open with `{count} wallet UTxO{s} at a different stake address` and go on
        to say the funds `can't be stolen` — raising theft in order to deny it — and `may not
        appear in your normal balance`, hedging about someone's money in 58 words. It now
        leads with the amount, states plainly that the money is safe, and names the two real
        consequences.
      */}
      <div className="flex flex-col gap-1">
        <strong className="font-semibold">
          {formatLovelaceAsAda(orphanLovelace)} ₳ is in the wrong spot
        </strong>
        <p className="text-amber-100/80">
          This money is yours and it is safe. It just is not earning staking rewards, and it
          may be missing from your balance. Moving it back fixes both.
        </p>
        {batched ? (
          <p className="text-amber-100/70">
            This takes {Math.ceil(count / MAX_ORPHAN_SWEEP_INPUTS)} transactions. Sign the
            first, then choose Re-check to move the rest.
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
          {busy ? "Moving…" : "Move it back"}
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
