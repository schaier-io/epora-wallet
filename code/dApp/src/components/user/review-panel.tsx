import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
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
import { Separator } from "@/components/ui/separator";
import {
  isImplicitLockedInputSurfaceLabel,
  type FieldErrors,
  type ReadinessIssue,
  type TaskDefinition
} from "@/components/user/flow-types";
import { cn } from "@/lib/utils/cn";
import { AnimatedMetricValue, flattenFieldErrors, formatByteCount, formatIntegerUnits, formatUsagePercent, formatValidatorTitle, parseSafeIntegerCount } from "@/components/user/review-panel-parts";
import { ReviewActionExplainer, ReviewReceiptCard } from "@/components/user/review-panel-sections";

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
  buildError: string | null;
  buildErrorDetails: string | null;
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
  title = "Review",
  description = "Check what's about to happen, then sign in your wallet.",
  receiptTitle = "What will happen",
  receiptSummary,
  receiptItems = [],
  contextRows = [],
  readinessIssues,
  fieldErrors,
  preview,
  previewMatchesSelectedAction,
  buildError,
  buildErrorDetails,
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
  const descriptionIsLong = Boolean(description && description.length > 78);
  const hasReceipt = Boolean(receiptSummary || receiptItems.length > 0);
  const completionProgress = completion
    ? Math.max(0, Math.min(100, completion.progress))
    : 0;

  return (
    <Card className="relative overflow-hidden">
      <CardHeader className={compact ? "pb-3" : undefined}>
        <CardTitle className="flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/70 bg-background/60 text-primary">
            <ActionIcon className="h-4.5 w-4.5" />
          </span>
          {title}
          {description && descriptionIsLong ? (
            <InfoHint label={`More about ${title}`} contentClassName="max-w-sm">
              {description}
            </InfoHint>
          ) : null}
        </CardTitle>
        {description && !descriptionIsLong ? <CardDescription>{description}</CardDescription> : null}
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
                  className="flex min-w-0 flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-start sm:gap-4"
                >
                  <dt className="w-full shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:w-40">
                    {row.label}
                  </dt>
                  <dd className="min-w-0 flex-1 break-all text-sm text-foreground">{row.value}</dd>
                </div>
              ))}
          </dl>
        ) : null}
        <div className="rounded-md border border-border/50 bg-muted/10 px-3 py-2.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Next step
          </p>
          <p className="mt-1 min-w-0 break-words text-sm text-foreground">
            {primaryBlockingIssue?.description ?? draftNextStep}
          </p>
        </div>
        {!hasReceipt ? (
          <ReviewActionExplainer definition={definition} compact={compact} />
        ) : null}

        {primaryBlockingIssue ? (
          <FadeContent blur className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
            <p className="text-sm font-medium text-foreground">Something needs attention</p>
            <p className="mt-2 text-sm text-foreground">{primaryBlockingIssue.label}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {primaryBlockingIssue.description}
            </p>
            {blockingIssues.length > 1 ? (
              <details className="mt-3 rounded border border-amber-500/30 bg-black/10 p-3">
                <summary className="cursor-pointer text-xs font-medium text-foreground">
                  Show all issues
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
          <FadeContent blur className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
            <p className="text-sm font-medium text-foreground">Fix these fields first</p>
            <div className="mt-2 space-y-2">
              {flattenedErrors.slice(0, 3).map((entry, index) => (
                <p key={`${entry.key}-${index}`} className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{entry.key}:</span>{" "}
                  {entry.message}
                </p>
              ))}
            </div>
            {flattenedErrors.length > 3 ? (
              <details className="mt-3 rounded border border-amber-500/30 bg-black/10 p-3">
                <summary className="cursor-pointer text-xs font-medium text-foreground">
                  Show all field issues
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
          <FadeContent className="space-y-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            <div className="inline-flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              <span>{buildError}</span>
            </div>
            {buildErrorDetails ? (
              <details className="rounded border border-rose-500/30 bg-black/20 p-2">
                <summary className="cursor-pointer text-xs font-medium text-rose-100">
                  Debug details
                </summary>
                <pre className="mt-2 max-h-[260px] overflow-auto text-[11px] text-rose-100">
                  {buildErrorDetails}
                </pre>
              </details>
            ) : null}
          </FadeContent>
        ) : null}

        {submitHash && completion ? (
          <AnimatedContent
            className="overflow-hidden rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-100"
            distance={12}
            blur
          >
            <div className="flex min-w-0 items-start gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-300/30 bg-emerald-400/15 text-emerald-100">
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
{`  *  .  *
+-----------+
| WALLET OK |
+-----------+
    -> chain`}
                </pre>
                <div className="space-y-1.5">
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
                <p className="break-all font-mono text-xs leading-relaxed text-emerald-100/75">
                  {submitHash}
                </p>
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
          <FadeContent className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            <div className="flex min-w-0 items-start gap-2.5">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
              <div className="min-w-0 flex-1 space-y-2">
                <div>
                  <p className="font-medium text-emerald-50">Transaction submitted</p>
                  <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-emerald-100/80">
                    <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                    Confirming on-chain — your balance updates after the next block.
                  </p>
                </div>
                <a
                  href={buildCardanoscanTransactionUrl(submitHash)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300/30 bg-emerald-400/10 px-2 py-1 font-mono text-xs text-emerald-50 transition-colors hover:border-emerald-300/60 hover:bg-emerald-400/20"
                  title="View transaction on Cardanoscan"
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
            >
              <RefreshCw className="h-4 w-4" />
              {secondaryActionLabel}
            </Button>
          ) : null}
        </div>

        {submitHash ? null : !preview ? (
          <FadeContent className="text-sm text-muted-foreground">
            Your wallet will open automatically to sign.
          </FadeContent>
        ) : (
          <AnimatedContent className={cn("space-y-4", compact && "space-y-3")} distance={18}>
            {!previewMatchesSelectedAction ? (
              <FadeContent className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-muted-foreground">
                The saved transaction details belong to <span className="font-medium text-foreground">{lastActionLabel}</span>.
                Continue again to refresh them for this action.
              </FadeContent>
            ) : null}
            {previewMatchesSelectedAction && preview.warnings && preview.warnings.length > 0 ? (
              <FadeContent className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-100">
                <p className="font-medium">Heads up before you sign</p>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-amber-100/90">
                  {preview.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </FadeContent>
            ) : null}
            <div className="rounded-lg border border-border/60 bg-background/40 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{definition.shortLabel}</Badge>
                <span className="text-sm text-foreground/90">
                  Ready to sign. {definition.outcome}
                </span>
              </div>
              {preview.preview.summary ? (
                <details className="mt-3 rounded-md border border-border/50 bg-muted/15 px-3 py-2 text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Technical summary
                  </summary>
                  <p className="mt-2 break-all font-mono text-[11px] leading-relaxed text-muted-foreground">
                    {preview.preview.summary}
                  </p>
                </details>
              ) : null}
              {preview.preview.txSize ? (
                <div className="mt-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    Transaction size
                  </p>
                  <p className="mt-2 text-sm text-foreground">
                    <AnimatedMetricValue
                      numericValue={preview.preview.txSize.usedBytes}
                      fallback={formatByteCount(preview.preview.txSize.usedBytes)}
                      formatter={(value) => formatByteCount(Math.round(value))}
                    />{" "}
                    /{" "}
                    <AnimatedMetricValue
                      numericValue={preview.preview.txSize.maxBytes}
                      fallback={formatByteCount(preview.preview.txSize.maxBytes)}
                      formatter={(value) => formatByteCount(Math.round(value))}
                    />{" "}
                    bytes (
                    <AnimatedMetricValue
                      numericValue={
                        Number.isFinite(Number(preview.preview.txSize.percentage))
                          ? Number(preview.preview.txSize.percentage)
                          : null
                      }
                      fallback={preview.preview.txSize.percentage.toString()}
                      formatter={(value) => Math.round(value).toString()}
                      duration={780}
                    />
                    %)
                  </p>
                </div>
              ) : null}
            </div>

            {preview.executionUnits ? (
              <details className="rounded-lg border border-border/60 bg-black/20 p-4 text-xs">
                <summary className="cursor-pointer text-sm font-medium text-foreground">
                  Execution details
                </summary>
                <div className="mt-3 space-y-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">Memory</p>
                      <p className="text-muted-foreground">
                        <AnimatedMetricValue
                          numericValue={parseSafeIntegerCount(preview.executionUnits.memUsed)}
                          fallback={formatIntegerUnits(preview.executionUnits.memUsed)}
                          formatter={(value) => formatIntegerUnits(Math.round(value).toString())}
                        />{" "}
                        /{" "}
                        <AnimatedMetricValue
                          numericValue={parseSafeIntegerCount(preview.executionUnits.maxTxMem)}
                          fallback={formatIntegerUnits(preview.executionUnits.maxTxMem)}
                          formatter={(value) => formatIntegerUnits(Math.round(value).toString())}
                        />{" "}
                        tx max (
                        {formatUsagePercent(
                          preview.executionUnits.memUsed,
                          preview.executionUnits.maxTxMem
                        )}
                        %)
                      </p>
                      <p className="text-muted-foreground">
                        <AnimatedMetricValue
                          numericValue={parseSafeIntegerCount(preview.executionUnits.memUsed)}
                          fallback={formatIntegerUnits(preview.executionUnits.memUsed)}
                          formatter={(value) => formatIntegerUnits(Math.round(value).toString())}
                        />{" "}
                        /{" "}
                        <AnimatedMetricValue
                          numericValue={parseSafeIntegerCount(preview.executionUnits.maxBlockMem)}
                          fallback={formatIntegerUnits(preview.executionUnits.maxBlockMem)}
                          formatter={(value) => formatIntegerUnits(Math.round(value).toString())}
                        />{" "}
                        block max (
                        {formatUsagePercent(
                          preview.executionUnits.memUsed,
                          preview.executionUnits.maxBlockMem
                        )}
                        %)
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">Cycles</p>
                      <p className="text-muted-foreground">
                        <AnimatedMetricValue
                          numericValue={parseSafeIntegerCount(preview.executionUnits.stepsUsed)}
                          fallback={formatIntegerUnits(preview.executionUnits.stepsUsed)}
                          formatter={(value) => formatIntegerUnits(Math.round(value).toString())}
                        />{" "}
                        /{" "}
                        <AnimatedMetricValue
                          numericValue={parseSafeIntegerCount(preview.executionUnits.maxTxSteps)}
                          fallback={formatIntegerUnits(preview.executionUnits.maxTxSteps)}
                          formatter={(value) => formatIntegerUnits(Math.round(value).toString())}
                        />{" "}
                        tx max (
                        {formatUsagePercent(
                          preview.executionUnits.stepsUsed,
                          preview.executionUnits.maxTxSteps
                        )}
                        %)
                      </p>
                      <p className="text-muted-foreground">
                        <AnimatedMetricValue
                          numericValue={parseSafeIntegerCount(preview.executionUnits.stepsUsed)}
                          fallback={formatIntegerUnits(preview.executionUnits.stepsUsed)}
                          formatter={(value) => formatIntegerUnits(Math.round(value).toString())}
                        />{" "}
                        /{" "}
                        <AnimatedMetricValue
                          numericValue={parseSafeIntegerCount(preview.executionUnits.maxBlockSteps)}
                          fallback={formatIntegerUnits(preview.executionUnits.maxBlockSteps)}
                          formatter={(value) => formatIntegerUnits(Math.round(value).toString())}
                        />{" "}
                        block max (
                        {formatUsagePercent(
                          preview.executionUnits.stepsUsed,
                          preview.executionUnits.maxBlockSteps
                        )}
                        %)
                      </p>
                    </div>
                  </div>
                  {preview.executionUnits.perValidator.length > 0 ? (
                    <div className="space-y-2">
                      <p className="font-medium text-foreground">Per validator</p>
                      <div className="space-y-2">
                        {preview.executionUnits.perValidator.map((usage) => (
                          <div
                            key={usage.validator}
                            className="rounded-lg border border-border/60 bg-background/30 p-3"
                          >
                            <p className="font-medium text-foreground">
                              {formatValidatorTitle(usage.validator)}
                            </p>
                            <p className="mt-1 text-muted-foreground">
                              Memory:{" "}
                              <AnimatedMetricValue
                                numericValue={parseSafeIntegerCount(usage.memUsed)}
                                fallback={formatIntegerUnits(usage.memUsed)}
                                formatter={(value) => formatIntegerUnits(Math.round(value).toString())}
                                duration={800}
                              />{" "}
                              | Cycles:{" "}
                              <AnimatedMetricValue
                                numericValue={parseSafeIntegerCount(usage.stepsUsed)}
                                fallback={formatIntegerUnits(usage.stepsUsed)}
                                formatter={(value) => formatIntegerUnits(Math.round(value).toString())}
                                duration={800}
                              />{" "}
                              | Redeemers:{" "}
                              <AnimatedMetricValue
                                numericValue={usage.redeemerCount}
                                fallback={usage.redeemerCount.toString()}
                                formatter={(value) => Math.round(value).toString()}
                                duration={700}
                              />
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </details>
            ) : null}

            <Separator />

            <details className="rounded-lg border border-border/60 bg-background/30 p-4">
              <summary className="cursor-pointer text-sm font-medium text-foreground">
                Raw transaction (technical)
              </summary>
              <pre className="mt-3 max-h-[320px] overflow-auto rounded-md border border-border/70 bg-black/30 p-3 text-[11px] font-mono">
                {preview.preview.cbor || "No raw data for this action."}
              </pre>
            </details>
          </AnimatedContent>
        )}
      </CardContent>
    </Card>
  );
}
