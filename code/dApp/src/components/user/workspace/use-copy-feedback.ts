import { useCallback } from "react";
import { useSetAtom } from "jotai";
import { copyFeedbackAtom } from "@/components/user/workspace/atoms/workspace-ui.atoms";
import { CLIPBOARD_BLOCKED_MESSAGE, copyTextToClipboard as writeToClipboard } from "@/lib/utils/clipboard";
import { useToast } from "@/providers/toast-provider";

export type CopyFeedbackController = {
  /** Copy `value` to the clipboard and flash `successLabel` as feedback. */
  copyTextToClipboard: (value: string, successLabel: string) => Promise<void>;
};

/**
 * Owns the transient "copied to clipboard" feedback slice, including the auto-clear timer. The
 * feedback label itself lives in {@link copyFeedbackAtom} so any view reads it directly via
 * `useAtomValue`; this hook only exposes the copy action.
 *
 * Failure goes to a toast rather than into the atom. Every view reads the atom by comparing it
 * against its own success label -- `copyFeedback === "Wallet address copied"` and friends -- so
 * a failure label written there matches no branch anywhere and renders as nothing at all.
 */
export function useCopyFeedback(): CopyFeedbackController {
  const setCopyFeedback = useSetAtom(copyFeedbackAtom);
  const toast = useToast();

  const copyTextToClipboard = useCallback(
    async (value: string, successLabel: string) => {
      // The shared helper, not `navigator.clipboard` directly: it falls back to the legacy
      // path, so some of the browsers that used to fail here now succeed.
      if (!(await writeToClipboard(value))) {
        toast.error(CLIPBOARD_BLOCKED_MESSAGE);
        return;
      }

      setCopyFeedback(successLabel);
      window.setTimeout(() => {
        setCopyFeedback((current) => (current === successLabel ? null : current));
      }, 1800);
    },
    [setCopyFeedback, toast]
  );

  return { copyTextToClipboard };
}
