"use client";

import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfoHint } from "@/components/ui/info-hint";
import { cn } from "@/lib/utils/cn";

type PopupDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
};

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

export function PopupDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  bodyClassName
}: PopupDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const pointerDownInsideRef = useRef(false);
  const descriptionIsLong = Boolean(description && description.length > 90);

  const handleClose = useCallback(() => onOpenChange(false), [onOpenChange]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;

    previouslyFocusedElementRef.current = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    // Defer initial focus so contained content mounts first.
    const focusTimer = window.setTimeout(() => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      const first = dialog.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (first ?? closeButtonRef.current)?.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleClose();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusables = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((el) => !el.hasAttribute("data-focus-skip"));
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", handleKeyDown);
      const previouslyFocused = previouslyFocusedElementRef.current;
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [handleClose, open]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="user-overlay fixed inset-0 z-[100] bg-black/70 backdrop-blur-[2px]">
      <div
        className="flex min-h-dvh items-center justify-center overflow-y-auto p-3 sm:p-6"
        onPointerDown={(event) => {
          pointerDownInsideRef.current = false;
          if (event.target === event.currentTarget) {
            // pointer started on backdrop
          }
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget && !pointerDownInsideRef.current) {
            handleClose();
          }
        }}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          onPointerDown={() => {
            pointerDownInsideRef.current = true;
          }}
          className={cn(
            "user-overlay flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border/70 bg-background shadow-2xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)]",
            className
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border/60 px-5 py-4">
            <div className="space-y-1">
              <p id={titleId} className="inline-flex items-center gap-2 text-base font-semibold text-foreground">
                {title}
                {description && descriptionIsLong ? (
                  <InfoHint label={`More about ${title}`} contentClassName="max-w-sm">
                    {description}
                  </InfoHint>
                ) : null}
              </p>
              {description && !descriptionIsLong ? (
                <p id={descriptionId} className="text-sm text-muted-foreground">
                  {description}
                </p>
              ) : null}
              {description && descriptionIsLong ? (
                <p id={descriptionId} className="sr-only">
                  {description}
                </p>
              ) : null}
            </div>
            <Button
              ref={closeButtonRef}
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClose}
              aria-label="Close dialog"
              className="shrink-0 px-2"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div
            className={cn(
              "user-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-5",
              bodyClassName
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
