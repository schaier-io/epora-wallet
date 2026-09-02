import { useTranslations } from "next-intl";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Info,
  Loader2,
  RefreshCw,
  Sparkles
} from "lucide-react";
import type { BuildResult } from "@/lib/types/contracts";
import {
  buildCardanoscanTransactionUrl,
  formatCompactHash
} from "@/components/user/workspace/helpers";
import {
  AnimatedContent,
  FadeContent
} from "@/components/react-bits/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { InfoHint } from "@/components/ui/info-hint";
import {
  isImplicitLockedInputSurfaceLabel,
  type FieldErrors,
  type ReadinessIssue,
  type TaskDefinition
} from "@/components/user/flow-types";
import { cn } from "@/lib/utils/cn";
import { flattenFieldErrors } from "@/components/user/review-panel-parts";
import {
  ReviewActionExplainer,
  ReviewReceiptCard
} from "@/components/user/review-panel-sections";
import { ReviewTransactionPreview } from "@/components/user/review-panel-preview";

// The review rail is 260px wide, so a button in it has about 154px for its label once the
// icon, the gap and `px-4` are paid for. `Button` is `whitespace-nowrap` at a fixed `h-11
// sm:h-10`, so a longer label cannot wrap and cannot shrink: it just grows. "Manage scheduled
// payments" needed 252px inside a 210px row and hung 41.8px past the card's right edge.
// Measured at 1440x900. These utilities let the label take a second line instead, and do nothing
// at all to a label that already fits.
//
// Only the `size="default"` pair below carries it. The completion group beside it is `size="sm"`,
// whose own `h-11 sm:h-9` this would override, and that group renders only after a submit -- a
// state the demo wallet cannot reach, so the change there would ship unmeasured.
const REVIEW_RAIL_BUTTON = "h-auto min-h-11 w-full whitespace-normal py-2 sm:min-h-10";

type ReviewPanelProps = {
  definition: TaskDefinition;
  draftSummary: string;
  draftNextStep: string;
  completion?: ReviewCompletion | null;
  title?: string;
  description?: string;
  receiptTitle?: string;
  receiptSummary?: string;
  receiptItems?: ReviewReceiptItem[];
  contextRows?: Array<{ label: string; value: string | null }>;
  readinessIssues: ReadinessIssue[];
  fieldErrors: FieldErrors;
  preview: BuildResult | null;
  previewMatchesSelectedAction: boolean;
  /** The connected wallet's address: the tx's required signer, shown before signing. */
  signerAddress?: string | null;
  buildError: string | null;
  buildErrorExpected: boolean;
  submitHash: string | null;
  lastActionLabel: string;
  isBuilding: boolean;
  isSubmitting: boolean;
  primaryActionLabel: string;
  primaryActionDisabled: boolean;
  onPrimaryAction: () => void;
  secondaryActionLabel?: string | null;
  secondaryActionDisabled?: boolean;
  onSecondaryAction?: () => void;
  compact?: boolean;
};

export type ReviewReceiptItem = {
  label: string;
  value: string;
  detail?: string | null;
  tone?: "default" | "success" | "warning";
};

export type ReviewCompletion = {
  title: string;
  description: string;
  statusLabel: string;
  progress: number;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
};

