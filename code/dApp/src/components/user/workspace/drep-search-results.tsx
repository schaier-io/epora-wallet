"use client";
import { useTranslations } from "next-intl";

import { Loader2 } from "lucide-react";
import type { DrepSummary } from "@/lib/api/dreps";
import { formatLovelaceAsAda } from "@/lib/units/lovelace";
import { cn } from "@/lib/utils/cn";
import { shortenIdentifier } from "@/lib/utils/explorer";

/**
 * The DReps under the voting-delegate search box: matches for the typed name, or, when
 * the box is empty, the server's random shortlist. A row only opens the DRep's card;
 * delegating still happens on the card, so a stray click here changes nothing.
 */
export function DrepSearchResults({
  query,
  dreps,
  loading,
  failed,
  onOpen
}: {
  query: string;
  dreps: DrepSummary[];
  loading: boolean;
  failed: boolean;
  onOpen: (drepId: string) => void;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceDrepSearchResults");

  return (
    <div className="space-y-2" aria-busy={loading}>
      {query ? null : (
        <p className="text-xs text-muted-foreground">{i18n("shortlistNote")}</p>
      )}
      {failed ? (
        <p role="alert" className="text-xs text-amber-100">{i18n("listFailed")}</p>
      ) : dreps.length === 0 ? (
        <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          {loading ? i18n("loading") : query ? i18n("noMatch", { query }) : i18n("noShortlist")}
        </p>
      ) : (
        // Dimmed while the next list loads: the rows still answer the previous text.
        <ul
          className={cn(
            "divide-y divide-border/60 rounded-md border border-border/60 transition-opacity",
            loading && "opacity-60"
          )}
        >
          {dreps.map((drep) => (
            <li key={drep.drepId}>
              <button
                type="button"
                onClick={() => onOpen(drep.drepId)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-sm">
                    <span className="truncate font-semibold text-foreground">{drep.name}</span>
                    {drep.status === "active" ? null : (
                      <span className="eyebrow shrink-0 text-amber-100">{i18n("inactive")}</span>
                    )}
                  </span>
                  <span className="block truncate font-mono text-xs text-muted-foreground">
                    {shortenIdentifier(drep.drepId)}
                  </span>
                </span>
                {drep.votingPowerLovelace === null ? null : (
                  <span className="shrink-0 text-right text-xs text-muted-foreground">
                    {i18n("votingPower", { power: formatLovelaceAsAda(drep.votingPowerLovelace) })}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
