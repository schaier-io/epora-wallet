"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { PopupDialog } from "@/components/ui/popup-dialog";

/**
 * Irreversible person/owner/contact removes. The trigger only opens the dialog;
 * `onConfirm` runs after the reader confirms. Same shape as "Clear form" in
 * `action-configuration-card.tsx`: title, body, cancel left, destructive confirm right.
 */
export function DestructiveRemoveButton({
  label,
  confirmTitle,
  confirmBody,
  cancelLabel,
  onConfirm
}: {
  label: string;
  confirmTitle: string;
  confirmBody: string;
  cancelLabel: string;
  onConfirm: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        onClick={() => setConfirming(true)}
      >
        {label}
      </Button>
      <PopupDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={confirmTitle}
        description={confirmBody}
        className="max-w-lg"
      >
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setConfirming(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => {
              setConfirming(false);
              onConfirm();
            }}
          >
            {label}
          </Button>
        </div>
      </PopupDialog>
    </>
  );
}