export function UserReviewPanel({
  definition,
  draftSummary,
  draftNextStep,
  completion,
  title,
  description,
  receiptTitle = "What will happen",
  receiptSummary,
  receiptItems = [],
  contextRows = [],
  readinessIssues,
  fieldErrors,
  preview,
  previewMatchesSelectedAction,
  signerAddress,
  buildError,
  buildErrorExpected,
  submitHash,
  lastActionLabel,
  isBuilding,
  isSubmitting,
  primaryActionLabel,
  primaryActionDisabled,
  onPrimaryAction,
  secondaryActionLabel,
  secondaryActionDisabled = false,
  onSecondaryAction,
  compact = false
}: ReviewPanelProps) {
  const i18n = useTranslations("ComponentsUserReviewPanel");
  const resolvedTitle = title ?? i18n("review");
  const resolvedDescription = description ?? i18n("checkWhatSAboutToHappenThenSign");
  const ActionIcon = definition.icon;
  const showSurfaceSummary = !isImplicitLockedInputSurfaceLabel(definition.surfaceLabel);
  const blockingIssues = readinessIssues.filter((issue) => issue.blocking);
  const primaryBlockingIssue = blockingIssues[0] ?? null;
  const allFlattenedErrors = flattenFieldErrors(fieldErrors);
  // Hide field errors that are already surfaced by a blocking readiness issue
  // (same field label) so the review pane shows each problem once.
  const blockingErrorKeys = new Set(
    blockingIssues
      .map((issue) => (typeof issue.label === "string" ? issue.label.trim().toLowerCase() : ""))
      .filter((value) => value.length > 0)
  );
  const flattenedErrors = primaryBlockingIssue
    ? allFlattenedErrors.filter((entry) => !blockingErrorKeys.has(entry.key.trim().toLowerCase()))
    : allFlattenedErrors;
  const primaryActionBusy = isBuilding || isSubmitting;
  const descriptionIsLong = Boolean(resolvedDescription && resolvedDescription.length > 78);
  const hasReceipt = Boolean(receiptSummary || receiptItems.length > 0);
  const completionProgress = completion
    ? Math.max(0, Math.min(100, completion.progress))
    : 0;

  return (
    <Card className="relative overflow-hidden">
      <CardHeader className={compact ? "pb-3" : undefined}>
        <CardTitle className="flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/70 bg-background/60 text-primary">
            <ActionIcon className="h-4.5 w-4.5" />
          </span>
          {resolvedTitle}
          {resolvedDescription && descriptionIsLong ? (
            <InfoHint label={i18n("moreAboutTitle", { title: resolvedTitle })} contentClassName="max-w-sm">
              {resolvedDescription}
            </InfoHint>
          ) : null}
        </CardTitle>
        {resolvedDescription && !descriptionIsLong ? (
          <CardDescription>{resolvedDescription}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className={cn("min-w-0", compact ? "space-y-3" : "space-y-4")}>
        {!hasReceipt ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{definition.label}</Badge>
            {showSurfaceSummary ? (
              <Badge variant="outline">{definition.surfaceLabel}</Badge>
            ) : null}
            {definition.pathLabels.map((label) => (
              <Badge key={`${definition.kind}-${label}`} variant="outline">
                {label}
              </Badge>
            ))}
            <span className="text-sm text-muted-foreground">{draftSummary}</span>
          </div>
        ) : null}
        {hasReceipt ? (
          <ReviewReceiptCard
            receiptTitle={receiptTitle}
            receiptSummary={receiptSummary}
            receiptItems={receiptItems}
            compact={compact}
          />
        ) : (
          <p className="text-sm text-muted-foreground">{definition.outcome}</p>
        )}
        {contextRows.length > 0 ? (
          <dl className="min-w-0 divide-y divide-border/50 rounded-md border border-border/50">
            {contextRows
              .filter((row) => row.value)
              .map((row) => (
                <div
                  key={row.label}
                  className="flex min-w-0 flex-col gap-1 px-3 py-2 sm:flex-row sm:items-start sm:gap-4"
                >
                  <dt className="w-full shrink-0 eyebrow font-medium text-muted-foreground sm:w-40">
                    {row.label}
                  </dt>
                  <dd className="min-w-0 flex-1 break-all text-sm text-foreground">{row.value}</dd>
                </div>
              ))}
          </dl>
        ) : null}
        <div className="rounded-md border border-border/50 bg-muted/10 p-3">
          <p className="eyebrow font-medium text-muted-foreground">
            {i18n("nextStep")}
          </p>
          <p className="mt-1 min-w-0 break-words text-sm text-foreground">
            {/* The draft's own step, not the blocking issue's description: with nothing
                staged both lines said "Add a payout…" -- the same sentence twice in one
                rail, and a third time as the section's inline hint. The attention box
                below owns what is wrong; this line owns what to do about it. */}
            {draftNextStep || primaryBlockingIssue?.description}
          </p>
        </div>
        {!hasReceipt ? (
          <ReviewActionExplainer definition={definition} compact={compact} />
        ) : null}

        {/* Not while a transaction has just been submitted. The workspace clears what it
            sent, so the readiness gate immediately reports the empty form -- and an amber
            "Something needs attention" directly under "Transaction submitted" reads as a
            complaint about the transaction that just succeeded. The `Next step` line above
            carries the draft's own guidance for the same state, in a neutral tone, which is
            the right register for "here is how to start the next one". */}
        {primaryBlockingIssue && !submitHash ? (
          <FadeContent
            blur
            // `aria-live="polite"`, not `role="alert"`. Readiness is recomputed on every
            // keystroke, and `role="alert"` is assertive: it would cut across the user
            // mid-word each time an error appeared or cleared. Polite queues until they
            // pause. `aria-atomic` stays at its default so only the changed line is read,
            // not the heading again.
            aria-live="polite"
            className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 sm:p-4"
          >
            <p className="text-sm font-medium text-foreground">{i18n("somethingNeedsAttention")}</p>
            <p className="mt-2 text-sm text-foreground">{primaryBlockingIssue.label}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {primaryBlockingIssue.description}
            </p>
            {blockingIssues.length > 1 ? (
              <details className="mt-3 rounded-md border border-amber-500/30 bg-black/10 p-3">
                <summary className="cursor-pointer text-xs font-medium text-foreground">
                  {i18n("showAllIssues")}
                </summary>
                <div className="mt-2 space-y-2">
                  {blockingIssues.slice(1).map((issue) => (
                    <p key={issue.id} className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{issue.label}:</span>{" "}
                      {issue.description}
                    </p>
                  ))}
                </div>
              </details>
            ) : null}
          </FadeContent>
        ) : null}

        {flattenedErrors.length > 0 ? (
          <FadeContent
            blur
            // Polite for the same reason as the block above: these errors track the form
            // as it is typed.
            aria-live="polite"
            className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 sm:p-4"
          >
            <p className="text-sm font-medium text-foreground">{i18n("fixTheseFieldsFirst")}</p>
            <div className="mt-2 space-y-2">
              {flattenedErrors.slice(0, 3).map((entry, index) => (
                <p key={`${entry.key}-${index}`} className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{entry.key}:</span>{" "}
                  {entry.message}
                </p>
              ))}
            </div>
            {flattenedErrors.length > 3 ? (
              <details className="mt-3 rounded-md border border-amber-500/30 bg-black/10 p-3">
                <summary className="cursor-pointer text-xs font-medium text-foreground">
                  {i18n("showAllFieldIssues")}
                </summary>
                <div className="mt-2 space-y-2">
                  {flattenedErrors.slice(3).map((entry, index) => (
                    <p
                      key={`${entry.key}-extra-${index}`}
                      className="text-xs text-muted-foreground"
                    >
                      <span className="font-medium text-foreground">{entry.key}:</span>{" "}
                      {entry.message}
                    </p>
                  ))}
                </div>
              </details>
            ) : null}
          </FadeContent>
        ) : null}

        {buildError ? (
          <FadeContent
            // `role="alert"` here, assertive on purpose: this is an event, not a running
            // commentary. The build the user just asked for failed, and nothing else they
            // are doing matters more than knowing that.
            role="alert"
            className={cn(
              "space-y-2 rounded-lg border p-3 sm:p-4 text-sm",
              buildErrorExpected
                ? "border-sky-500/30 bg-sky-500/10 text-sky-100"
                : "border-rose-500/40 bg-rose-500/10 text-rose-100"
            )}
          >
            <div className="inline-flex items-center gap-2">
              {/* A recognised outcome (a declined signature, a named ledger rule) gets a
                  calm note; something genuinely unexpected gets the alarm. Either way the
                  serialized error is printed to the browser console, never rendered here. */}
              {buildErrorExpected ? (
                <Info className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <span>{buildError}</span>
            </div>
          </FadeContent>
        ) : null}

        {submitHash && completion ? (
          <AnimatedContent
            // The one thing a person most needs told without looking: the transaction went.
            role="status"
            aria-live="polite"
            className="overflow-hidden rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 sm:p-4 text-sm text-emerald-100"
            distance={12}
            blur
          >
            <div className="flex min-w-0 items-start gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-300/30 bg-emerald-400/15 text-emerald-100">
                <Sparkles className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1 space-y-3">
                <div className="space-y-1">
                  <p className="font-semibold text-emerald-50">{completion.title}</p>
                  <p className="text-xs leading-relaxed text-emerald-100/85">
                    {completion.description}
                  </p>
                </div>
                <pre
                  aria-hidden
                  className="select-none overflow-hidden rounded-lg border border-emerald-300/20 bg-black/20 px-3 py-2 font-mono text-[11px] leading-snug text-emerald-100/80"
                >
{i18n("walletOkChain")}
                </pre>
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="min-w-0 break-words text-emerald-100/90">
                      {completion.statusLabel}
                    </span>
                    <span className="shrink-0 font-mono text-emerald-100/80">
                      {Math.round(completionProgress)}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-emerald-950/60">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-300 via-cyan-200 to-emerald-100 transition-[width] duration-700 ease-out"
                      style={{ width: `${completionProgress}%` }}
                    />
                  </div>
                </div>
                {/* Same chip as the non-completion branch below: a bare hash is readable
                    nowhere but an explorer, and the celebration is exactly when the reader
                    wants proof the chain accepted it. */}
                <a
                  href={buildCardanoscanTransactionUrl(submitHash)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300/30 bg-emerald-400/10 px-2 py-1 font-mono text-xs text-emerald-50 transition-colors hover:border-emerald-300/60 hover:bg-emerald-400/20"
                  title={i18n("viewTransactionOnCardanoscan")}
                >
                  {formatCompactHash(submitHash)}
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
                {completion.actionLabel && completion.onAction ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={completion.onAction}
                    >
                      {completion.actionLabel}
                    </Button>
                    {completion.secondaryActionLabel && completion.onSecondaryAction ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={completion.onSecondaryAction}
                      >
                        {completion.secondaryActionLabel}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </AnimatedContent>
        ) : submitHash ? (
          <FadeContent
            role="status"
            aria-live="polite"
            className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 sm:p-4 text-sm text-emerald-100"
          >
            <div className="flex min-w-0 items-start gap-2.5">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
              <div className="min-w-0 flex-1 space-y-2">
                <div>
                  <p className="font-medium text-emerald-50">{i18n("transactionSubmitted")}</p>
                  <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-emerald-100/80">
                    <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                    {i18n("confirmingOnChainYourBalanceUpdatesAfterThe")}
                  </p>
                </div>
                <a
                  href={buildCardanoscanTransactionUrl(submitHash)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300/30 bg-emerald-400/10 px-2 py-1 font-mono text-xs text-emerald-50 transition-colors hover:border-emerald-300/60 hover:bg-emerald-400/20"
                  title={i18n("viewTransactionOnCardanoscan")}
                >
                  {formatCompactHash(submitHash)}
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </div>
            </div>
          </FadeContent>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={onPrimaryAction}
            disabled={primaryActionDisabled}
            className={REVIEW_RAIL_BUTTON}
          >
            {primaryActionBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {!primaryActionBusy ? (
              <ArrowRight className="h-4 w-4" />
            ) : null}
            {primaryActionLabel}
          </Button>
          {secondaryActionLabel && onSecondaryAction ? (
            <Button
              type="button"
              variant="secondary"
              onClick={onSecondaryAction}
              disabled={secondaryActionDisabled}
              className={REVIEW_RAIL_BUTTON}
            >
              <RefreshCw className="h-4 w-4" />
              {secondaryActionLabel}
            </Button>
          ) : null}
        </div>

        {submitHash ? null : (
          <ReviewTransactionPreview
            compact={compact}
            definition={definition}
            preview={preview}
            previewMatchesSelectedAction={previewMatchesSelectedAction}
            lastActionLabel={lastActionLabel}
            signerAddress={signerAddress}
          />
        )}
      </CardContent>
    </Card>
  );
}
