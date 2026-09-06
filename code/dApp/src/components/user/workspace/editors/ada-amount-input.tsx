"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { formatLovelaceAsAda, parseAdaToLovelace } from "@/lib/units/lovelace";

/**
 * An amount box over an integer-denominated draft value: lovelace when `ada`,
 * raw token units otherwise.
 *
 * The boxes this replaces rendered `formatLovelaceAsAda(value)` and parsed the
 * text back on every keystroke. That round-trip cannot survive a decimal point:
 * `parseAdaToLovelace("5.")` returns "5000000" (its pattern allows a trailing
 * dot) and `formatLovelaceAsAda` strips the trailing zeros back to "5", so
 * React restored the box and erased the dot as it was typed. The next digit
 * then landed against the whole number, and 5.5 ADA was staged as 55 ADA,
 * silently. Holding the typed text here keeps the dot.
 *
 * The same defect was fixed by hand once before, in
 * `config-walletwithdraw-view.tsx`; this is that fix made reusable.
 */

function toDisplayText(value: string, ada: boolean) {
  return ada && value.trim() ? formatLovelaceAsAda(value) : value;
}

type AdaAmountInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "value" | "onChange" | "inputMode"
> & {
  /** Integer string: lovelace when `ada`, raw token units otherwise. */
  value: string;
  /**
   * Receives the same denomination as `value`. A caller that stores the amount
   * in a coarser unit (a per-week rate held as an integer per-day rate) may
   * return the value that will be echoed back, so its own rounding does not
   * read as an outside edit and overwrite what is being typed.
   */
  onChange: (next: string) => string | void;
  /** ADA entry (decimals, formatted display). False for raw token amounts. */
  ada?: boolean;
};

export function AdaAmountInput({ value, onChange, ada = true, ...inputProps }: AdaAmountInputProps) {
  const [text, setText] = useState(() => toDisplayText(value, ada));

  // Re-seed only when the draft is replaced from OUTSIDE this box: Clear form,
  // Reload defaults, a wallet switch. Comparing the box against the draft
  // instead would re-seed the moment the box holds no complete amount, which is
  // exactly what an empty box is, so clearing the field would undo itself.
  const lastPushedRef = useRef(value);
  useEffect(() => {
    if (value !== lastPushedRef.current) {
      lastPushedRef.current = value;
      setText(toDisplayText(value, ada));
    }
  }, [ada, value]);

  function push(next: string) {
    const echoed = onChange(next);
    lastPushedRef.current = typeof echoed === "string" ? echoed : next;
  }

  return (
    <Input
      {...inputProps}
      inputMode={ada ? "decimal" : "numeric"}
      value={text}
      onChange={(event) => {
        const next = event.target.value;
        setText(next);

        // An empty box means "no amount", not "keep the last one". Pushing the
        // empty string lets the field validator report a missing amount instead
        // of the draft quietly building with the previous value.
        if (!next.trim()) {
          push("");
          return;
        }

        if (!ada) {
          // Raw token amounts go through as typed; the field validator reports
          // anything that is not a whole number.
          push(next);
          return;
        }

        // A half-typed ADA amount ("1.", "0.0000001") leaves the last complete
        // value in the draft for the validator to report against.
        const asLovelace = parseAdaToLovelace(next);
        if (asLovelace !== null) {
          push(asLovelace);
        }
      }}
    />
  );
}
