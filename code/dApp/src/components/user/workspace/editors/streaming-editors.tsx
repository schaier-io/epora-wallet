"use client";
import { useTranslations } from "next-intl";


import { AdaAmountInput } from "./config-form-primitives";
import { GuidedDateTimeField } from "./guided-fields";
import { DisclosureSection, InlineFieldError } from "./primitives";
import { FocusedTaskSurface, TaskEmptyState } from "./task-surface";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type FieldErrors, type UserWorkspaceTask } from "@/components/user/flow-types";
import { GUIDED_ADMIN_TASKS } from "@/components/user/workspace/guided-admin-catalog";
import {
  countFieldErrorMessages,
  formatCountLabel,
  isAdaScheduledPayment,
  scheduledPaymentRateForPeriod,
  withScheduledPaymentAdded,
  withScheduledPaymentRate
} from "@/components/user/workspace/helpers";
import { type StateFormState, type StreamingPaymentFormState } from "@/lib/contracts/state-form";
import { describeAddressProblem, looksLikeCardanoAddress } from "@/lib/contracts/payout-address";
import { formatLovelaceAsAda } from "@/lib/user-flow/guided-helpers";
import { CalendarPlus2, CalendarSearch, Plus, Repeat } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";

// The on-chain rate is per-day. These let the user enter a rate per day/week/
// month/year; we convert to per-day in the background. Months/years use round
// 30/365-day approximations. Per-day stays integer (lovelace), so non-divisible
// rates round down by sub-lovelace amounts.
const RATE_PERIODS = [
  { label: "per day", days: 1 },
  { label: "per week", days: 7 },
  { label: "per month", days: 30 },
  { label: "per year", days: 365 }
] as const;

/** Where the money goes next: the payee collects it on the /payee page, not here. */
function PayeeCollectsHint() {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsStreamingEditors");
  return (
    <p className="text-xs text-muted-foreground">
      {i18n("yourPayeeCollectsThisOnThe")}{" "}
      <Link href="/payee" className="underline underline-offset-2 hover:text-foreground">
        {i18n("paymentsToYouPage")}
      </Link>
    </p>
  );
}

/**
 * A live inline reason the scheduled-payment destination cannot be paid to, or `null`.
 * Gated like the destinations editor: only a value that starts with a bech32 header gets
 * a reason, so an empty field or a plain label is not flagged while the user types. An
 * empty address stays the submit path's problem, as before.
 */
function payoutAddressProblem(value: string): string | null {
  return looksLikeCardanoAddress(value) ? describeAddressProblem(value) : null;
}

