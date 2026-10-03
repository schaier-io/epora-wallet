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
  busy?: boolean;
};

export function ReviewTransactionPreview({
  preview,
  previewMatchesSelectedAction,
  lastActionLabel,
  autoSignPending = false,
  busy = false,
  compact = false
}: ReviewTransactionPreviewProps) {
  const i18n = useTranslations("ComponentsUserReviewPanelPreview");

  return (
    <AnimatedContent className={cn("space-y-4", compact && "space-y-3")} distance={18}>
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
      {preview && previewMatchesSelectedAction && !busy && !autoSignPending ? (
        <span className="text-sm text-foreground/90">{i18n("readyToSign")}</span>
      ) : null}
    </AnimatedContent>
  );
}
