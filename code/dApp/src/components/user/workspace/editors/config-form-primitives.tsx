"use client";
import { useTranslations } from "next-intl";


import { type ReactNode, useId } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils/cn";
import { type OperatorAuthorityPath } from "@/lib/types/contracts";

import { InlineFieldError } from "./primitives";

// Shared building blocks for the action config views (config-*-view.tsx). Each
// captures a layout that was previously copy-pasted across several views, so the
// card chrome / field wiring lives in exactly one place.

// The bordered card that heads a config section: a title, an optional
// description, and arbitrary content below (e.g. an OperatorPathSelector).
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
        "rounded-xl border border-border/60 bg-background/40 p-4",
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
  className,
  errorId,
  helperId
}: {
  htmlFor: string;
  label: ReactNode;
  error?: string | null;
  helper?: ReactNode;
  children: ReactNode;
  className?: string;
  errorId?: string;
  helperId?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {helper !== undefined ? (
        <p id={helperId} className="text-[11px] text-muted-foreground">{helper}</p>
      ) : null}
      <InlineFieldError id={errorId} message={error} />
    </div>
  );
}

// LabeledField specialised to a text Input — the label + input + error block
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
  const descriptionId = useId();
  const errorId = `${descriptionId}-error`;
  const helperId = `${descriptionId}-helper`;
  const describedBy = [helper !== undefined ? helperId : null, error ? errorId : null]
    .filter(Boolean)
    .join(" ") || undefined;

  return (
    <LabeledField
      htmlFor={id}
      label={label}
      error={error}
      helper={helper}
      className={className}
      errorId={errorId}
      helperId={helperId}
    >
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
      />
    </LabeledField>
  );
}

// The operator-authority chooser shown at the top of the wrapper-flow config
// views. With more than one option it renders a select; with exactly one it
// renders a read-only badge; with none it renders nothing.
export function OperatorPathSelector({
  id,
  options,
  value,
  onChange,
  helper
}: {
  id: string;
  options: Array<{ value: OperatorAuthorityPath; label: string }>;
  value: OperatorAuthorityPath;
  onChange: (path: OperatorAuthorityPath) => void;
  helper?: string;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsConfigFormPrimitives");
  if (options.length > 1) {
    return (
      <div className="mt-4 max-w-xs space-y-1">
        <Label htmlFor={id}>{i18n("whoApproves")}</Label>
        <select
          id={id}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={value}
          onChange={(event) => onChange(event.target.value as OperatorAuthorityPath)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {helper ? (
          <p className="text-xs text-muted-foreground">{helper}</p>
        ) : null}
      </div>
    );
  }

  const single = options[0];
  if (!single) {
    return null;
  }

  return (
    <div className="mt-4 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
      {i18n("approvedBy")}{" "}
      <span className="font-medium text-foreground">{single.label}</span>
    </div>
  );
}
