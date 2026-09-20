"use client";
import { useFormatter, useTranslations } from "next-intl";

import { AlarmClock, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import type { ProofOfLifeAlert } from "@/lib/user-flow/proof-of-life-alert";

/**
 * The proof-of-life alert list for the wallet picker: one row per wallet whose check-in
 * timer is running low or has already run out. Each row names its wallet, shows the deadline
 * itself (not a countdown, so a row stays truthful however long the dialog stays open), and
 * offers the renewal flow to a signer who can run it. Opening the flow never signs: the
 * renewal action opens at its own configure step.
 */
export function WorkspaceProofOfLifeAlerts({
  alerts,
  onRenew
}: {
  alerts: ProofOfLifeAlert[];
  onRenew: (unit: string) => void;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceWorkspaceProofOfLifeAlerts");
  const formatter = useFormatter();

  if (alerts.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="proof-of-life-alerts-heading"
      className="space-y-2"
    >
      <div>
        <h3
          id="proof-of-life-alerts-heading"
          className="flex items-center gap-2 text-sm font-semibold text-foreground"
        >
          <AlarmClock className="h-4 w-4 text-amber-400" aria-hidden="true" />
          {i18n("proofOfLifeDeadlines")}
        </h3>
        <p className="mt-1 text-xs leading-snug text-muted-foreground">
          {i18n("theseWalletsNeedACheckInBeforeTheirTimerRunsOut")}
        </p>
      </div>
      <ul className="space-y-2">
        {alerts.map((alert) => {
          const overdue = alert.state === "overdue";
          // The deadline as an absolute date-time, with the zone named. The comment here
          // used to say every reader sees the same instant, which is true of the instant
          // and useless to the reader: unnamed, `defaultTimeZone` reads as a local wall
          // clock, and a check-in deadline is a time somebody has to act on.
          const deadlineLabel = formatter.dateTime(new Date(alert.deadlineMs), "shortWithZone");
          return (
            <li
              key={alert.unit}
              className={cn(
                "flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border p-3",
                overdue
                  ? "border-rose-500/30 bg-rose-500/10"
                  : "border-amber-500/30 bg-amber-500/10"
              )}
            >
              <div className="flex min-w-0 items-start gap-2">
                {overdue ? (
                  <AlertTriangle
                    className="mt-0.5 h-4 w-4 shrink-0 text-rose-300"
                    aria-hidden="true"
                  />
                ) : (
                  <AlarmClock
                    className="mt-0.5 h-4 w-4 shrink-0 text-amber-400"
                    aria-hidden="true"
                  />
                )}
                <p className="min-w-0 text-sm leading-snug text-foreground">
                  {overdue
                    ? i18n("walletDeadlineRanOut", {
                        wallet: alert.walletName,
                        date: deadlineLabel
                      })
                    : i18n("walletDeadlineApproaching", {
                        wallet: alert.walletName,
                        date: deadlineLabel
                      })}
                </p>
              </div>
              {alert.canRenew ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => onRenew(alert.unit)}
                  aria-label={i18n("refreshProofOfLifeFor", { wallet: alert.walletName })}
                >
                  {i18n("refreshProofOfLife")}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
