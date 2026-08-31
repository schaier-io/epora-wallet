"use client";
import { useTranslations } from "next-intl";


import { useEffect, useRef, useState } from "react";
import { Check, Copy, TriangleAlert } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { copyTextToClipboard } from "@/lib/utils/clipboard";

type CopyButtonProps = Omit<ButtonProps, "onClick" | "children"> & {
  value: string;
  label?: string;
  copiedLabel?: string;
  hideLabel?: boolean;
  onCopied?: () => void;
};

// A tick is confirmation of something the user expected, so it can go as soon as it registers.
// A failure has to be read, and it carries an instruction, so it stays long enough to act on.
const COPIED_MS = 1600;
const BLOCKED_MS = 6000;

/**
 * Nothing here reaches for the toast provider. No other `ui/` component does, and the message
 * belongs on the control the user just pressed anyway. The workspace and the proposals page
 * raise a toast instead, because their copy controls are icons inside dense rows.
 */
export function CopyButton({
  value,
  label,
  copiedLabel,
  hideLabel = false,
  className,
  variant = "outline",
  size = "sm",
  onCopied,
  ...props
}: CopyButtonProps) {
  const i18n = useTranslations("ComponentsUiCopyButton");
  const resolvedLabel = label ?? i18n("copy");
  const resolvedCopiedLabel = copiedLabel ?? i18n("copied");
  const [result, setResult] = useState<"idle" | "copied" | "blocked">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleClick = async () => {
    const copied = await copyTextToClipboard(value);
    // The failure used to `return` here, which left the button reading "Copy" -- the same thing
    // it reads before anyone presses it. The user's clipboard still holds whatever it held.
    setResult(copied ? "copied" : "blocked");
    if (copied) {
      onCopied?.();
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(
      () => setResult("idle"),
      copied ? COPIED_MS : BLOCKED_MS
    );
  };

  const blocked = result === "blocked";
  const copied = result === "copied";

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handleClick}
      aria-label={
        blocked
          ? i18n("nothingWasCopiedSelectTheTextAndCopy")
          : copied
            ? resolvedCopiedLabel
            : resolvedLabel
      }
      className={cn(
        hideLabel ? "px-2" : undefined,
        copied && "text-emerald-200",
        blocked && "text-amber-200",
        className
      )}
      {...props}
    >
      {blocked ? (
        <TriangleAlert key="blocked" className="h-3.5 w-3.5" />
      ) : copied ? (
        <Check
          key="copied"
          className="h-3.5 w-3.5 animate-[copy-pop_240ms_cubic-bezier(0.22,1,0.36,1)]"
        />
      ) : (
        <Copy key="idle" className="h-3.5 w-3.5" />
      )}
      {hideLabel ? null : blocked ? i18n("copyBlocked") : copied ? resolvedCopiedLabel : resolvedLabel}
    </Button>
  );
}
