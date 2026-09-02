"use client";
import { useTranslations } from "next-intl";


import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type DurationUnit, combineDurationToMillis, combineLocalDateAndTimeToTimestamp, splitDurationMillis, splitTimestampToLocalInputParts } from "@/lib/user-flow/guided-helpers";
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
          sighted reader takes the label to mean; the time input carries its own. */}
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={`${idPrefix}-date`}>{label}</Label>
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
      <Label htmlFor={`${idPrefix}-amount`}>{label}</Label>
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
        <Select
          id={`${idPrefix}-unit`}
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
