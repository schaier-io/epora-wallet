"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
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

export function CopyButton({
  value,
  label = "Copy",
  copiedLabel = "Copied",
  hideLabel = false,
  className,
  variant = "outline",
  size = "sm",
  onCopied,
  ...props
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleClick = async () => {
    const ok = await copyTextToClipboard(value);
    if (!ok) return;
    setCopied(true);
    onCopied?.();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1600);
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handleClick}
      aria-label={copied ? copiedLabel : label}
      className={cn(
        hideLabel ? "px-2" : undefined,
        copied && "text-emerald-200",
        className
      )}
      {...props}
    >
      {copied ? (
        <Check
          key="copied"
          className="h-3.5 w-3.5 animate-[copy-pop_240ms_cubic-bezier(0.22,1,0.36,1)]"
        />
      ) : (
        <Copy key="idle" className="h-3.5 w-3.5" />
      )}
      {hideLabel ? null : copied ? copiedLabel : label}
    </Button>
  );
}
