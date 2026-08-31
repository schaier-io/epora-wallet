
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/LibUtilsClipboard.json";

const i18n = createDefaultTranslator("LibUtilsClipboard", defaultMessages);/**
 * What to tell the user when both clipboard paths fail. The clipboard API needs a secure
 * context, so it is simply absent when the app is served over plain HTTP on a LAN address --
 * a normal way to try a preprod dApp on a phone. The user has to know their clipboard still
 * holds whatever it held before, or they will paste it into an address field.
 */
export const CLIPBOARD_BLOCKED_MESSAGE = {
  title: i18n("nothingWasCopied"),
  description:
    i18n("yourBrowserBlockedClipboardAccessSelectTheText")
} as const;

export async function copyTextToClipboard(value: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // fall through to legacy fallback
    }
  }

  if (typeof document === "undefined") {
    return false;
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
