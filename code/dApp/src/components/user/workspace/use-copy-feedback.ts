import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { useSetAtom } from "jotai";
import { copyFeedbackAtom } from "@/components/user/workspace/atoms/workspace-ui.atoms";

export type CopyFeedbackController = {
  /** Copy `value` to the clipboard and flash `successLabel` as feedback. */
  copyTextToClipboard: (value: string, successLabel: string) => Promise<void>;
};

/**
 * Owns the transient "copied to clipboard" feedback slice, including the auto-clear timer. The
 * feedback label itself lives in {@link copyFeedbackAtom} so any view reads it directly via
 * `useAtomValue`; this hook only exposes the copy action.
 */
export function useCopyFeedback(): CopyFeedbackController {
  const i18n = useTranslations("ComponentsUserWorkspaceUseCopyFeedback");
  const setCopyFeedback = useSetAtom(copyFeedbackAtom);

  const copyTextToClipboard = useCallback(
    async (value: string, successLabel: string) => {
      try {
        await navigator.clipboard.writeText(value);
        setCopyFeedback(successLabel);
        window.setTimeout(() => {
          setCopyFeedback((current) => (current === successLabel ? null : current));
        }, 1800);
      } catch {
        setCopyFeedback(i18n("copyFailed"));
      }
    },
    [i18n, setCopyFeedback]
  );

  return { copyTextToClipboard };
}