export function StreamingPaymentEditor({
  streamingPayment,
  index,
  onChange,
  onRemove,
  existing
}: {
  streamingPayment: StreamingPaymentFormState;
  index: number;
  onChange: (value: StreamingPaymentFormState) => void;
  onRemove: () => void;
  existing: boolean;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsStreamingEditors");
  // Rate-entry period (days). The stored amount is always per-day; this just
  // scales the displayed/entered value for convenience.
  // `useId` rather than a row index: this editor and ScheduledPaymentEditor below use the
  // same field names, and two lists both starting at 0 would emit duplicate ids.
  const uid = useId();
  const [rateDays, setRateDays] = useState(1);
  const ada = isAdaScheduledPayment(streamingPayment);
  const payoutAddressError = payoutAddressProblem(streamingPayment.payoutAddress);
  // Stored per-day → scaled up to the chosen period for display.
  const perPeriod = scheduledPaymentRateForPeriod(streamingPayment, rateDays);
  const ratePeriod = RATE_PERIODS.find((period) => period.days === rateDays) ?? RATE_PERIODS[0];
  const effectivePeriodAmount = ada ? `${formatLovelaceAsAda(perPeriod)} ADA` : perPeriod;
  return (
    <fieldset className="user-surface user-list-item space-y-4 rounded-lg border border-border/60 bg-muted/20 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-foreground">{i18n("scheduledPayment")} {index + 1}</p>
        {/*
         * This button was rendered on every row and disabled on every live one, which
         * reads as "removal is blocked" when removal is not an operation here at all:
         * "Existing payments can never be dropped ... an operator stops a payment by
         * rescheduling its `end_date` down to `tx_latest_time`"
         * (`smart-contract/lib/streaming_payments/forwarding.ak:14-30`). A reader who
         * wanted to cancel would click a grey button and conclude they could not. The
         * row now carries the move that does work instead.
         */}
        {existing ? null : (
          <Button type="button" variant="ghost" onClick={onRemove}>
            {i18n("removeScheduledPayment")}
          </Button>
        )}
      </div>
      {existing ? (
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            {i18n("thisPaymentIsAlreadyRunningYouCanOnly")}
          </p>
          {/*
           * `paid_out_amount` was an editable box, and it was editable on exactly the
           * payment where the contract forbids every value but one: a newly added
           * schedule "must be born unsettled" with `paid_out_amount == 0`
           * (`smart-contract/lib/streaming_payments/forwarding.ak:74-83`, and
           * `shape.ak:63`). Anything typed there guaranteed a rejected transaction. On an
           * existing payment the figure is worth reading and cannot be changed by this
           * path (`forwarding.ak:212`), so it is a fact, not a field.
           */}
          <p className="text-sm text-foreground">
            {i18n("paidSoFar_ed3197")}{" "}
            <span className="font-medium">
              {ada
                ? i18n("value1Ada", { value1: formatLovelaceAsAda(streamingPayment.paidOutAmount) })
                : streamingPayment.paidOutAmount}
            </span>
          </p>
        </div>
      ) : null}
      <fieldset disabled={existing} className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          {/* The column beside this one is a GuidedDateTimeField, whose label row is an
              h-6 flex (it holds the "Now" button). Matching that height here keeps the
              Amount input top-aligned with the Starts date/time inputs. */}
          <div className="flex h-6 items-center">
            <Label htmlFor={`${uid}-amount`}>{i18n("amount")}{ada ? i18n("ada") : ""}</Label>
          </div>
          <div className="flex gap-2">
            {ada ? (
              <AdaAmountInput
                id={`${uid}-amount`}
                value={perPeriod}
                onChange={(text) =>
                  onChange(withScheduledPaymentRate(streamingPayment, text, rateDays))
                }
              />
            ) : (
              <Input
                id={`${uid}-amount`}
                inputMode="decimal"
                value={perPeriod}
                onChange={(event) =>
                  onChange(withScheduledPaymentRate(streamingPayment, event.target.value, rateDays))
                }
              />
            )}
            <Select
              aria-label={i18n("ratePeriod")}
              value={rateDays}
              onChange={(event) => setRateDays(Number(event.target.value))}
              // Beside an h-10 Input in the same flex row, so it takes the primitive's
              // height instead of the auto height it used to have.
              className="w-auto shrink-0 px-2"
            >
              {RATE_PERIODS.map((option) => (
                <option key={option.days} value={option.days}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            {rateDays === 1
              ? i18n("howMuchBuildsUpOverThePeriodYou")
              : i18n("effectivePeriodAmountAfterDailyConversion", {
                  period: ratePeriod.label,
                  amount: effectivePeriodAmount
                })}
          </p>
        </div>
        <div className="space-y-1">
          <GuidedDateTimeField
            idPrefix={`streaming-payment-${index}-start-date`}
            label={i18n("starts")}
            value={streamingPayment.startDate}
            onChange={(startDate) => onChange({ ...streamingPayment, startDate })}
            helper={i18n("moneyStartsBuildingUpForThisPersonFrom")}
          />
        </div>
      </fieldset>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          {/* Same h-6 label row as the Stops column beside it, so the address input
              lines up with the Stops date/time inputs instead of their label. */}
          <div className="flex h-6 items-center">
            <Label htmlFor={`${uid}-payout-address`}>{i18n("paysTo")}</Label>
          </div>
          <Input
            id={`${uid}-payout-address`}
            disabled={existing}
            value={streamingPayment.payoutAddress}
            onChange={(event) =>
              onChange({ ...streamingPayment, payoutAddress: event.target.value })
            }
            placeholder={i18n("addrTest")}
            aria-invalid={payoutAddressError ? true : undefined}
            aria-describedby={payoutAddressError ? `${uid}-payout-address-error` : undefined}
          />
          <InlineFieldError
            id={`${uid}-payout-address-error`}
            message={payoutAddressError}
          />
          <PayeeCollectsHint />
        </div>
        {/*
         * `end_date_floor` (`smart-contract/lib/streaming_payments/forwarding.ak:89-115`)
         * refuses an end date below the lesser of the current one and the time the
         * transaction lands. Pushing it out is always fine; pulling it back stops at now.
         */}
        <GuidedDateTimeField
          idPrefix={`streaming-payment-${index}-end-date`}
          label={i18n("stops")}
          value={streamingPayment.endDate}
          onChange={(endDate) => onChange({ ...streamingPayment, endDate })}
          helper={
            existing
              ? i18n("moveThisLaterToKeepThePaymentRunning")
              : i18n("nothingBuildsUpAfterThisTimeTheyCan")
          }
        />
      </div>
      <DisclosureSection
        title={i18n("paySomethingOtherThanAda")}
        description={i18n("leaveThisClosedToPayInAdaOpen")}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor={`${uid}-policy-id`}>{i18n("policyId")}</Label>
            <Input
              id={`${uid}-policy-id`}
              disabled={existing}
              value={streamingPayment.policyId}
              onChange={(event) => onChange({ ...streamingPayment, policyId: event.target.value })}
              placeholder={i18n("policyId_f606df")}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${uid}-asset-name`}>{i18n("assetNameHex_1a2048")}</Label>
            <Input
              id={`${uid}-asset-name`}
              disabled={existing}
              value={streamingPayment.assetName}
              onChange={(event) => onChange({ ...streamingPayment, assetName: event.target.value })}
              placeholder={i18n("assetNameHex_559b83")}
            />
          </div>
        </div>
      </DisclosureSection>
    </fieldset>
  );
}

export function ScheduledPaymentEditor({
  streamingPayment,
  displayIndex,
  onChange,
  onRemove,
  readOnly = false
}: {
  streamingPayment: StreamingPaymentFormState;
  displayIndex: number;
  onChange: (value: StreamingPaymentFormState) => void;
  onRemove: () => void;
  readOnly?: boolean;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsStreamingEditors");
  const uid = useId();
  const payoutAddressError = payoutAddressProblem(streamingPayment.payoutAddress);

  return (
    <fieldset disabled={readOnly} className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <p className="font-medium text-foreground">{i18n("scheduledPayment")} {displayIndex}</p>
          <Badge variant="outline">
            {streamingPayment.policyId.trim() ? i18n("nativeAsset") : i18n("ada_86f956")}
          </Badge>
          {readOnly ? <Badge variant="outline">{i18n("forwardedUnchanged")}</Badge> : null}
        </div>
        <Button type="button" variant="ghost" onClick={onRemove}>
          {i18n("removePayment")}
        </Button>
      </div>
      {readOnly ? (
        <p className="text-sm text-muted-foreground">
          {i18n("thisActionMustForwardExistingSchedulesUnchangedUse")}
        </p>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${uid}-send-to`}>{i18n("sendToAddress")}</Label>
          <Input
            id={`${uid}-send-to`}
            value={streamingPayment.payoutAddress}
            onChange={(event) =>
              onChange({ ...streamingPayment, payoutAddress: event.target.value })
            }
            placeholder={i18n("addrTest")}
            aria-invalid={payoutAddressError ? true : undefined}
            aria-describedby={payoutAddressError ? `${uid}-send-to-error` : undefined}
          />
          <InlineFieldError id={`${uid}-send-to-error`} message={payoutAddressError} />
          <PayeeCollectsHint />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${uid}-amount-per-day`}>
            {i18n("amountPerDay")}{isAdaScheduledPayment(streamingPayment) ? i18n("ada") : ""}
          </Label>
          {isAdaScheduledPayment(streamingPayment) ? (
            <AdaAmountInput
              id={`${uid}-amount-per-day`}
              value={streamingPayment.amountPerDay}
              onChange={(text) => onChange(withScheduledPaymentRate(streamingPayment, text, 1))}
              placeholder="0"
            />
          ) : (
            <Input
              id={`${uid}-amount-per-day`}
              inputMode="decimal"
              value={streamingPayment.amountPerDay}
              onChange={(event) =>
                onChange(withScheduledPaymentRate(streamingPayment, event.target.value, 1))
              }
              placeholder="0"
            />
          )}
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <GuidedDateTimeField
          idPrefix={`scheduled-payment-${displayIndex}-start-date`}
          label={i18n("startsOn")}
          value={streamingPayment.startDate}
          onChange={(startDate) => onChange({ ...streamingPayment, startDate })}
          helper={i18n("chooseWhenThisScheduledPaymentBegins")}
        />
        <GuidedDateTimeField
          idPrefix={`scheduled-payment-${displayIndex}-end-date`}
          label={i18n("endsOn")}
          value={streamingPayment.endDate}
          onChange={(endDate) => onChange({ ...streamingPayment, endDate })}
          helper={i18n("chooseWhenThisScheduledPaymentStops")}
        />
      </div>
      <DisclosureSection
        title={i18n("paySomethingOtherThanAda")}
        description={i18n("leaveThisClosedToPayInAdaOpen")}
      >
        {/* The paid-out counter is chain bookkeeping (`paid_out`, summed up in
            `computeStreamingPaymentDueAmount`); a payment being added always starts at
            zero and a forwarded one is read-only, so there is nothing to type here. */}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor={`${uid}-policy-id`}>{i18n("policyId")}</Label>
            <Input
              id={`${uid}-policy-id`}
              value={streamingPayment.policyId}
              onChange={(event) => onChange({ ...streamingPayment, policyId: event.target.value })}
              placeholder={i18n("policyId_f606df")}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${uid}-asset-name`}>{i18n("assetName")}</Label>
            <Input
              id={`${uid}-asset-name`}
              value={streamingPayment.assetName}
              onChange={(event) => onChange({ ...streamingPayment, assetName: event.target.value })}
              placeholder={i18n("assetNameHex_559b83")}
            />
          </div>
        </div>
      </DisclosureSection>
    </fieldset>
  );
}

export function FocusedStreamingPaymentRulesEditor({
  value,
  onChange,
  selectedTask,
  onSelectTask,
  fieldErrors,
  canPayDue,
  existingStreamingPaymentIds = new Set<string>()
}: {
  value: StateFormState;
  onChange: (value: StateFormState) => void;
  selectedTask: UserWorkspaceTask | null;
  onSelectTask: (task: UserWorkspaceTask) => void;
  fieldErrors: FieldErrors;
  canPayDue: boolean;
  existingStreamingPaymentIds?: ReadonlySet<string>;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsStreamingEditors");
  const tasks = GUIDED_ADMIN_TASKS.filter((task) => task.group === "streamingPayments");
  const issueCount = countFieldErrorMessages(fieldErrors);
  const adding = selectedTask === "streaming-payments-add";
  const shownPayments = value.streamingPayments
    .map((streamingPayment, index) => ({
      streamingPayment,
      index,
      existing: existingStreamingPaymentIds.has(streamingPayment.id)
    }))
    .filter((entry) => entry.existing !== adding);
  const addStreamingPayment = () =>
    onChange(withScheduledPaymentAdded(value));

  return (
    <FocusedTaskSurface
      title={i18n("scheduledPayments")}
      description={i18n("setUpAPaymentThatBuildsUpOver")}
      icon={Repeat}
      tasks={tasks}
      selectedTask={selectedTask}
      onSelectTask={onSelectTask}
      badgeByTask={{
        "streaming-payments-add": i18n("create"),
        "streaming-payments-edit-renew": formatCountLabel(value.streamingPayments.length, "payment"),
        "streaming-payments-pay-due": canPayDue ? i18n("ready") : i18n("unavailable")
      }}
      disabledTaskIds={canPayDue ? [] : ["streaming-payments-pay-due"]}
      disabledReasonByTask={{
        "streaming-payments-pay-due": i18n("addScheduledPaymentBeforePayout")
      }}
      issueCount={issueCount}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {adding
            ? i18n("moneyBuildsUpForThePersonYouName")
            : i18n("changeAPaymentYouAlreadySetUpOnly")}
        </p>
        {adding ? (
          <Button type="button" variant="secondary" onClick={addStreamingPayment}>
            <Plus className="h-4 w-4" />
            {i18n("addAPayment")}
          </Button>
        ) : null}
      </div>
      {shownPayments.length === 0 ? (
        <TaskEmptyState
          icon={adding ? CalendarPlus2 : CalendarSearch}
          title={adding ? i18n("nothingAddedYet") : i18n("nothingToChange")}
          description={
            adding
              ? i18n("moneyBuildsUpForSomebodyOverTimeAnd")
              : i18n("addAPaymentOnTheOtherTabFirst")
          }
          actionLabel={adding ? i18n("addAPayment") : undefined}
          onAction={adding ? addStreamingPayment : undefined}
        />
      ) : (
        shownPayments.map(({ streamingPayment, index, existing }) => (
          <StreamingPaymentEditor
            key={`focused-streaming-payment-${index}-${streamingPayment.id}`}
            streamingPayment={streamingPayment}
            index={index}
            existing={existing}
            onChange={(nextStreamingPayment) =>
              onChange({
                ...value,
                streamingPayments: value.streamingPayments.map((entry, entryIndex) =>
                  entryIndex === index ? nextStreamingPayment : entry
                )
              })
            }
            onRemove={() =>
              onChange({
                ...value,
                streamingPayments: value.streamingPayments.filter(
                  (_, entryIndex) => entryIndex !== index
                )
              })
            }
          />
        ))
      )}
    </FocusedTaskSurface>
  );
}
