import { useTranslations } from "next-intl";
import type { BuildResult } from "@/lib/types/contracts";
import {
  AnimatedContent,
  FadeContent
} from "@/components/react-bits/primitives";
import { Badge } from "@/components/ui/badge";
import { type TaskDefinition } from "@/components/user/flow-types";
import { ReviewCosts } from "@/components/user/review-panel-sections";
import { buildPresignCostRows } from "@/lib/user-flow/presign-costs";
import { cn } from "@/lib/utils/cn";
import { shortenAddress } from "@/lib/utils/explorer";
// Pure constants module (no imports of its own), already imported client-side by
// `workspace/helpers/formatters.ts`. Read directly rather than through the
// internals barrel, which would pull server-only build code into the bundle.
import { VALIDITY_WINDOW_FUTURE_MS } from "@/lib/mesh/transactions/internals/constants";

// The transaction facts this card states are properties of EVERY build, not of one
// transaction, so they come from where the builders get them:
//
// - Signer: `setupTransaction` calls `setRequiredSigners([changeAddress])`, and the
//   change address always resolves from the connected wallet, so the connected
//   wallet holds the tx's required signing credential.
// - Validity: every build seeds `invalidBefore`/`invalidHereafter` from
//   `VALIDITY_WINDOW_PAST_MS`/`VALIDITY_WINDOW_FUTURE_MS` around the build moment;
//   the future edge lands one slot past that offset, so the rendered minutes are
//   the window's floor, not an exact count.
// - Change: Mesh's balanced build returns everything the explicit outputs don't
//   spend to the change address, which is again the connected wallet.
type ReviewTransactionPreviewProps = {
  definition: TaskDefinition;
  preview: BuildResult | null;
  previewMatchesSelectedAction: boolean;
  lastActionLabel: string;
  signerAddress?: string | null;
  /** Browser-wallet lovelace from the last funds refresh; null while loading or unavailable. */
  walletBalanceLovelace?: string | null;
  compact?: boolean;
};

export function ReviewTransactionPreview({
  definition,
  preview,
  previewMatchesSelectedAction,
  lastActionLabel,
  signerAddress,
  walletBalanceLovelace,
  compact = false
}: ReviewTransactionPreviewProps) {
  const i18n = useTranslations("ComponentsUserReviewPanelPreview");
  const validityMinutes = Math.round(VALIDITY_WINDOW_FUTURE_MS / 60_000);

  if (!preview) {
    return (
      <FadeContent className="text-sm text-muted-foreground">
        {i18n("yourWalletWillOpenAutomaticallyToSign")}
      </FadeContent>
    );
  }

  return (
    <AnimatedContent className={cn("space-y-4", compact && "space-y-3")} distance={18}>
      {!previewMatchesSelectedAction ? (
        <FadeContent className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-muted-foreground">
          {i18n("theSavedTransactionDetailsBelongTo")} <span className="font-medium text-foreground">{lastActionLabel}</span>{i18n("continueAgainToRefreshThemForThisAction")}
        </FadeContent>
      ) : null}
      {previewMatchesSelectedAction && preview.warnings && preview.warnings.length > 0 ? (
        <FadeContent className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-100">
          <p className="font-medium">{i18n("headsUpBeforeYouSign")}</p>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-amber-100/90">
            {preview.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </FadeContent>
      ) : null}
      <div className="rounded-lg border border-border/60 bg-background/40 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{definition.shortLabel}</Badge>
          <span className="text-sm text-foreground/90">
            {i18n("readyToSign")} {definition.outcome}
          </span>
        </div>
        <ReviewCosts
          rows={buildPresignCostRows({
            estimatedFeeLovelace: preview.estimatedFeeLovelace,
            walletBalanceLovelace
          })}
        />
        {/* What signing commits the user to beyond the fee, in receipt-row form so the
            card reads as one surface with the receipt above it, not a second list style. */}
        <dl className="mt-3 divide-y divide-border/40 rounded-md border border-border/40 bg-background/30">
          {signerAddress ? (
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2">
              <dt className="eyebrow font-medium text-muted-foreground">{i18n("signer")}</dt>
              {/* `title` carries the full address: the shortened form scans, the hover
                  (and screen reader) get the exact credential being asked for. */}
              <dd
                className="min-w-0 break-words text-right text-xs font-medium text-foreground"
                title={signerAddress}
              >
                {shortenAddress(signerAddress)}
              </dd>
              <dd className="min-w-0 basis-full break-words text-xs leading-snug text-muted-foreground">
                {i18n("signerDetail")}
              </dd>
            </div>
          ) : null}
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2">
            <dt className="eyebrow font-medium text-muted-foreground">{i18n("validity")}</dt>
            <dd className="min-w-0 break-words text-right text-xs font-medium text-foreground">
              {i18n("validityValue", { minutes: validityMinutes })}
            </dd>
            <dd className="min-w-0 basis-full break-words text-xs leading-snug text-muted-foreground">
              {i18n("validityDetail")}
            </dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2">
            <dt className="eyebrow font-medium text-muted-foreground">{i18n("change")}</dt>
            <dd className="min-w-0 break-words text-right text-xs font-medium text-foreground">
              {i18n("changeValue")}
            </dd>
            <dd className="min-w-0 basis-full break-words text-xs leading-snug text-muted-foreground">
              {i18n("changeDetail")}
            </dd>
          </div>
        </dl>
      </div>
    </AnimatedContent>
  );
}
