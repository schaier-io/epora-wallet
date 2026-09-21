import { useTranslations } from "next-intl";
import type { BuildResult } from "@/lib/types/contracts";
import {
  AnimatedContent,
  FadeContent
} from "@/components/react-bits/primitives";
import { Badge } from "@/components/ui/badge";
import { type TaskDefinition } from "@/components/user/flow-types";
import { cn } from "@/lib/utils/cn";

type ReviewTransactionPreviewProps = {
  definition: TaskDefinition;
  preview: BuildResult | null;
  previewMatchesSelectedAction: boolean;
  lastActionLabel: string;
  compact?: boolean;
  autoSignPending?: boolean;
};

export function ReviewTransactionPreview({
  definition,
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
      <div
        className={cn(
          "rounded-lg border border-border/60 bg-background/40",
          compact ? "p-3" : "p-3 sm:p-4"
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={preview ? "secondary" : "outline"}>{definition.shortLabel}</Badge>
          <span className={cn("text-sm", preview ? "text-foreground/90" : "text-muted-foreground")}>
            {preview ? (
              <>
                {i18n("readyToSign")} {definition.outcome}
              </>
            ) : (
              i18n("notBuiltYet")
            )}
          </span>
        </div>
      </div>
    </AnimatedContent>
  );
}
