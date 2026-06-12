"use client";

import { GuidedDateTimeField } from "./guided-fields";
import { DisclosureSection } from "./primitives";
import { FocusedTaskSurface, TaskEmptyState } from "./task-surface";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type FieldErrors, type UserWorkspaceTask } from "@/components/user/flow-types";
import { GUIDED_ADMIN_TASKS } from "@/components/user/workspace/constants";
import { countFieldErrorMessages, formatCountLabel } from "@/components/user/workspace/helpers";
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
  onRemove
}: {
  streamingPayment: StreamingPaymentFormState;
  index: number;
  onChange: (value: StreamingPaymentFormState) => void;
  onRemove: () => void;
}) {
  // Rate-entry period (days). The stored amount is always per-day; this just
  // scales the displayed/entered value for convenience.
  const [rateDays, setRateDays] = useState(1);
  const ada = isAdaStream(streamingPayment);
  // Stored per-day → scaled up to the chosen period for display.
  const perPeriod = scaleIntegerDigits(streamingPayment.amountPerDay, rateDays, 1);
  return (
    <div className="space-y-4 rounded-md border border-border/60 bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-foreground">Streaming payment {index + 1}</p>
        <Button type="button" variant="ghost" onClick={onRemove}>
          Remove streaming payment
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Paid Out Amount{isAdaStream(streamingPayment) ? " (ADA)" : ""}</Label>
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
          <Label>Amount{ada ? " (ADA)" : ""}</Label>
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
              aria-label="Rate period"
              value={rateDays}
              onChange={(event) => setRateDays(Number(event.target.value))}
              className="shrink-0 rounded-md border border-border/60 bg-background px-2 text-sm text-foreground"
            >
              {RATE_PERIODS.map((option) => (
                <option key={option.days} value={option.days}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-1.5">
          <GuidedDateTimeField
            idPrefix={`streaming-payment-${index}-start-date`}
            label="Start Date"
            value={streamingPayment.startDate}
            onChange={(startDate) => onChange({ ...streamingPayment, startDate })}
            helper="Choose the local date and time when this streaming payment starts accruing."
          />
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Payout Address</Label>
          <Input
            value={streamingPayment.payoutAddress}
            onChange={(event) =>
              onChange({ ...streamingPayment, payoutAddress: event.target.value })
            }
            placeholder="addr_test..."
          />
        </div>
        <GuidedDateTimeField
          idPrefix={`streaming-payment-${index}-end-date`}
          label="End Date"
          value={streamingPayment.endDate}
          onChange={(endDate) => onChange({ ...streamingPayment, endDate })}
          helper="Choose the local date and time when the streaming payment stops accruing."
        />
      </div>
      <DisclosureSection
        title="Streaming payment asset"
        description="Leave these empty for lovelace streaming payments. Open this only when the streaming payment pays a native asset instead of ADA."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Policy ID</Label>
            <Input
              value={streamingPayment.policyId}
              onChange={(event) => onChange({ ...streamingPayment, policyId: event.target.value })}
              placeholder="policy id"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Asset Name (hex)</Label>
            <Input
              value={streamingPayment.assetName}
              onChange={(event) => onChange({ ...streamingPayment, assetName: event.target.value })}
              placeholder="asset name hex"
            />
          </div>
        </div>
      </DisclosureSection>
    </div>
  );
}

export function ScheduledPaymentEditor({
  streamingPayment,
  displayIndex,
  onChange,
  onRemove
}: {
  streamingPayment: StreamingPaymentFormState;
  displayIndex: number;
  onChange: (value: StreamingPaymentFormState) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <p className="font-medium text-foreground">Scheduled payment {displayIndex}</p>
          <Badge variant="outline">
            {streamingPayment.policyId.trim() ? "Native asset" : "ADA"}
          </Badge>
        </div>
        <Button type="button" variant="ghost" onClick={onRemove}>
          Remove payment
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Send to address</Label>
          <Input
            value={streamingPayment.payoutAddress}
            onChange={(event) =>
              onChange({ ...streamingPayment, payoutAddress: event.target.value })
            }
            placeholder="addr_test..."
          />
        </div>
        <div className="space-y-1.5">
          <Label>Amount per day{isAdaStream(streamingPayment) ? " (ADA)" : ""}</Label>
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
          <div className="space-y-1.5">
            <Label>Policy ID</Label>
            <Input
              value={streamingPayment.policyId}
              onChange={(event) => onChange({ ...streamingPayment, policyId: event.target.value })}
              placeholder="policy id"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Asset name</Label>
            <Input
              value={streamingPayment.assetName}
              onChange={(event) => onChange({ ...streamingPayment, assetName: event.target.value })}
              placeholder="asset name hex"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Already sent{isAdaStream(streamingPayment) ? " (ADA)" : ""}</Label>
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
    </div>
  );
}

export function FocusedStreamingPaymentRulesEditor({
  value,
  onChange,
  selectedTask,
  onSelectTask,
  fieldErrors,
  canPayDue
}: {
  value: StateFormState;
  onChange: (value: StateFormState) => void;
  selectedTask: UserWorkspaceTask | null;
  onSelectTask: (task: UserWorkspaceTask) => void;
  fieldErrors: FieldErrors;
  canPayDue: boolean;
}) {
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
      title="Streaming payments"
      description="Edit rules separately from payouts."
      icon={Repeat}
      tasks={tasks}
      selectedTask={selectedTask}
      onSelectTask={onSelectTask}
      badgeByTask={{
        "streaming-payments-add": "Create",
        "streaming-payments-edit-renew": formatCountLabel(value.streamingPayments.length, "rule"),
        "streaming-payments-pay-due": canPayDue ? "Ready" : "Unavailable"
      }}
      disabledTaskIds={canPayDue ? [] : ["streaming-payments-pay-due"]}
      issueCount={issueCount}
      stats={
        <>
          <div className="rounded-xl border border-border/60 bg-background/30 p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Rules</p>
            <p className="mt-1 text-sm font-medium text-foreground">{value.streamingPayments.length}</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/30 p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Payout mode</p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {canPayDue ? "Available" : "Need rules"}
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/30 p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">On-chain path</p>
            <p className="mt-1 text-sm font-medium text-foreground">Streaming-payment-only update</p>
          </div>
        </>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {selectedTask === "streaming-payments-add"
            ? "Create a new rule."
            : "Edit existing rules."}
        </p>
        <Button type="button" variant="secondary" onClick={addStreamingPayment}>
          <Plus className="h-4 w-4" />
          Add streaming payment
        </Button>
      </div>
      {value.streamingPayments.length === 0 ? (
        <TaskEmptyState
          icon={selectedTask === "streaming-payments-add" ? CalendarPlus2 : CalendarSearch}
          title="No scheduled payments yet"
          description="Set up rent, payroll, or recurring transfers that send themselves."
          actionLabel="Add schedule"
          onAction={addStreamingPayment}
        />
      ) : (
        value.streamingPayments.map((streamingPayment, index) => (
          <StreamingPaymentEditor
            key={`focused-streaming-payment-${index}-${streamingPayment.id}`}
            streamingPayment={streamingPayment}
            index={index}
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

