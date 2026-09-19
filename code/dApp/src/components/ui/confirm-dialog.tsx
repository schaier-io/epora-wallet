"use client";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PopupDialog } from "@/components/ui/popup-dialog";

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
};

// Confirmation step for an irreversible action, over the shared PopupDialog.
// Every label comes from the caller so each surface names its own consequence
// and its own co-signer impact; this primitive holds no copy of its own.
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = false,
  busy = false,
  onConfirm
}: ConfirmDialogProps) {
  return (
    <PopupDialog open={open} onOpenChange={onOpenChange} title={title} description={description} className="max-w-md">
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button
          type="button"
          variant={destructive ? "destructive" : "default"}
          onClick={onConfirm}
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {confirmLabel}
        </Button>
      </div>
    </PopupDialog>
  );
}
