"use client";
import { useTranslations } from "next-intl";


import { GuidedDateTimeField } from "./guided-fields";
import { DisclosureSection } from "./primitives";
import { FocusedTaskSurface, TaskEmptyState } from "./task-surface";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type FieldErrors, type UserWorkspaceTask } from "@/components/user/flow-types";
import { GUIDED_ADMIN_TASKS } from "@/components/user/workspace/guided-admin-catalog";
import { countFieldErrorMessages } from "@/components/user/workspace/helpers";
import { type StateFormState, type StreamingPaymentFormState, createDefaultStreamingPaymentFormState, nextGeneratedId } from "@/lib/contracts/state-form";
import { formatLovelaceAsAda, parseAdaToLovelace } from "@/lib/user-flow/guided-helpers";
import { CalendarPlus2, CalendarSearch, Plus, Repeat } from "lucide-react";
import { useState } from "react";

// A streaming payment denominates in ADA (lovelace) unless it targets a native
// asset (policy id / asset name set). When it's ADA, show/enter the amount in
// ADA — the stored value stays lovelace — matching the Send/Withdraw fields. For
// a native asset the amount is in that asset's own base unit, shown raw.
function isAdaStream(sp: StreamingPaymentFormState): boolean {
  return !sp.policyId.trim() && !sp.assetName.trim();
}

