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
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
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
  "wallet-vote": "advanced"
};

/**
 * The one badge worth the row. `low` returns null on purpose: "Simple" told the user
 * nothing they could act on, and it sat beside three other badges that also told them
 * nothing. A warning is only a warning while it is rare.
 */
function riskCopy(definition: TaskDefinition): string | null {
  switch (definition.risk) {
    case "low":
      return null;
    case "medium":
      return "Needs review";
    case "high":
      return "High risk";
  }
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
    action === "wallet-vote"
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
  // The description used to render only when it ran past 78 characters, and then only inside
  // an info hint. Measured against the action catalogue: 14 of the 15 explanations are shorter
  // than that, so the card threw away the one line that says what the action is on every
  // action but one. The longest is 107 characters, which is a subtitle, not a paragraph.
  const resolvedDescription = (description ?? definition.description).trim();
  const resolvedSection: CardSilkSection =
    silkSection ?? ACTION_SILK_SECTION[selectedAction] ?? "home";
  const riskLabel = riskCopy(definition);

  return (
    <Card className="relative overflow-hidden">
      <CardSilkBackground section={resolvedSection} />
      <CardHeader className="relative z-10 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="min-w-0">
            <CardTitle>{title}</CardTitle>
            {resolvedDescription ? (
              <CardDescription className="mt-1">{resolvedDescription}</CardDescription>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {selectedDetectedToken && supportsDetectedTokenReset(selectedAction) ? (
              <Button type="button" size="sm" variant="ghost" onClick={onReset} className="h-8 px-2 text-xs">
                <RotateCcw className="h-3.5 w-3.5" />
                Reload defaults
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="ghost" onClick={onClear} className="h-8 px-2 text-xs">
              <X className="h-3.5 w-3.5" />
              Clear form
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="relative z-10 space-y-4">
        <AnimatedContent
          className="rounded-lg border border-border/60 bg-background/40 p-3 sm:p-4"
          distance={18}
        >
          {riskLabel ? (
            <Badge className="mb-3" variant={definition.risk === "high" ? "warning" : "outline"}>
              {riskLabel}
            </Badge>
          ) : null}
          <p className="text-sm text-foreground">{definition.outcome}</p>
          {compact ? (
            <details className="mt-4 rounded-md border border-border/60 bg-muted/20 p-3">
              <summary className="cursor-pointer text-sm font-medium text-foreground">
                What this does
              </summary>
              <div className="mt-3 space-y-3">
                <div>
                  <p className="eyebrow text-muted-foreground">
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
                  <div className="rounded-md border border-border/60 bg-background/40 p-2">
                    <p className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                      <Sparkles className="h-4 w-4 text-primary" />
                      When to use it
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">{definition.whenToUse}</p>
                  </div>
                  <div className="rounded-md border border-border/60 bg-background/40 p-2">
                    <p className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                      <ShieldAlert className="h-4 w-4 text-primary" />
                      What changes
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">{definition.whatChanges}</p>
                  </div>
                </div>
                <div className="rounded-md border border-border/60 bg-background/40 p-2">
                  <p className="eyebrow text-muted-foreground">
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
                <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                  <p className="eyebrow text-muted-foreground">
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
                  <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                    <p className="eyebrow text-muted-foreground">
                      Section
                    </p>
                    <p className="mt-2 text-sm text-foreground">{definition.surfaceLabel}</p>
                  </div>
                ) : null}
                <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                  <p className="eyebrow text-muted-foreground">
                    First step
                  </p>
                  <p className="mt-2 text-sm text-foreground">{definition.startingPoint}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                  <p className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                    <Sparkles className="h-4 w-4 text-primary" />
                    When to use it
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">{definition.whenToUse}</p>
                </div>
                <div className="rounded-md border border-border/60 bg-muted/20 p-3">
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

        {/* primaryIssue intentionally not rendered here: the Review pane's "Still blocked" surfaces it. */}
        {void primaryIssue}

        {children}
      </CardContent>
    </Card>
  );
}
