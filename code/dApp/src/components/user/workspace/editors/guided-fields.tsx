"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatAmountSummary, formatInputRefLabel } from "@/components/user/workspace/helpers";
import { type WalletInputRef } from "@/lib/types/contracts";
import { type DurationUnit, combineDurationToMillis, combineLocalDateAndTimeToTimestamp, splitDurationMillis, splitTimestampToLocalInputParts } from "@/lib/user-flow/guided-helpers";
import { cn } from "@/lib/utils/cn";
import { type UTxO } from "@meshsdk/core";
import { useState } from "react";

function GuidedDateTimeFieldBody({
  label,
  value,
  onChange,
  helper,
  disabled = false,
  idPrefix
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helper?: string;
  disabled?: boolean;
  idPrefix: string;
}) {
  const [parts, setParts] = useState(() => splitTimestampToLocalInputParts(value));
  const storedTimestamp = Number(value);
  const hasStoredTimestamp =
    value.trim().length > 0 && Number.isFinite(storedTimestamp) && storedTimestamp > 0;
  const storedTimestampLabel = hasStoredTimestamp
    ? new Date(storedTimestamp).toLocaleString()
    : null;

  function updateParts(patch: Partial<typeof parts>) {
    const merged = { ...parts, ...patch };
    setParts(merged);
    onChange(combineLocalDateAndTimeToTimestamp(merged.date, merged.time));
  }

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="grid gap-3 md:grid-cols-2">
        <Input
          id={`${idPrefix}-date`}
          type="date"
          value={parts.date}
          onChange={(event) => updateParts({ date: event.target.value })}
          disabled={disabled}
        />
        <Input
          id={`${idPrefix}-time`}
          type="time"
          value={parts.time}
          onChange={(event) => updateParts({ time: event.target.value })}
          disabled={disabled}
        />
      </div>
      {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
      <p className="text-xs text-muted-foreground">
        {storedTimestampLabel ? `Saved as ${storedTimestampLabel}.` : "Choose both a date and time."}
      </p>
    </div>
  );
}

export function GuidedDateTimeField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helper?: string;
  disabled?: boolean;
  idPrefix: string;
}) {
  return <GuidedDateTimeFieldBody key={`${props.idPrefix}:${props.value}`} {...props} />;
}

function GuidedDurationFieldBody({
  label,
  value,
  onChange,
  helper,
  disabled = false,
  idPrefix
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helper?: string;
  disabled?: boolean;
  idPrefix: string;
}) {
  const [parts, setParts] = useState(() => splitDurationMillis(value));

  function updateParts(patch: Partial<typeof parts>) {
    const merged = { ...parts, ...patch };
    setParts(merged);
    onChange(combineDurationToMillis(merged.amount, merged.unit));
  }

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          id={`${idPrefix}-amount`}
          type="number"
          min="0"
          step="1"
          value={parts.amount}
          onChange={(event) => updateParts({ amount: event.target.value })}
          disabled={disabled}
        />
        <select
          id={`${idPrefix}-unit`}
          value={parts.unit}
          onChange={(event) => updateParts({ unit: event.target.value as DurationUnit })}
          disabled={disabled}
          className="flex h-10 w-full rounded-md border border-input bg-background/70 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <option value="days">Days</option>
          <option value="hours">Hours</option>
          <option value="minutes">Minutes</option>
          <option value="milliseconds">Milliseconds</option>
        </select>
      </div>
      {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
      <p className="text-xs text-muted-foreground">
        {value.trim() ? `Saved as ${parts.amount || "0"} ${parts.unit}.` : "Enter a duration."}
      </p>
    </div>
  );
}

export function GuidedDurationField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helper?: string;
  disabled?: boolean;
  idPrefix: string;
}) {
  return <GuidedDurationFieldBody key={`${props.idPrefix}:${props.value}`} {...props} />;
}

export function GuidedLockedUtxoSelector({
  utxos,
  selectedRefs,
  onChange,
  onSuggest,
  helper
}: {
  utxos: UTxO[];
  selectedRefs: WalletInputRef[];
  onChange: (value: WalletInputRef[]) => void;
  onSuggest: () => void;
  helper: string;
}) {
  const selectedKeys = new Set(
    selectedRefs.map((ref) => formatInputRefLabel(ref.txHash, ref.outputIndex))
  );

  function toggleUtxo(utxo: UTxO) {
    const nextRef = {
      txHash: utxo.input.txHash,
      outputIndex: utxo.input.outputIndex
    };
    const nextKey = formatInputRefLabel(nextRef.txHash, nextRef.outputIndex);

    if (selectedKeys.has(nextKey)) {
      onChange(
        selectedRefs.filter(
          (ref) => formatInputRefLabel(ref.txHash, ref.outputIndex) !== nextKey
        )
      );
      return;
    }

    onChange([...selectedRefs, nextRef]);
  }

  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-background/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <Label>Locked funds to use</Label>
          <p className="text-xs text-muted-foreground">{helper}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={onSuggest} disabled={utxos.length === 0}>
            Select suggested inputs
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              onChange(
                utxos.map((utxo) => ({
                  txHash: utxo.input.txHash,
                  outputIndex: utxo.input.outputIndex
                }))
              )
            }
            disabled={utxos.length === 0}
          >
            Select all
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onChange([])}
            disabled={selectedRefs.length === 0}
          >
            Clear
          </Button>
        </div>
      </div>
      {selectedRefs.length > 0 ? (
        <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          {selectedRefs.length} locked input(s) selected.
        </div>
      ) : null}
      {utxos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
          No spendable wallet funds are available right now.
        </p>
      ) : (
        <div className="max-h-64 space-y-2 overflow-auto rounded-lg border border-border/60 bg-background/20 p-2">
          {utxos.map((utxo) => {
            const refLabel = formatInputRefLabel(utxo.input.txHash, utxo.input.outputIndex);
            const isSelected = selectedKeys.has(refLabel);

            return (
              <button
                key={refLabel}
                type="button"
                onClick={() => toggleUtxo(utxo)}
                className={cn(
                  "w-full rounded-lg border px-3 py-3 text-left transition-colors",
                  isSelected
                    ? "border-primary/50 bg-primary/10"
                    : "border-border/60 bg-muted/20 hover:border-primary/30 hover:bg-background/60"
                )}
              >
                <div className="flex w-full flex-wrap items-start gap-x-3 gap-y-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="break-all font-mono text-xs text-foreground">{refLabel}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatAmountSummary(utxo.output.amount)}
                    </p>
                  </div>
                  <div className="ml-auto shrink-0">
                    <Badge variant={isSelected ? "secondary" : "outline"}>
                      {isSelected ? "Selected" : "Available"}
                    </Badge>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

