"use client";
import { useAtomValue } from "jotai";
import { Loader2, Repeat } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AdaAmountInput } from "@/components/user/workspace/editors/config-form-primitives";

import { resolveAssetIdentity } from "@/lib/cardano-assets";
import { readOptionalInteger } from "@/lib/contracts/plutus-primitives";
import {
  computeStreamingPaymentRemainingObligation,
  formatLovelaceAsAda,
  parseAdaToLovelace } from "@/lib/user-flow/guided-helpers";
import { getValidityWindow } from "@/lib/mesh/transactions";
import { FocusedTaskSurface, InlineFieldError } from "@/components/user/workspace/editors";
import { GUIDED_ADMIN_TASKS } from "@/components/user/workspace/guided-admin-catalog";
import {
  countFieldErrorMessages,
  formatTimestampLabel,
  getFirstFieldError } from "@/components/user/workspace/helpers";
import { lockedContractUtxosLoadingAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";
import { activeInferredSttStateFormAtom } from "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms";
import { streamingPayoutAmountIsSelected } from "@/components/user/workspace/atoms/workspace-transfer-derivations.atoms";
import { renderNowMsAtom } from "@/components/user/workspace/atoms/workspace-ui.atoms";
import {
  STREAMING_PAYOUT_COOLDOWN_MINUTES,
  deriveStreamingPayoutCooldown,
  deriveStreamingPaymentRowStatus,
  type StreamingPaymentRowStatus } from "@/components/user/workspace/streaming-payment-status";
import { useConfigSttSpendState } from "@/components/user/workspace/use-config-sttspend-state";

// The badge variant is the state's second channel after the word: amber only when
// the reader must act (a stopped payment still owes), sky for the future, green
// for a healthy accruing payment, and muted grey for one leaving the wallet.
const STATUS_BADGE_VARIANT: Record<StreamingPaymentRowStatus["kind"], "outline" | "warning" | "info" | "success"> = {
  finished: "outline",
  ended: "warning",
  upcoming: "info",
  active: "success"
};

// The form echoes the on-chain option verbatim so it round-trips through edits
// (see state-form.ts). A datum that fails to parse must not fabricate a
// cooldown, and a missing note only costs information: the builder still
// fast-fails a doomed transaction exactly as before.
function readLastNonAdminPayoutAtMs(lastNonAdminPayoutAt: unknown): number | null {
  try {
    return readOptionalInteger(
      lastNonAdminPayoutAt as Parameters<typeof readOptionalInteger>[0],
      "state.last_non_admin_payout_at"
    );
  } catch {
    return null;
  }
}

export function SttSpendPayoutView() {
  const i18n = useTranslations("ComponentsUserWorkspaceConfigSttspendPayoutView");
  const lockedContractUtxosLoading = useAtomValue(lockedContractUtxosLoadingAtom);
  const renderNowMs = useAtomValue(renderNowMsAtom);
  const inferredStateForm = useAtomValue(activeInferredSttStateFormAtom);
  const {
    streamingPaymentPayoutRows,
    activeFieldErrors,
    resolvedSelectedTask,
    handleFocusedTaskSelect,
    guidedStreamingPaymentTaskBadges,
    guidedStreamingPaymentsDisabledTasks,
    setStreamingPaymentPayoutAmounts,
    sttAuthorityPath
  } = useConfigSttSpendState();

  // The display clock seeds in a mount effect (use-workspace-foundation.ts), so the
  // first paint has 0. Time-derived badges, tiles and notes wait one frame rather
  // than flashing wrong states ("Not started" for everything).
  const clockReady = renderNowMs > 0;
  // Referenced against the same validity-window lower bound the builder gates on
  // (`assertNonAdminStreamingActionWindow`), so the note never clears before the
  // payout would actually be accepted. The builder still re-checks either way.
  // Before the clock seeds there is no window: `getValidityWindow(0)` produces a
  // negative lower bound that the cooldown reader rejects, so gate it on ready.
  const cooldown = deriveStreamingPayoutCooldown({
    lastNonAdminPayoutAtMs: readLastNonAdminPayoutAtMs(inferredStateForm.lastNonAdminPayoutAt),
    authorityPath: sttAuthorityPath,
    txEarliestTimeMs: clockReady ? getValidityWindow(renderNowMs).earliestTimeMs : 0,
    nowMs: renderNowMs
  });
  const rows = streamingPaymentPayoutRows;
  const payingCount = rows.filter(
    (row) => row.cleanupRequired || streamingPayoutAmountIsSelected(row.configuredAmount)
  ).length;

  return (
    <FocusedTaskSurface
      title={i18n("scheduledPayments")}
      description={i18n("payOutWhatYourScheduledPaymentsHaveBuilt")}
      icon={Repeat}
      tasks={GUIDED_ADMIN_TASKS.filter((task) => task.group === "streamingPayments")}
      selectedTask={resolvedSelectedTask}
      onSelectTask={handleFocusedTaskSelect}
      badgeByTask={guidedStreamingPaymentTaskBadges}
      disabledTaskIds={guidedStreamingPaymentsDisabledTasks}
      issueCount={countFieldErrorMessages(activeFieldErrors)}
    >
      <div className="space-y-4 rounded-lg border border-border/60 bg-background/40 p-3 sm:p-4">
        <div className="space-y-1">
          <Label>{i18n("payOutWhatHasBuiltUp")}</Label>
          <p className="text-xs text-muted-foreground">
            {i18n("tickThePeopleYouWantToPayNow")}
          </p>
        </div>
        {cooldown.blocked && clockReady ? (
          /* Advisory only, matching the payee surface's note: the transaction
             builder still enforces the gate and fails a too-early payout. */
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            {i18n("payoutCooldownValue1Value2", {
              value1: STREAMING_PAYOUT_COOLDOWN_MINUTES,
              value2: formatTimestampLabel(cooldown.retryAtMs)
            })}
          </div>
        ) : null}
        {rows.length === 0 ? (
          lockedContractUtxosLoading ? (
            <p className="inline-flex items-center gap-2 rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              {i18n("readingThisWalletSScheduledPayments")}
            </p>
          ) : (
            <p className="rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
              {i18n("thisWalletHasNoScheduledPaymentsSoThere")}
            </p>
          )
        ) : (
          <div className="space-y-3">
            {/* The one change a screen reader most needs told without tabbing
                through rows: which payments this payout will carry. */}
            {clockReady ? (
              <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
                {i18n("tickingValue1OfValue2ScheduledPayments", {
                  value1: payingCount,
                  value2: rows.length
                })}
              </p>
            ) : null}
            {rows.map((row, index) => {
              const selectedAmount = row.configuredAmount;
              const isSelected = streamingPayoutAmountIsSelected(selectedAmount);
              const isCleanup = row.cleanupRequired;
              const status = clockReady
                ? deriveStreamingPaymentRowStatus({
                    cleanupRequired: isCleanup,
                    startDateMs: Number(row.streamingPayment.startDate || "0"),
                    endDateMs: Number(row.streamingPayment.endDate || "0"),
                    nowMs: renderNowMs
                  })
                : null;

              return (
                <div
                  key={`streaming-payment-payout-${row.streamingPayment.id}`}
                  className="user-surface user-list-item rounded-md border border-border/60 bg-muted/20 p-3"
                >
                  <div className="flex w-full flex-wrap items-start gap-x-3 gap-y-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="font-medium text-foreground">
                        {/* The on-chain id starts at 0, which read as "nothing to
                            pay" next to the "1 payment" tab badge; count like the
                            other lists do. */}
                        {i18n("scheduledPayment")} {index + 1}
                      </p>
                      {/* A bech32 address is one unbroken ~100-character token; without
                          break-all it pushes past the row instead of wrapping. */}
                      <p className="break-all text-xs text-muted-foreground">
                        {row.streamingPayment.payoutAddress || i18n("nobodyToPay")}
                      </p>
                    </div>
                    <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                      {status ? (
                        <Badge variant={STATUS_BADGE_VARIANT[status.kind]}>
                          {status.kind === "finished"
                            ? i18n("finished")
                            : status.kind === "ended"
                              ? i18n("ended")
                              : status.kind === "upcoming"
                                ? i18n("notStarted")
                                : i18n("active")}
                        </Badge>
                      ) : null}
                      {isSelected ? <Badge variant="secondary">{i18n("payingNow")}</Badge> : null}
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                      {i18n("assetLabel")} {resolveAssetIdentity(row.unit).symbol}
                    </div>
                    <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                      {i18n("accrues")}{" "}
                      {row.unit === "lovelace"
                        ? i18n("aboutValue1AdaPerDay", { value1: formatLovelaceAsAda(row.streamingPayment.amountPerDay) })
                        : i18n("aboutValue1Value2PerDay", { value1: row.streamingPayment.amountPerDay, value2: resolveAssetIdentity(row.unit).symbol })}
                    </div>
                    <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                      {i18n("paidSoFar")}{" "}
                      {row.unit === "lovelace"
                        ? i18n("value1Ada", { value1: formatLovelaceAsAda(row.streamingPayment.paidOutAmount) })
                        : i18n("value1Value2", { value1: row.streamingPayment.paidOutAmount, value2: resolveAssetIdentity(row.unit).symbol })}
                    </div>
                    {clockReady && status?.kind !== "upcoming" ? (
                      /* Hidden on a not-yet-started payment: the obligation there is
                         the whole lifetime, which would contradict the "nothing is
                         owed yet" sentence below. The sentence carries that state. */
                      <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                        {i18n("stillOwed")}{" "}
                        {row.unit === "lovelace"
                          ? i18n("value1Ada", {
                              value1: formatLovelaceAsAda(
                                computeStreamingPaymentRemainingObligation(row.streamingPayment, renderNowMs)
                              )
                            })
                          : i18n("value1Value2", {
                              value1: computeStreamingPaymentRemainingObligation(row.streamingPayment, renderNowMs),
                              value2: resolveAssetIdentity(row.unit).symbol
                            })}
                      </div>
                    ) : null}
                    <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                      {i18n("starts")} {formatTimestampLabel(Number(row.streamingPayment.startDate || "0"))}
                    </div>
                    <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                      {i18n("stops")} {formatTimestampLabel(Number(row.streamingPayment.endDate || "0"))}
                    </div>
                  </div>
                  {/* Two placed rows on md+: the amount label sits in its own row
                      above the input, so the checkbox, the "Due now" chip and the
                      input share one centred line. A single row with items-center
                      centred the one-line chip and checkbox against the whole
                      label+input column, which left them floating between the two
                      lines. On mobile the four cells stack in DOM order. */}
                  <div className="mt-3 grid items-center gap-3 md:grid-cols-[auto_minmax(0,1fr)_220px] md:gap-y-1">
                    <label className="inline-flex items-center gap-2 text-sm text-foreground md:col-start-1 md:row-start-2">
                      <input
                        type="checkbox"
                        checked={isSelected || isCleanup}
                        disabled={isCleanup}
                        onChange={(event) =>
                          setStreamingPaymentPayoutAmounts((current) => ({
                            ...current,
                            [row.streamingPayment.id]: event.target.checked
                              ? row.dueAmount
                              : "0"
                          }))
                        }
                      />
                      {isCleanup
                        ? i18n("closingThisFinishedPayment")
                        : i18n("payThisOneNow")}
                    </label>
                    <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground md:col-start-2 md:row-start-2">
                      {i18n("dueNow")}{" "}
                      {row.unit === "lovelace"
                        ? i18n("value1Ada", { value1: formatLovelaceAsAda(row.dueAmount) })
                        : i18n("value1Value2", { value1: row.dueAmount, value2: resolveAssetIdentity(row.unit).symbol })}
                    </div>
                    <div className="md:col-start-3 md:row-start-1">
                      <Label htmlFor={`streaming-payment-amount-${row.streamingPayment.id}`}>
                        {row.unit === "lovelace"
                          ? i18n("payoutAmountAda")
                          : i18n("payoutAmount")}
                      </Label>
                    </div>
                    <div className="md:col-start-3 md:row-start-2">
                      {row.unit === "lovelace" ? (
                        <AdaAmountInput
                          id={`streaming-payment-amount-${row.streamingPayment.id}`}
                          value={selectedAmount}
                          onChange={(text) =>
                            setStreamingPaymentPayoutAmounts((current) => ({
                              ...current,
                              [row.streamingPayment.id]: parseAdaToLovelace(text) ?? "0"
                            }))
                          }
                        />
                      ) : (
                        <Input
                          id={`streaming-payment-amount-${row.streamingPayment.id}`}
                          type="text"
                          inputMode="numeric"
                          value={selectedAmount}
                          onChange={(event) =>
                            setStreamingPaymentPayoutAmounts((current) => ({
                              ...current,
                              [row.streamingPayment.id]: event.target.value
                            }))
                          }
                        />
                      )}
                    </div>
                  </div>
                  {/*
                   * A settled entry's tick box is on and locked, which looked
                   * arbitrary. The validator requires it: a payment is removed
                   * from the wallet once it has matured or is fully settled, and
                   * a settled removal "owes 0"
                   * (`smart-contract/lib/streaming_payments/payout.ak:156-172`).
                   * Leaving it in would wedge the payout for the whole wallet.
                   */}
                  {status?.kind === "finished" ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {i18n("thisPaymentHasPaidOutEverythingItOwed")}
                    </p>
                  ) : null}
                  {status?.kind === "ended" ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {i18n("endedStillOwedValue1", {
                        value1: formatTimestampLabel(status.endDateMs)
                      })}
                    </p>
                  ) : null}
                  {status?.kind === "upcoming" ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {i18n("nothingOwedYetValue1", {
                        value1: formatTimestampLabel(status.startDateMs)
                      })}
                    </p>
                  ) : null}
                  <InlineFieldError
                    message={getFirstFieldError(
                      activeFieldErrors,
                      `Scheduled payment ${index + 1}`
                    )}
                  />
                </div>
              );
            })}
          </div>
        )}
        <InlineFieldError
          message={getFirstFieldError(activeFieldErrors, "Scheduled payment payout")}
        />
      </div>
    </FocusedTaskSurface>
  );
}
