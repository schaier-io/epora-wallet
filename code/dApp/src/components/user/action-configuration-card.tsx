import { useTranslations } from "next-intl";
import { ChevronRight, RotateCcw, ShieldAlert, Sparkles, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { AnimatedContent } from "@/components/react-bits/primitives";
import {
  CardSilkBackground,
  type CardSilkSection
} from "@/components/user/card-silk-background";
import {
  isImplicitLockedInputSurfaceLabel,
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
import { PopupDialog } from "@/components/ui/popup-dialog";
import { cn } from "@/lib/utils/cn";

type UserActionConfigurationCardProps = {
  definition: TaskDefinition;
  selectedAction: UserActionKind;
  selectedDetectedToken: boolean;
  onReset: () => void;
  onClear: () => void;
  title?: string;
  description?: string;
  approvalLabels?: string[];
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
  "stop-beneficiary-stream": "streamingPayments",
  "distribute-beneficiaries": "send",
  "payout-streaming-payment": "streamingPayments",
  "manage-streaming-payments": "streamingPayments",
  "update-state": "settings",
  "consolidate-utxo": "advanced",
  "renew-proof-of-life": "settings",
  "wallet-withdraw": "advanced",
  "wallet-publish": "advanced",
  "wallet-vote": "advanced"
};

/**
 * The one badge worth the row. `low` returns null on purpose: "Simple" told the user
 * nothing they could act on, and it sat beside three other badges that also told them
 * nothing. A warning is only a warning while it is rare.
 */
function riskCopy(
  definition: TaskDefinition,
  t: (key: "needsReview" | "highRisk") => string
): string | null {
  switch (definition.risk) {
    case "low":
      return null;
    case "medium":
      return t("needsReview");
    case "high":
      return t("highRisk");
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
    action === "stop-beneficiary-stream" ||
    action === "distribute-beneficiaries" ||
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
  onReset,
  onClear,
  title,
  description,
  approvalLabels,
  compact = false,
  silkSection,
  children
}: UserActionConfigurationCardProps) {
  const i18n = useTranslations("ComponentsUserActionConfigurationCard");
  // "Clear form" wipes the whole draft in one call, so the button only opens the
  // confirm dialog; the parent's `onClear` runs after the reader confirms. There is
  // no cross-form "draft has content" check to gate the dialog on, and clearing an
  // already-default form costs one click, so the dialog shows on every click.
  const [confirmingClear, setConfirmingClear] = useState(false);
  const showSurfaceSummary = !isImplicitLockedInputSurfaceLabel(definition.surfaceLabel);
  // The description used to render only when it ran past 78 characters, and then only inside
  // an info hint. Measured against the action catalogue: 14 of the 15 explanations are shorter
  // than that, so the card threw away the one line that says what the action is on every
  // action but one. The longest is 107 characters, which is a subtitle, not a paragraph.
  const resolvedDescription = (description ?? definition.description).trim();
  const resolvedSection: CardSilkSection =
    silkSection ?? ACTION_SILK_SECTION[selectedAction] ?? "home";
  const riskLabel = riskCopy(definition, i18n);
  const resolvedApprovalLabels = approvalLabels ?? definition.pathLabels;

  return (
    <>
    <Card className="relative overflow-hidden">
      <CardSilkBackground section={resolvedSection} />
      <CardHeader className="relative z-10 pb-3">
        {/* The row stays `items-start` and the action group carries `-mt-1`. A 44/36 CSS
            button box beside a 22.5 CSS title line drops the button label 10.75/6.75 CSS
            below the title's centre; -4 CSS takes that to 6.75/2.75. `items-baseline`
            aligns the two exactly, but the description keeps the left column taller than
            the buttons, so it pushes the title 11/7 CSS off the card's own padding edge
            and grows the header by the same amount. `items-center` is worse again: it
            centres the buttons on the title AND description together, 12 CSS low. */}
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="min-w-0">
            <CardTitle>{title ?? i18n("actionDetails")}</CardTitle>
            {resolvedDescription ? (
              <CardDescription className="mt-1">{resolvedDescription}</CardDescription>
            ) : null}
          </div>
          {/* `-mr-2` cancels the ghost buttons' own `px-2`, so the label hangs on the card's
              right rail instead of 8 CSS inside it. The card is `p-4 sm:p-6`, so the 8 CSS
              of border box and the 4 CSS of `ring-offset-2 ring-2` outside it both stay
              inside the card border at every width. */}
          <div className="-mr-2 -mt-1 flex shrink-0 flex-wrap items-center gap-2">
            {selectedDetectedToken && supportsDetectedTokenReset(selectedAction) ? (
              <Button type="button" size="sm" variant="ghost" onClick={onReset} className="px-2 text-xs">
                <RotateCcw className="h-3.5 w-3.5" />
                {i18n("reloadDefaults")}
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setConfirmingClear(true)}
              className="px-2 text-xs"
            >
              <X className="h-3.5 w-3.5" />
              {i18n("clearForm")}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="relative z-10 space-y-4">
        <AnimatedContent distance={18}>
          {riskLabel ? (
            <Badge className="mb-4" variant={definition.risk === "high" ? "warning" : "outline"}>
              {riskLabel}
            </Badge>
          ) : null}
          <p className="text-sm text-foreground">{definition.outcome}</p>
          {compact ? (
            <details className="mt-4">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
                <ChevronRight className="expand-chevron h-4 w-4 shrink-0" aria-hidden="true" />
                {i18n("whatThisDoes")}
              </summary>
              <div className="mt-3 space-y-3">
                <div>
                  <p className="eyebrow text-muted-foreground">
                    {i18n("whoNeedsToApprove")}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {resolvedApprovalLabels.map((label) => (
                      <Badge key={`${definition.kind}-${label}`} variant="outline">
                        {label}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-md bg-muted/20 p-2">
                    <p className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                      <Sparkles className="h-4 w-4 text-primary" />
                      {i18n("whenToUseIt")}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">{definition.whenToUse}</p>
                  </div>
                  <div className="rounded-md bg-muted/20 p-2">
                    <p className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                      <ShieldAlert className="h-4 w-4 text-primary" />
                      {i18n("whatChanges")}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">{definition.whatChanges}</p>
                  </div>
                </div>
                <div className="rounded-md bg-muted/20 p-2">
                  <p className="eyebrow text-muted-foreground">
                    {i18n("firstStep")}
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
                <div className="rounded-md bg-muted/20 p-3">
                  <p className="eyebrow text-muted-foreground">
                    {i18n("whoNeedsToApprove")}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {resolvedApprovalLabels.map((label) => (
                      <Badge key={`${definition.kind}-${label}`} variant="outline">
                        {label}
                      </Badge>
                    ))}
                  </div>
                </div>
                {showSurfaceSummary ? (
                  <div className="rounded-md bg-muted/20 p-3">
                    <p className="eyebrow text-muted-foreground">
                      {i18n("section")}
                    </p>
                    <p className="mt-2 text-sm text-foreground">{definition.surfaceLabel}</p>
                  </div>
                ) : null}
                <div className="rounded-md bg-muted/20 p-3">
                  <p className="eyebrow text-muted-foreground">
                    {i18n("firstStep")}
                  </p>
                  <p className="mt-2 text-sm text-foreground">{definition.startingPoint}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-md bg-muted/20 p-3">
                  <p className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                    <Sparkles className="h-4 w-4 text-primary" />
                    {i18n("whenToUseIt")}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">{definition.whenToUse}</p>
                </div>
                <div className="rounded-md bg-muted/20 p-3">
                  <p className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                    <ShieldAlert className="h-4 w-4 text-primary" />
                    {i18n("whatChanges")}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">{definition.whatChanges}</p>
                </div>
              </div>
            </>
          )}
        </AnimatedContent>

        {children}
      </CardContent>
    </Card>
    {/* The confirm step for "Clear form". Same pattern as the warning review in
        `payee-view.tsx`: title, body, cancel left, destructive confirm right, and
        Escape or the backdrop dismiss it without clearing. */}
    <PopupDialog
      open={confirmingClear}
      onOpenChange={setConfirmingClear}
      title={i18n("clearFormConfirmTitle")}
      description={i18n("clearFormConfirmBody")}
      className="max-w-lg"
    >
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setConfirmingClear(false)}
        >
          {i18n("cancel")}
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => {
            setConfirmingClear(false);
            onClear();
          }}
        >
          {i18n("clearForm")}
        </Button>
      </div>
    </PopupDialog>
    </>
  );
}