// The on-chain rate is per-day. These let the user enter a rate per day/week/
// month/year; we convert to per-day in the background. Months/years use round
// 30/365-day approximations. Per-day stays integer (lovelace), so non-divisible
// rates round down by sub-lovelace amounts.
const RATE_PERIODS = [
  { labelKey: "perDay", days: 1 },
  { labelKey: "perWeek", days: 7 },
  { labelKey: "perMonth", days: 30 },
  { labelKey: "perYear", days: 365 }
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
  const [rateDays, setRateDays] = useState(1);
  const ada = isAdaStream(streamingPayment);
  // Stored per-day → scaled up to the chosen period for display.
  const perPeriod = scaleIntegerDigits(streamingPayment.amountPerDay, rateDays, 1);
  return (
    <fieldset className="space-y-4 rounded-md border border-border/60 bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-foreground">{i18n("scheduledPayment")} {index + 1}</p>
        <Button type="button" variant="ghost" onClick={onRemove} disabled={existing}>
          {i18n("removeScheduledPayment")}
        </Button>
      </div>
      {existing ? (
        <p className="text-sm text-muted-foreground">
          {i18n("onlyTheEndDateCanChangeHereThe")}
        </p>
      ) : null}
      <fieldset disabled={existing} className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div className="space-y-1.5">
          <Label>{i18n("paidSoFar")}{isAdaStream(streamingPayment) ? i18n("ada") : ""}</Label>
          <Input
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
          />
        </div>
        <div className="space-y-1.5">
          <Label>{i18n("amount")}{ada ? i18n("ada") : ""}</Label>
          <div className="flex gap-2">
            <Input
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
            <select
              aria-label={i18n("ratePeriod")}
              value={rateDays}
              onChange={(event) => setRateDays(Number(event.target.value))}
              className="shrink-0 rounded-md border border-border/60 bg-background px-2 text-sm text-foreground"
            >
              {RATE_PERIODS.map((option) => (
                <option key={option.days} value={option.days}>
                  {i18n(option.labelKey)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-1.5">
          <GuidedDateTimeField
            idPrefix={`streaming-payment-${index}-start-date`}
            label={i18n("startsOn")}
            value={streamingPayment.startDate}
            onChange={(startDate) => onChange({ ...streamingPayment, startDate })}
            helper={i18n("chooseTheLocalDateAndTimeWhenThis")}
          />
        </div>
      </fieldset>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{i18n("recipientAddress")}</Label>
          <Input
            disabled={existing}
            value={streamingPayment.payoutAddress}
            onChange={(event) =>
              onChange({ ...streamingPayment, payoutAddress: event.target.value })
            }
            placeholder={i18n("pasteAPreprodAddress")}
          />
        </div>
        <GuidedDateTimeField
          idPrefix={`streaming-payment-${index}-end-date`}
          label={i18n("endsOn")}
          value={streamingPayment.endDate}
          onChange={(endDate) => onChange({ ...streamingPayment, endDate })}
          helper={i18n("chooseTheLocalDateAndTimeWhenThis_89a574")}
        />
      </div>
      <DisclosureSection
        title={i18n("scheduledPaymentAsset")}
        description={i18n("leaveTheseFieldsEmptyForAdaOpenThis")}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{i18n("policyId")}</Label>
            <Input
              disabled={existing}
              value={streamingPayment.policyId}
              onChange={(event) => onChange({ ...streamingPayment, policyId: event.target.value })}
              placeholder={i18n("message_56CharacterPolicyId")}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{i18n("assetNameHex")}</Label>
            <Input
              disabled={existing}
              value={streamingPayment.assetName}
              onChange={(event) => onChange({ ...streamingPayment, assetName: event.target.value })}
              placeholder={i18n("hexEncodedAssetName")}
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
  return (
    <fieldset disabled={readOnly} className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <p className="font-medium text-foreground">{i18n("scheduledPayment")} {displayIndex}</p>
          <Badge variant="outline">
            {streamingPayment.policyId.trim() ? i18n("nativeAsset") : i18n("ada_86f956")}
          </Badge>
          {readOnly ? <Badge variant="outline">{i18n("noChanges")}</Badge> : null}
        </div>
        <Button type="button" variant="ghost" onClick={onRemove}>
          {i18n("removePayment")}
        </Button>
      </div>
      {readOnly ? (
        <p className="text-sm text-muted-foreground">
          {i18n("thisScheduleStaysUnchangedHereOpenManageScheduled")}
        </p>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{i18n("sendToAddress")}</Label>
          <Input
            value={streamingPayment.payoutAddress}
            onChange={(event) =>
              onChange({ ...streamingPayment, payoutAddress: event.target.value })
            }
            placeholder={i18n("pasteAPreprodAddress")}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{i18n("amountPerDay")}{isAdaStream(streamingPayment) ? i18n("ada") : ""}</Label>
          <Input
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
          <div className="space-y-1.5">
            <Label>{i18n("policyId")}</Label>
            <Input
              value={streamingPayment.policyId}
              onChange={(event) => onChange({ ...streamingPayment, policyId: event.target.value })}
              placeholder={i18n("message_56CharacterPolicyId")}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{i18n("assetName")}</Label>
            <Input
              value={streamingPayment.assetName}
              onChange={(event) => onChange({ ...streamingPayment, assetName: event.target.value })}
              placeholder={i18n("hexEncodedAssetName")}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{i18n("alreadySent")}{isAdaStream(streamingPayment) ? i18n("ada") : ""}</Label>
            <Input
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
  const countI18n = useTranslations("Counts");
  const tasks = GUIDED_ADMIN_TASKS.filter((task) => task.group === "streamingPayments");
  const issueCount = countFieldErrorMessages(fieldErrors);
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
      description={i18n("schedulesAccrueOnChainPayingAnAccruedAmount")}
      icon={Repeat}
      tasks={tasks}
      selectedTask={selectedTask}
      onSelectTask={onSelectTask}
      badgeByTask={{
        "streaming-payments-add": i18n("create"),
        "streaming-payments-edit-renew": countI18n("rule", { count: value.streamingPayments.length }),
        "streaming-payments-pay-due": canPayDue ? i18n("ready") : i18n("unavailable")
      }}
      disabledTaskIds={canPayDue ? [] : ["streaming-payments-pay-due"]}
      issueCount={issueCount}
      stats={
        <>
          <div className="rounded-xl border border-border/60 bg-background/30 p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{i18n("schedules")}</p>
            <p className="mt-1 text-sm font-medium text-foreground">{value.streamingPayments.length}</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/30 p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{i18n("payNow")}</p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {canPayDue ? i18n("available") : i18n("needsASchedule")}
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/30 p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{i18n("updateScope")}</p>
            <p className="mt-1 text-sm font-medium text-foreground">{i18n("schedulesOnly")}</p>
          </div>
        </>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {selectedTask === "streaming-payments-add"
            ? i18n("addARecipientRateAndDateRange")
            : i18n("chooseAScheduleAndChangeItsEndDate")}
        </p>
        <Button type="button" variant="secondary" onClick={addStreamingPayment}>
          <Plus className="h-4 w-4" />
          {i18n("addScheduledPayment")}
        </Button>
      </div>
      {value.streamingPayments.length === 0 ? (
        <TaskEmptyState
          icon={selectedTask === "streaming-payments-add" ? CalendarPlus2 : CalendarSearch}
          title={i18n("noScheduledPaymentsYet")}
          description={i18n("setUpAmountsThatAccrueOnChainUntil")}
          actionLabel={i18n("addSchedule")}
          onAction={addStreamingPayment}
        />
      ) : (
        value.streamingPayments.map((streamingPayment, index) => (
          <StreamingPaymentEditor
            key={`focused-streaming-payment-${index}-${streamingPayment.id}`}
            streamingPayment={streamingPayment}
            index={index}
            existing={existingStreamingPaymentIds.has(streamingPayment.id)}
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
