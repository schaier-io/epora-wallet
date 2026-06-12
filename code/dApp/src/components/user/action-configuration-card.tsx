import { RotateCcw, ShieldAlert, Sparkles, X } from "lucide-react";
import type { ReactNode } from "react";
import { AnimatedContent } from "@/components/react-bits/primitives";
import {
  CardSilkBackground,
  type CardSilkSection
} from "@/components/user/card-silk-background";
import {
  isImplicitLockedInputSurfaceLabel,
  type ReadinessIssue,
  type TaskDefinition,
  type UserActionKind
} from "@/components/user/flow-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader
} from "@/components/ui/card";
import { InfoHint } from "@/components/ui/info-hint";
import { cn } from "@/lib/utils/cn";

type UserActionConfigurationCardProps = {
  definition: TaskDefinition;
  selectedAction: UserActionKind;
  selectedDetectedToken: boolean;
  primaryIssue: ReadinessIssue | null;
  onReset: () => void;
  onClear: () => void;
  title?: string;
  description?: string;
  compact?: boolean;
  silkSection?: CardSilkSection;
  children: ReactNode;
};

const ACTION_SILK_SECTION: Partial<Record<UserActionKind, CardSilkSection>> = {
  mint: "home",
  use: "send",
  "lock-funds": "receive",
  "use-allowance": "send",
  "use-beneficiary": "send",
  "payout-streaming-payment": "streamingPayments",
  "manage-streaming-payments": "streamingPayments",
  "update-state": "settings",
  "consolidate-utxo": "advanced",
  "renew-proof-of-life": "settings",
  "wallet-spend": "advanced",
  "wallet-withdraw": "advanced",
  "wallet-publish": "advanced",
  "wallet-propose": "advanced"
};

function riskCopy(definition: TaskDefinition) {
  switch (definition.risk) {
    case "low":
      return "Simple";
    case "medium":
      return "Needs review";
    case "high":
      return "Advanced";
  }
}

function laneCopy(definition: TaskDefinition) {
  return definition.lane === "recommended" ? "Recommended" : "Advanced";
}

function supportsDetectedTokenReset(action: UserActionKind) {
  return (
    action === "use" ||
    action === "renew-proof-of-life" ||
    action === "update-state" ||
    action === "manage-streaming-payments" ||
    action === "use-allowance" ||
    action === "use-beneficiary" ||
    action === "payout-streaming-payment" ||
    action === "consolidate-utxo" ||
    action === "wallet-withdraw" ||
    action === "wallet-publish" ||
    action === "wallet-propose"
  );
}

export function UserActionConfigurationCard({
  definition,
  selectedAction,
  selectedDetectedToken,
  primaryIssue,
  onReset,
  onClear,
  title = "Action details",
  description,
  compact = false,
  silkSection,
  children
}: UserActionConfigurationCardProps) {
  const showSurfaceSummary = !isImplicitLockedInputSurfaceLabel(definition.surfaceLabel);
  const resolvedDescription = description ?? definition.description;
  const descriptionIsLong = resolvedDescription.length > 78;
  const resolvedSection: CardSilkSection =
    silkSection ?? ACTION_SILK_SECTION[selectedAction] ?? "home";
  void title;
  void compact;

  return (
    <Card className="relative overflow-hidden">
      <CardSilkBackground section={resolvedSection} />
      <CardHeader className="relative z-10 pb-3 pt-3">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {descriptionIsLong ? (
            <InfoHint label={`More about ${title}`} contentClassName="max-w-sm">
              {resolvedDescription}
            </InfoHint>
          ) : null}
          {selectedDetectedToken && supportsDetectedTokenReset(selectedAction) ? (
            <Button type="button" size="sm" variant="ghost" onClick={onReset} className="h-7 px-2 text-[11px]">
              <RotateCcw className="h-3.5 w-3.5" />
              Reload defaults
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="ghost" onClick={onClear} className="h-7 px-2 text-[11px]">
            <X className="h-3.5 w-3.5" />
            Clear form
          </Button>
        </div>
      </CardHeader>
      <CardContent className={cn("relative z-10", compact ? "space-y-4" : "space-y-5")}>
        <AnimatedContent
          className="rounded-xl border border-border/60 bg-background/40 p-4"
          distance={18}
        >
          <div className="flex flex-wrap items-center gap-2">
            {(() => {
              type BadgeVariant = "secondary" | "outline" | "warning";
              const seen = new Set<string>();
              const items: Array<{ key: string; label: string; variant: BadgeVariant }> = [];
              const pushBadge = (label: string, variant: BadgeVariant) => {
                if (!label) return;
                const normalized = label.trim().toLowerCase();
                if (seen.has(normalized)) return;
                seen.add(normalized);
                items.push({ key: `${definition.kind}-${normalized}`, label, variant });
              };
              pushBadge(definition.shortLabel, "secondary");
              pushBadge(laneCopy(definition), definition.lane === "recommended" ? "secondary" : "outline");
              pushBadge(riskCopy(definition), definition.risk === "high" ? "warning" : "outline");
              if (showSurfaceSummary) {
                pushBadge(definition.surfaceLabel, "outline");
              }
              if (selectedDetectedToken) {
                pushBadge("This wallet", "secondary");
              }
              return items.map((item) => (
                <Badge key={item.key} variant={item.variant}>
                  {item.label}
                </Badge>
              ));
            })()}
          </div>
          <p className="mt-3 text-sm text-foreground">{definition.outcome}</p>
          {compact ? (
            <details className="mt-4 rounded-lg border border-border/60 bg-muted/20 p-3">
              <summary className="cursor-pointer text-sm font-medium text-foreground">
                What this does
              </summary>
              <div className="mt-3 space-y-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    Who needs to approve
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {definition.pathLabels.map((label) => (
                      <Badge key={`${definition.kind}-${label}`} variant="outline">
                        {label}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-border/60 bg-background/40 p-3">
                    <p className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                      <Sparkles className="h-4 w-4 text-primary" />
                      When to use it
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">{definition.whenToUse}</p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/40 p-3">
                    <p className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                      <ShieldAlert className="h-4 w-4 text-primary" />
                      What changes
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">{definition.whatChanges}</p>
                  </div>
                </div>
                <div className="rounded-lg border border-border/60 bg-background/40 p-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    First step
                  </p>
                  <p className="mt-2 text-sm text-foreground">{definition.startingPoint}</p>
                </div>
              </div>
            </details>
          ) : (
            <>
              <div
                className={cn(
                  "mt-4 grid gap-3",
                  showSurfaceSummary ? "md:grid-cols-3" : "md:grid-cols-2"
                )}
              >
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    Who needs to approve
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {definition.pathLabels.map((label) => (
                      <Badge key={`${definition.kind}-${label}`} variant="outline">
                        {label}
                      </Badge>
                    ))}
                  </div>
                </div>
                {showSurfaceSummary ? (
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      Section
                    </p>
                    <p className="mt-2 text-sm text-foreground">{definition.surfaceLabel}</p>
                  </div>
                ) : null}
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    First step
                  </p>
                  <p className="mt-2 text-sm text-foreground">{definition.startingPoint}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <p className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                    <Sparkles className="h-4 w-4 text-primary" />
                    When to use it
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">{definition.whenToUse}</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <p className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                    <ShieldAlert className="h-4 w-4 text-primary" />
                    What changes
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">{definition.whatChanges}</p>
                </div>
              </div>
            </>
          )}
        </AnimatedContent>

        {/* primaryIssue intentionally not rendered here — Review pane "Still blocked" surfaces it. */}
        {void primaryIssue}

        {children}
      </CardContent>
    </Card>
  );
}
