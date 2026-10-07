"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Minus, Plus } from "lucide-react";

import { parseApprovalPowerInput } from "@/components/user/workspace/helpers/form-state";
import { MAX_ON_CHAIN_STATE_INTEGER } from "@/lib/contracts/on-chain-integer";

const STEP_BUTTON =
  "inline-flex h-11 w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 sm:h-9 sm:w-9";

/**
 * An approval-power number with a step either side: the wallet threshold and each
 * co-signer's own power. It has no top short of the chain's integer limit. A threshold
 * above the power the co-signers hold is legal on chain, so the caller warns about it
 * rather than this control refusing it. The box takes an exact value too.
 *
 * Only a whole number of at least 1 reaches the form. The contract rejects a zero
 * threshold, and an empty power box read as "no co-signer" for a moment, which reset
 * the threshold the person had chosen. A half-typed value stays in the box until it is
 * a number again, and leaving the box puts the saved value back.
 */
export function PowerStepper({
  id,
  labelledBy,
  value,
  onChange
}: {
  id: string;
  labelledBy: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const i18n = useTranslations("ComponentsUserWorkspaceEditorsApprovalPowerSlider");
  const [text, setText] = useState(value);
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setText(value);
  }
  const parsed = parseApprovalPowerInput(value);
  const typed = parseApprovalPowerInput(text);
  const step = (delta: bigint) => {
    const next = (parsed ?? 0n) + delta;
    if (next >= 1n && next <= MAX_ON_CHAIN_STATE_INTEGER) onChange(next.toString());
  };
  return (
    <div className="inline-flex shrink-0 items-center overflow-hidden rounded-md border border-border/60 bg-background/40">
      <button
        type="button"
        aria-label={i18n("decrease")}
        aria-controls={id}
        disabled={parsed === null || parsed <= 1n}
        onClick={() => step(-1n)}
        className={STEP_BUTTON}
      >
        <Minus className="h-4 w-4" aria-hidden="true" />
      </button>
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        aria-labelledby={labelledBy}
        aria-invalid={typed === null || typed < 1n ? true : undefined}
        value={text}
        onChange={(event) => {
          const next = event.target.value.trim();
          setText(next);
          const power = parseApprovalPowerInput(next);
          if (power !== null && power >= 1n && power <= MAX_ON_CHAIN_STATE_INTEGER) onChange(power.toString());
        }}
        onBlur={() => setText(value)}
        className="h-11 w-14 border-x border-border/60 bg-transparent text-center text-base font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:h-9"
      />
      <button
        type="button"
        aria-label={i18n("increase")}
        aria-controls={id}
        disabled={parsed !== null && parsed >= MAX_ON_CHAIN_STATE_INTEGER}
        onClick={() => step(1n)}
        className={STEP_BUTTON}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
