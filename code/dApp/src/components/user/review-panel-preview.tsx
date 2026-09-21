import { useTranslations } from "next-intl";
import type { BuildResult } from "@/lib/types/contracts";
import {
  AnimatedContent,
  FadeContent
} from "@/components/react-bits/primitives";
import { cn } from "@/lib/utils/cn";

type ReviewTransactionPreviewProps = {
  preview: BuildResult | null;
  previewMatchesSelectedAction: boolean;
  lastActionLabel: string;
  compact?: boolean;
  autoSignPending?: boolean;
};

export function ReviewTransactionPreview({
  preview,
  previewMatchesSelectedAction,
  lastActionLabel,
  autoSignPending = false,
  compact = false
}: ReviewTransactionPreviewProps) {
  const i18n = useTranslations("ComponentsUserReviewPanelPreview");

  // No early `return null` for a missing preview. Removing the whole card collapsed the
  // rail by its full height the moment the reader switched tabs, and left the primary
  // button looking exactly as ready with nothing built as it does beside a built one.
  return (
    <AnimatedContent className={cn("space-y-4", compact && "space-y-3")} distance={18}>
      {!preview && autoSignPending ? (
        <FadeContent role="status" className="text-xs leading-relaxed text-muted-foreground">
          {i18n("yourWalletWillOpenAutomaticallyToSign")}
        </FadeContent>
      ) : null}
      {preview && !previewMatchesSelectedAction ? (
        <FadeContent className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-muted-foreground">
          {i18n("theSavedTransactionDetailsBelongTo")} <span className="font-medium text-foreground">{lastActionLabel}</span>{i18n("continueAgainToRefreshThemForThisAction")}
        </FadeContent>
      ) : null}
      {preview && previewMatchesSelectedAction && preview.warnings && preview.warnings.length > 0 ? (
        <FadeContent className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-100">
          <p className="font-medium">{i18n("headsUpBeforeYouSign")}</p>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-amber-100/90">
            {preview.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </FadeContent>
      ) : null}
      {/*
        No box of its own, and no action badge. The badge printed `definition.shortLabel`
        under a primary button reading "Confirm <label>", under a card with the same title.
        The box made one short sentence look like a fourth card in the rail; the sentence
        now reads as the last line of the step block above it.
      */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("text-sm", preview ? "text-foreground/90" : "text-muted-foreground")}>
            {/*
              "Ready to sign." on its own. It used to append `definition.outcome`, which
              the configuration card in the middle column prints in full on the same
              screen ("Saves the schedule. Paying what it owes is a separate step."). This
              line's news is the state change, not the action's description, and the
              receipt above it already lists what the built transaction does.
            */}
            {preview ? i18n("readyToSign") : i18n("notBuiltYet")}
          </span>
        </div>
      </div>
    </AnimatedContent>
  );
}
