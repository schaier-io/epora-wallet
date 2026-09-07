"use client";
import { useTranslations } from "next-intl";


import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useModalIsolation } from "@/components/ui/use-modal-isolation";
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

export function PopupDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  bodyClassName
}: PopupDialogProps) {
  const i18n = useTranslations("ComponentsUiPopupDialog");
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const pointerDownInsideRef = useRef(false);

  // Read through a ref, so `handleClose` never changes identity. Most callers pass an inline
  // arrow for `onOpenChange`, which is a new function on every parent render. With that
  // function in `handleClose`'s dependencies, and `handleClose` in the effect's, the whole
  // effect below tore down and re-ran on each parent render. Its cleanup moves focus back to
  // the element that opened the dialog, so a parent re-render pulled the caret out of the
  // dialog: typing in the connect dialog while the wallet list refreshed lost focus
  // mid-keystroke. Only `open` should start and stop the effect.
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  });
  const handleClose = useCallback(() => onOpenChangeRef.current(false), []);
  useModalIsolation({ open, containerRef: dialogRef, onEscape: handleClose });

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="user-overlay fixed inset-0 z-[100] bg-black/70 backdrop-blur-[2px]">
      <div
        className="flex min-h-dvh items-center justify-center overflow-y-auto p-4 sm:p-6"
        onPointerDown={(event) => {
          // A press anywhere but on this backdrop itself started inside the dialog.
          pointerDownInsideRef.current = event.target !== event.currentTarget;
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
          className={cn(
            "user-overlay flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border/70 bg-background shadow-2xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)]",
            className
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border/60 p-4 sm:p-6">
            <div className="space-y-1">
              <p id={titleId} className="text-base font-semibold text-foreground">
                {title}
              </p>
              {/*
                Every description is shown, at any length. A description over 90 characters
                used to go into an ⓘ tooltip plus an `sr-only` copy and was never rendered
                visibly. The connect dialog's "what connecting grants" text is 195 characters,
                so it ALWAYS took that branch: the one explanation a first-time visitor needs
                before handing over a wallet was the one nobody could see. There is room for
                three lines in a dialog header.
              */}
              {description ? (
                <p id={descriptionId} className="text-sm text-muted-foreground">
                  {description}
                </p>
              ) : null}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClose}
              aria-label={i18n("closeDialog")}
              className="shrink-0 px-2"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div
            className={cn(
              "user-scrollbar min-h-0 flex-1 overflow-y-auto p-4 sm:p-6",
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
