"use client";
import { useTranslations } from "next-intl";


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
  const i18n = useTranslations("ComponentsUserOrphanUtxoNotice");
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
      <div className="flex flex-col gap-1">
        <strong className="font-semibold">
          {i18n("fundPoolsOutsideCurrentStakingAddress", { count })}
        </strong>
        <p className="text-amber-100/80">
          {formatLovelaceAsAda(orphanLovelace)} {i18n("adaRemainsControlledByThisWalletButIt")}
        </p>
        {batched ? (
          <p className="text-amber-100/70">
            {i18n("batchedMoveInstructions", { limit: MAX_ORPHAN_SWEEP_INPUTS })}
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
          {busy ? i18n("moving") : i18n("moveToCurrentAddress")}
        </Button>
        {onRefresh ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={onRefresh}
          >
            {i18n("reCheck")}
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
            {i18n("dismiss")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
