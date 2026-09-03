"use client";
import { useTranslations } from "next-intl";


import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatAmountSummary, formatCountLabel, formatInputRefLabel } from "@/components/user/workspace/helpers";
import { type WalletInputRef } from "@/lib/types/contracts";
import { type DurationUnit, combineDurationToMillis, combineLocalDateAndTimeToTimestamp, splitDurationMillis, splitTimestampToLocalInputParts } from "@/lib/user-flow/guided-helpers";
import { cn } from "@/lib/utils/cn";
import { type UTxO } from "@meshsdk/core";
import { useState } from "react";

export function GuidedDateTimeField({
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
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsGuidedFields");
  const [parts, setParts] = useState(() => splitTimestampToLocalInputParts(value));
  // A date picked before its time combines to "", the same as an untouched field,
  // so the field cannot tell its own edits from a reset by keying on `value`.
  // Re-read the stored value only when it moved away from what these parts say.
  const [syncedValue, setSyncedValue] = useState(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    if (combineLocalDateAndTimeToTimestamp(parts.date, parts.time) !== value) {
      setParts(splitTimestampToLocalInputParts(value));
    }
  }
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
    <div className="space-y-1">
      {/* Two controls under one label. `htmlFor` points at the first, which is what a
          sighted reader takes the label to mean. The comment here used to claim the time
          input carried its own label; it carried none at all, so a screen reader announced
          it as an unnamed edit field. The pair is a group named by this label now, and each
          control says which half of it it is. */}
      <div className="flex items-center justify-between gap-2">
        <Label id={`${idPrefix}-label`} htmlFor={`${idPrefix}-date`}>
          {label}
        </Label>
        {/* Datetimes here are usually "roughly when it should start/stop", and typing
            today's date plus a time into two browser pickers is the long way round a
            one-click answer. */}
        {!disabled ? (
          <Button
            type="button"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={() => updateParts(splitTimestampToLocalInputParts(String(Date.now())))}
          >
            {i18n("now")}
          </Button>
        ) : null}
      </div>
      <div className="grid gap-3 md:grid-cols-2" role="group" aria-labelledby={`${idPrefix}-label`}>
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
          aria-label={i18n("timeOfDay")}
          value={parts.time}
          onChange={(event) => updateParts({ time: event.target.value })}
          disabled={disabled}
        />
      </div>
      {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
      <p className="text-xs text-muted-foreground">
        {storedTimestampLabel
          ? i18n("thatIsStoredtimestamplabelWhereYouAre", { storedTimestampLabel: storedTimestampLabel })
          : i18n("chooseBothADateAndTime")}
      </p>
    </div>
  );
}

export function GuidedDurationField({
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
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsGuidedFields");
  const [parts, setParts] = useState(() => splitDurationMillis(value));
  // "48 hours" stores the same milliseconds as "2 days"; re-splitting the stored
  // value on every change rewrote the unit under the cursor. Re-read it only when
  // it moved away from what these parts say (a reset from outside).
  const [syncedValue, setSyncedValue] = useState(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    if (combineDurationToMillis(parts.amount, parts.unit) !== value) {
      setParts(splitDurationMillis(value));
    }
  }

  function updateParts(patch: Partial<typeof parts>) {
    const merged = { ...parts, ...patch };
    setParts(merged);
    onChange(combineDurationToMillis(merged.amount, merged.unit));
  }

  return (
    <div className="space-y-1">
      {/* Same split as the date/time field above: the label names the amount, and the unit
          select had no name of its own. */}
      <Label id={`${idPrefix}-label`} htmlFor={`${idPrefix}-amount`}>
        {label}
      </Label>
      <div className="grid gap-3 sm:grid-cols-2" role="group" aria-labelledby={`${idPrefix}-label`}>
        <Input
          id={`${idPrefix}-amount`}
          type="number"
          min="0"
          step="1"
          value={parts.amount}
          onChange={(event) => updateParts({ amount: event.target.value })}
          disabled={disabled}
        />
        <Select
          id={`${idPrefix}-unit`}
          aria-label={i18n("unitOfTime")}
          value={parts.unit}
          onChange={(event) => updateParts({ unit: event.target.value as DurationUnit })}
          disabled={disabled}
        >
          <option value="days">{i18n("days")}</option>
          <option value="hours">{i18n("hours")}</option>
          <option value="minutes">{i18n("minutes")}</option>
          {/* Only stored values too small for a whole minute land here
              (`splitDurationMillis` falls back to milliseconds); nobody picks it on
              purpose, so it stays out of the choice list otherwise. */}
          {parts.unit === "milliseconds" ? (
            <option value="milliseconds">{i18n("milliseconds")}</option>
          ) : null}
        </Select>
      </div>
      {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
      {value.trim() ? null : (
        <p className="text-xs text-muted-foreground">{i18n("enterALengthOfTime")}</p>
      )}
    </div>
  );
}

export function GuidedLockedUtxoSelector({
  utxos,
  selectedRefs,
  onChange,
  onSuggest,
  helper,
  error = null,
  onRefresh
}: {
  utxos: UTxO[];
  selectedRefs: WalletInputRef[];
  onChange: (value: WalletInputRef[]) => void;
  onSuggest: () => void;
  helper: string;
  /* The shared read behind `utxos` can fail; without these the panel reported the
     failure as an empty wallet with no way to retry (the gate on the pool browser
     hid that screen's error and refresh controls for guided tabs). */
  error?: string | null;
  onRefresh?: () => void;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsGuidedFields");
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
    <div className="space-y-3 rounded-lg border border-border/60 bg-background/40 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <Label>{i18n("whichFundsToSpend")}</Label>
          <p className="text-xs text-muted-foreground">{helper}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* First in the row: on a failed read the two buttons after it are disabled,
              so this is the only control on the panel that can do anything. */}
          {error && onRefresh ? (
            <Button type="button" variant="secondary" onClick={onRefresh}>
              {i18n("refreshFunds")}
            </Button>
          ) : null}
          <Button type="button" variant="secondary" onClick={onSuggest} disabled={utxos.length === 0}>
            {i18n("pickEnoughForThisPayment")}
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
            {i18n("selectAll")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onChange([])}
            disabled={selectedRefs.length === 0}
          >
            {i18n("clear")}
          </Button>
        </div>
      </div>
      {selectedRefs.length > 0 ? (
        <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          {formatCountLabel(selectedRefs.length, "fund pool")} {i18n("selected")}
        </div>
      ) : null}
      {error ? (
        /* Not the dashed empty line: a failed read reported as "nothing to spend"
           is the exact mistake the tidy screen's browser was corrected for. */
        <p className="text-xs text-rose-300">{error}</p>
      ) : utxos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
          {i18n("thisWalletHasNothingToSpendRightNow")}
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
                    <p className="text-sm font-medium text-foreground">
                      {formatAmountSummary(utxo.output.amount)}
                    </p>
                    <p className="break-all font-mono text-xs text-muted-foreground">
                      {refLabel}
                    </p>
                  </div>
                  <div className="ml-auto shrink-0">
                    <Badge variant={isSelected ? "secondary" : "outline"}>
                      {isSelected ? i18n("selected_9a976f") : i18n("available")}
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

