"use client";
import { type ComponentProps, type ReactNode, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils/cn";
import { formatLovelaceAsAda, parseAdaToLovelace } from "@/lib/units/lovelace";

import { InlineFieldError } from "./primitives";

// Shared building blocks for the action config views (config-*-view.tsx). Each
// captures a layout that was previously copy-pasted across several views, so the
// card chrome / field wiring lives in exactly one place.

// The bordered card that heads a config section: a title, an optional
// description, and arbitrary content below.
export function ConfigSection({
  title,
  description,
  children,
  className
}: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 bg-background/40 p-3 sm:p-4",
        className
      )}
    >
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description !== undefined ? (
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      ) : null}
      {children}
    </div>
  );
}

// A labelled form control: label, the control (as children), an optional helper
// line, and an inline validation error. Use LabeledInputField for the common
// plain-text-input case.
export function LabeledField({
  htmlFor,
  label,
  error,
  helper,
  children,
  className
}: {
  htmlFor: string;
  label: ReactNode;
  error?: string | null;
  helper?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const errorId = `${htmlFor}-error`;

  return (
    <div className={cn("space-y-1", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {helper !== undefined ? (
        <p className="text-xs text-muted-foreground">{helper}</p>
      ) : null}
      <InlineFieldError id={errorId} message={error} />
    </div>
  );
}

// LabeledField specialised to a text Input: the label + input + error block
// that recurs across the config views and editors.
export function LabeledInputField({
  id,
  label,
  value,
  onChange,
  error,
  helper,
  placeholder,
  className
}: {
  id: string;
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  helper?: ReactNode;
  placeholder?: string;
  className?: string;
}) {
  return (
    <LabeledField
      htmlFor={id}
      label={label}
      error={error}
      helper={helper}
      className={className}
    >
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
    </LabeledField>
  );
}

// An ADA amount box that keeps what the person types. Rendering the stored
// lovelace back through formatLovelaceAsAda on every keystroke erased a trailing
// "." (so 1.5 could only be pasted) and turned a decimal comma into a tenfold
// amount. The stored value drives the box only while nobody is editing it.
export function AdaAmountInput({
  value,
  onChange,
  onFocus,
  onBlur,
  ...inputProps
}: Omit<ComponentProps<typeof Input>, "value" | "onChange" | "inputMode"> & {
  /** Stored lovelace, or "" when nothing is entered. */
  value: string;
  /** Receives the raw text; the caller parses it with parseAdaToLovelace. */
  onChange: (text: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const stored = value.trim() ? formatLovelaceAsAda(value) : "";
  // Text that does not parse stays visible and flagged after blur; swapping it
  // for the (empty) stored value would hide the mistake.
  const invalid = draft !== null && draft.trim() !== "" && parseAdaToLovelace(draft) === null;
  // A stored value that moved while the box is not being edited (a Max button, a
  // "pay now" tick, a form reset) replaces whatever text was left behind.
  const [syncedValue, setSyncedValue] = useState(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    if (!focused) setDraft(null);
  }

  return (
    <Input
      {...inputProps}
      inputMode="decimal"
      aria-invalid={invalid || undefined}
      value={draft ?? stored}
      onFocus={(event) => {
        setFocused(true);
        setDraft(draft ?? stored);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        if (!invalid) setDraft(null);
        onBlur?.(event);
      }}
      onChange={(event) => {
        setDraft(event.target.value);
        onChange(event.target.value);
      }}
    />
  );
}
