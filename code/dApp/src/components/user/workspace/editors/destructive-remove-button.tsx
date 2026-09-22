"use client";

import { useRef, useState } from "react";

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
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  /**
   * Put focus back on the list the row was in.
   *
   * `use-modal-isolation.ts` restores focus to whatever held it when the dialog
   * opened, which is this trigger. The confirm removes the row the trigger sits in,
   * so by then the trigger is detached, and `focus()` on a detached element does
   * nothing: measured after a confirmed removal, `document.activeElement` was
   * `BODY`, leaving a keyboard reader at the top of the document.
   *
   * The nearest ancestor that is still connected after the removal is the list, so
   * that is where focus goes. The `tabindex` is added only when the element has none
   * and is taken off again as soon as focus leaves, so nothing is left in the tab
   * order that was not there before.
   */
  const focusSurvivingList = () => {
    const ancestors: HTMLElement[] = [];
    for (let element = triggerRef.current?.parentElement; element; element = element.parentElement) {
      ancestors.push(element);
    }
    requestAnimationFrame(() => {
      const survivor = ancestors.find((element) => element.isConnected);
      if (!survivor) return;
      if (survivor.hasAttribute("tabindex")) {
        survivor.focus({ preventScroll: true });
        return;
      }
      survivor.setAttribute("tabindex", "-1");
      survivor.addEventListener(
        "blur",
        () => survivor.removeAttribute("tabindex"),
        { once: true }
      );
      survivor.focus({ preventScroll: true });
    });
  };

  return (
    <>
      <Button
        ref={triggerRef}
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
              focusSurvivingList();
            }}
          >
            {label}
          </Button>
        </div>
      </PopupDialog>
    </>
  );
}
