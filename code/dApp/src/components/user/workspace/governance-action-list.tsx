"use client";
import { useTranslations } from "next-intl";

import { badgeVariants } from "@/components/ui/badge";
import type { GovernanceAction } from "@/lib/api/governance-actions";
import { shortenIdentifier } from "@/lib/utils/explorer";
import { cn } from "@/lib/utils/cn";

export const TYPE_LABEL_KEYS = {
  hard_fork_initiation: "typeHardFork",
  new_committee: "typeNewCommittee",
  new_constitution: "typeNewConstitution",
  info_action: "typeInfo",
  no_confidence: "typeNoConfidence",
  parameter_change: "typeParameterChange",
  treasury_withdrawals: "typeTreasuryWithdrawal"
} as const;

/** The translated type, or the raw type for one this app has no label for. */
export function useGovernanceTypeLabel() {
  const i18n = useTranslations("ComponentsUserWorkspaceGovernanceVotePicker");
  return (type: string) =>
    type in TYPE_LABEL_KEYS ? i18n(TYPE_LABEL_KEYS[type as keyof typeof TYPE_LABEL_KEYS]) : type;
}

/** Open governance actions to pick from. The picked one is pressed. */
export function GovernanceActionList({
  actions,
  selectedId,
  onPick
}: {
  actions: GovernanceAction[];
  selectedId: string | null;
  onPick: (action: GovernanceAction) => void;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceGovernanceVotePicker");
  const typeLabel = useGovernanceTypeLabel();
  return (
    <ul className="max-h-80 space-y-2 overflow-y-auto">
      {actions.map((action) => {
        const selected = action.id === selectedId;
        return (
          <li key={action.id}>
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onPick(action)}
              className={cn(
                "w-full rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected ? "border-primary bg-primary/10" : "border-border/60 bg-background/40"
              )}
            >
              <span className="flex flex-wrap items-center gap-2">
                {/* A span: Badge renders a div, which a button may not hold. */}
                <span className={badgeVariants({ variant: "outline" })}>{typeLabel(action.type)}</span>
                {action.expirationEpoch !== null ? (
                  <span className="text-xs text-muted-foreground">
                    {i18n("closesAfterEpoch", { epoch: action.expirationEpoch })}
                  </span>
                ) : null}
              </span>
              <span className="mt-1 block text-sm font-medium text-foreground">
                {action.title ?? i18n("untitled")}
              </span>
              <span className="block font-mono text-xs text-muted-foreground">{shortenIdentifier(action.id)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
