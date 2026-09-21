"use client";
// The Activity surface's streaming-expense projections: one read-only row per
// scheduled payment the wallet sends, showing what has accrued since the last
// payout. A pure derivation over the stream terms (streaming-expense-projection.ts);
// this component only renders the words and figures. A projection is not a
// transaction: rows carry no hash, no fee, and no confirmation state, and they
// never change what the Activity list counts as settled.
import { useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslations } from "next-intl";
import { DisclosureSection } from "@/components/user/workspace/editors";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import { resolveAssetIdentity } from "@/lib/cardano-assets";
import { formatLovelaceAsAda } from "@/lib/units/lovelace";
import {
  activeInferredSttStateFormAtom
} from "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms";
import { formatTimestampLabel } from "@/components/user/workspace/helpers";
import {
  deriveStreamingExpenseProjections,
  type StreamingExpenseProjection
} from "@/components/user/workspace/streaming-expense-projection";
import type { StreamingPaymentRowStatus } from "@/components/user/workspace/streaming-payment-status";

// The badge variant is the state's second channel after the word, matching the
// payout surface's colors: amber when the reader must act (ended, still owed),
// sky for the future, green for a healthy accruing payment, muted grey for one
// leaving the wallet.
const STATUS_BADGE_VARIANT: Record<StreamingPaymentRowStatus["kind"], "outline" | "warning" | "info" | "success"> = {
  finished: "outline",
  ended: "warning",
  upcoming: "info",
  active: "success"
};

// The accrual keeps moving between payouts, so the clock ticks: 30s matches the
// dashboard's proof-of-life ticker, whose smallest shown unit is coarser than
// this drift. Display only -- no quote or transaction reads this clock.
const PROJECTION_REFRESH_INTERVAL_MS = 30_000;

export function WorkspaceStreamingExpenseProjectionsView() {
  const i18n = useTranslations(
    "ComponentsUserWorkspaceWorkspaceStreamingExpenseProjectionsView"
  );
  const streamingPayments = useAtomValue(activeInferredSttStateFormAtom).streamingPayments;
  // Seeded at first render and ticking every 30s, like the dashboard's
  // proof-of-life clock (workspace-wallet-dashboard-view.tsx): the accrual
  // moves between payouts, and a mount-frozen timestamp would read stale.
  // Display only -- no quote or transaction reads this clock.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(
      () => setNowMs(Date.now()),
      PROJECTION_REFRESH_INTERVAL_MS
    );
    return () => window.clearInterval(timer);
  }, []);

  if (streamingPayments.length === 0) {
    return null;
  }

  const projections = deriveStreamingExpenseProjections(streamingPayments, nowMs);

  return (
    <DisclosureSection title={i18n("title")} description={i18n("description")}>
      <div className="mt-3 space-y-2">
        {projections.map((projection, index) => (
          <ProjectionRow
            key={`streaming-expense-projection-${projection.streamingPaymentId}`}
            projection={projection}
            index={index}
          />
        ))}
      </div>
    </DisclosureSection>
  );
}

function ProjectionRow({
  projection,
  index,
}: {
  projection: StreamingExpenseProjection;
  index: number;
}) {
  const i18n = useTranslations(
    "ComponentsUserWorkspaceWorkspaceStreamingExpenseProjectionsView"
  );
  const symbol = resolveAssetIdentity(projection.unit).symbol;
  // Lovelace formats through the canonical units module; other assets display
  // their raw base-unit amount beside their symbol, like the payout surface.
  const formatAmount = (amount: string) =>
    projection.unit === "lovelace"
      ? i18n("value1Ada", { value1: formatLovelaceAsAda(amount) })
      : i18n("value1Value2", { value1: amount, value2: symbol });
  const statusWord =
    projection.status.kind === "finished"
      ? i18n("finished")
      : projection.status.kind === "ended"
        ? i18n("ended")
        : projection.status.kind === "upcoming"
          ? i18n("notStarted")
          : i18n("active");

  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-3">
      <div className="flex w-full flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-medium text-foreground">
            {i18n("scheduledPaymentValue1", { value1: index + 1 })}
          </p>
          {/* A bech32 address is one unbroken ~100-character token; without
              break-all it pushes past the row instead of wrapping. */}
          <p className="break-all text-xs text-muted-foreground">
            {projection.payoutAddress || i18n("nobodyToPay")}
          </p>
        </div>
        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <Badge variant="secondary">{i18n("projectedBadge")}</Badge>
          <Badge variant={STATUS_BADGE_VARIANT[projection.status.kind]}>
            {statusWord}
          </Badge>
        </div>
      </div>
      {/*
          Amber is the "you owe money" colour and is conditional. It used to be
          unconditional, so a healthy stream owing nothing wore the same alert colour as
          one behind on its payouts. `computeStreamingPaymentDueAmount` returns a
          non-negative base-unit integer string and the exact literal "0" when nothing is
          owed, so the string compare is the whole test.
      */}
      <p
        className={cn(
          "mt-2 text-sm font-semibold tabular-nums",
          projection.unpaidAccrued === "0" ? "text-foreground" : "text-amber-100"
        )}
      >
        {i18n("unpaidNow")} {formatAmount(projection.unpaidAccrued)}
      </p>
      <div className="mt-2 grid gap-2 tabular-nums sm:grid-cols-2">
        <div className="min-w-0 wrap-anywhere rounded-md border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
          {projection.unit === "lovelace"
            ? i18n("accruesAboutValue1AdaPerDay", { value1: formatLovelaceAsAda(projection.ratePerDay) })
            : i18n("accruesAboutValue1Value2PerDay", { value1: projection.ratePerDay, value2: symbol })}
        </div>
        <div className="min-w-0 wrap-anywhere rounded-md border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
          {i18n("paidSoFar")} {formatAmount(projection.settledAmount)}
        </div>
        <div className="min-w-0 wrap-anywhere rounded-md border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
          {i18n("projectedTotal")} {formatAmount(projection.lifetimeTotal)}
        </div>
        <div className="min-w-0 wrap-anywhere rounded-md border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
          {i18n("stillToAccrue")} {formatAmount(projection.projectedRemaining)}
        </div>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {i18n("asOfValue1", { value1: formatTimestampLabel(projection.asOfMs) })}
      </p>
    </div>
  );
}
