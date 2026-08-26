"use client";

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
        <p className="font-medium text-foreground">Scheduled payment {index + 1}</p>
        <Button type="button" variant="ghost" onClick={onRemove} disabled={existing}>
          Remove scheduled payment
        </Button>
      </div>
      {existing ? (
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            This payment is already running. You can only change when it stops.
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
            Paid so far:{" "}
            <span className="font-medium">
              {ada
                ? `${formatLovelaceAsAda(streamingPayment.paidOutAmount)} ADA`
                : streamingPayment.paidOutAmount}
            </span>
          </p>
        </div>
      ) : null}
      <fieldset disabled={existing} className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${uid}-amount`}>Amount{ada ? " (ADA)" : ""}</Label>
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
              aria-label="Rate period"
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
            How much builds up over the period you pick. The wallet keeps a daily figure,
            so a monthly or yearly amount can round down a little.
          </p>
        </div>
        <div className="space-y-1">
          <GuidedDateTimeField
            idPrefix={`streaming-payment-${index}-start-date`}
            label="Starts"
            value={streamingPayment.startDate}
            onChange={(startDate) => onChange({ ...streamingPayment, startDate })}
            helper="Money starts building up for this person from this time."
          />
        </div>
      </fieldset>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${uid}-payout-address`}>Pays to</Label>
          <Input
            id={`${uid}-payout-address`}
            disabled={existing}
            value={streamingPayment.payoutAddress}
            onChange={(event) =>
              onChange({ ...streamingPayment, payoutAddress: event.target.value })
            }
            placeholder="addr_test..."
          />
        </div>
        <GuidedDateTimeField
          idPrefix={`streaming-payment-${index}-end-date`}
          label="Stops"
          value={streamingPayment.endDate}
          onChange={(endDate) => onChange({ ...streamingPayment, endDate })}
          helper="Nothing builds up after this time. They can still collect what already has."
        />
      </div>
      <DisclosureSection
        title="Pay something other than ADA"
        description="Leave this closed to pay in ADA. Open it only to pay a different Cardano token."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor={`${uid}-policy-id`}>Policy ID</Label>
            <Input
              id={`${uid}-policy-id`}
              disabled={existing}
              value={streamingPayment.policyId}
              onChange={(event) => onChange({ ...streamingPayment, policyId: event.target.value })}
              placeholder="policy id"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${uid}-asset-name`}>Asset Name (hex)</Label>
            <Input
              id={`${uid}-asset-name`}
              disabled={existing}
              value={streamingPayment.assetName}
              onChange={(event) => onChange({ ...streamingPayment, assetName: event.target.value })}
              placeholder="asset name hex"
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
  const uid = useId();

  return (
    <fieldset disabled={readOnly} className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <p className="font-medium text-foreground">Scheduled payment {displayIndex}</p>
          <Badge variant="outline">
            {streamingPayment.policyId.trim() ? "Native asset" : "ADA"}
          </Badge>
          {readOnly ? <Badge variant="outline">Forwarded unchanged</Badge> : null}
        </div>
        <Button type="button" variant="ghost" onClick={onRemove}>
          Remove payment
        </Button>
      </div>
      {readOnly ? (
        <p className="text-sm text-muted-foreground">
          This action must forward existing schedules unchanged. Use Manage scheduled payments to reschedule it.
        </p>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${uid}-send-to`}>Send to address</Label>
          <Input
            id={`${uid}-send-to`}
            value={streamingPayment.payoutAddress}
            onChange={(event) =>
              onChange({ ...streamingPayment, payoutAddress: event.target.value })
            }
            placeholder="addr_test..."
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${uid}-amount-per-day`}>
            Amount per day{isAdaStream(streamingPayment) ? " (ADA)" : ""}
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
          label="Starts on"
          value={streamingPayment.startDate}
          onChange={(startDate) => onChange({ ...streamingPayment, startDate })}
          helper="Choose when this scheduled payment begins."
        />
        <GuidedDateTimeField
          idPrefix={`scheduled-payment-${displayIndex}-end-date`}
          label="Ends on"
          value={streamingPayment.endDate}
          onChange={(endDate) => onChange({ ...streamingPayment, endDate })}
          helper="Choose when this scheduled payment stops."
        />
      </div>
      <DisclosureSection
        title="Asset and payout history"
        description="Leave the asset fields empty for ADA payments. The already-paid amount is mainly useful when editing an existing scheduled payment."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor={`${uid}-policy-id`}>Policy ID</Label>
            <Input
              id={`${uid}-policy-id`}
              value={streamingPayment.policyId}
              onChange={(event) => onChange({ ...streamingPayment, policyId: event.target.value })}
              placeholder="policy id"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${uid}-asset-name`}>Asset name</Label>
            <Input
              id={`${uid}-asset-name`}
              value={streamingPayment.assetName}
              onChange={(event) => onChange({ ...streamingPayment, assetName: event.target.value })}
              placeholder="asset name hex"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${uid}-already-sent`}>
              Already sent{isAdaStream(streamingPayment) ? " (ADA)" : ""}
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
      title="Scheduled payments"
      description="Set up a payment that builds up over time, change one, or pay out what has built up."
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
      issueCount={issueCount}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {adding
            ? "Money builds up for the person you name, and they collect it later."
            : "Change a payment you already set up. Only its stop time can move."}
        </p>
        {adding ? (
          <Button type="button" variant="secondary" onClick={addStreamingPayment}>
            <Plus className="h-4 w-4" />
            Add a payment
          </Button>
        ) : null}
      </div>
      {shownPayments.length === 0 ? (
        <TaskEmptyState
          icon={adding ? CalendarPlus2 : CalendarSearch}
          title={adding ? "Nothing added yet" : "Nothing to change"}
          description={
            adding
              ? "Money builds up for somebody over time, and they collect it later."
              : "Add a payment on the other tab first."
          }
          actionLabel={adding ? "Add a payment" : undefined}
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
