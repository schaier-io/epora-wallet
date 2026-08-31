"use client";
import { useTranslations } from "next-intl";


import { GuidedDateTimeField } from "./guided-fields";
import { DisclosureSection } from "./primitives";
import { FocusedTaskSurface, TaskEmptyState } from "./task-surface";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type FieldErrors, type UserWorkspaceTask } from "@/components/user/flow-types";
import { GUIDED_ADMIN_TASKS } from "@/components/user/workspace/guided-admin-catalog";
import { countFieldErrorMessages, formatCountLabel } from "@/components/user/workspace/helpers";
import { type StateFormState, type StreamingPaymentFormState, createDefaultStreamingPaymentFormState, nextGeneratedId } from "@/lib/contracts/state-form";
import { formatLovelaceAsAda, parseAdaToLovelace } from "@/lib/user-flow/guided-helpers";
import { CalendarPlus2, CalendarSearch, Plus, Repeat } from "lucide-react";
import { useId, useState } from "react";

// A scheduled payment denominates in ADA (lovelace) unless it targets a native
// asset (policy id / asset name set). When it's ADA, show/enter the amount in
// ADA (the stored value stays lovelace), matching the Send/Withdraw fields. For
// a native asset the amount is in that asset's own base unit, shown raw.
function isAdaStream(sp: StreamingPaymentFormState): boolean {
  return !sp.policyId.trim() && !sp.assetName.trim();
}

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

// Exact integer scaling: (value * multiply) / divide, floor. Passes non-integer
// (mid-edit) strings through untouched.
function scaleIntegerDigits(value: string, multiply: number, divide: number): string {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return trimmed;
  return ((BigInt(trimmed) * BigInt(multiply)) / BigInt(divide)).toString();
}

function StreamingPaymentEditor({
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
  const ada = isAdaStream(streamingPayment);
  // Stored per-day → scaled up to the chosen period for display.
  const perPeriod = scaleIntegerDigits(streamingPayment.amountPerDay, rateDays, 1);
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
          <Label htmlFor={`${uid}-amount`}>{i18n("amount")}{ada ? i18n("ada") : ""}</Label>
          <div className="flex gap-2">
            <Input
              id={`${uid}-amount`}
              inputMode="decimal"
              value={ada ? formatLovelaceAsAda(perPeriod) : perPeriod}
              onChange={(event) => {
                const perPeriodValue = ada
                  ? parseAdaToLovelace(event.target.value) ?? "0"
                  : event.target.value;
                onChange({
                  ...streamingPayment,
                  amountPerDay: scaleIntegerDigits(perPeriodValue, 1, rateDays)
                });
              }}
            />
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
            {i18n("howMuchBuildsUpOverThePeriodYou")}
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
          <Label htmlFor={`${uid}-payout-address`}>{i18n("paysTo")}</Label>
          <Input
            id={`${uid}-payout-address`}
            disabled={existing}
            value={streamingPayment.payoutAddress}
            onChange={(event) =>
              onChange({ ...streamingPayment, payoutAddress: event.target.value })
            }
            placeholder={i18n("addrTest")}
          />
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
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${uid}-amount-per-day`}>
            {i18n("amountPerDay")}{isAdaStream(streamingPayment) ? i18n("ada") : ""}
          </Label>
          <Input
            id={`${uid}-amount-per-day`}
            inputMode="decimal"
            value={
              isAdaStream(streamingPayment)
                ? formatLovelaceAsAda(streamingPayment.amountPerDay)
                : streamingPayment.amountPerDay
            }
            onChange={(event) =>
              onChange({
                ...streamingPayment,
                amountPerDay: isAdaStream(streamingPayment)
                  ? parseAdaToLovelace(event.target.value) ?? "0"
                  : event.target.value
              })
            }
            placeholder="0"
          />
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
        title={i18n("assetAndPayoutHistory")}
        description={i18n("leaveTheAssetFieldsEmptyForAdaPayments")}
      >
        <div className="grid gap-3 md:grid-cols-3">
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
          <div className="space-y-1">
            <Label htmlFor={`${uid}-already-sent`}>
              {i18n("alreadySent")}{isAdaStream(streamingPayment) ? i18n("ada") : ""}
            </Label>
            <Input
              id={`${uid}-already-sent`}
              inputMode="decimal"
              value={
                isAdaStream(streamingPayment)
                  ? formatLovelaceAsAda(streamingPayment.paidOutAmount)
                  : streamingPayment.paidOutAmount
              }
              onChange={(event) =>
                onChange({
                  ...streamingPayment,
                  paidOutAmount: isAdaStream(streamingPayment)
                    ? parseAdaToLovelace(event.target.value) ?? "0"
                    : event.target.value
                })
              }
              placeholder="0"
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
    onChange({
      ...value,
      streamingPayments: [
        ...value.streamingPayments,
        createDefaultStreamingPaymentFormState(nextGeneratedId(value.streamingPayments))
      ]
    });

  return (
    <FocusedTaskSurface
      title={i18n("scheduledPayments")}
      description={i18n("setUpAPaymentThatBuildsUpOver")}
      icon={Repeat}
      tasks={tasks}
      selectedTask={selectedTask}
      onSelectTask={onSelectTask}
      badgeByTask={{
        "streaming-payments-add": "Create",
        "streaming-payments-edit-renew": formatCountLabel(value.streamingPayments.length, "payment"),
        "streaming-payments-pay-due": canPayDue ? "Ready" : "Unavailable"
      }}
      disabledTaskIds={canPayDue ? [] : ["streaming-payments-pay-due"]}
      disabledReasonByTask={{
        "streaming-payments-pay-due":
          "Add a scheduled payment first. There is nothing to pay out yet."
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
