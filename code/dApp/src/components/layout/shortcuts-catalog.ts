/**
 * The keyboard-shortcut map, as data.
 *
 * Split out of `shortcuts-help.tsx` so a test can hold the one invariant this list has:
 * every label must be a name the destination actually carries. The list is a map of the
 * app, and a map that renames the places it points at is worse than no map. Three labels
 * had drifted into names used nowhere else -- `Send money` (the screen says "Send funds"),
 * `Receive money` (it says "Add funds") and `Create a new wallet` (it says "Create wallet").
 *
 * Pure data, no React, no JSX. Same reason `guided-admin-catalog.ts` is separate. The
 * labels come from the message catalog through the default translator, the same way the
 * other non-React modules read their copy.
 */
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsLayoutShortcutsCatalog.json";

const i18n = createDefaultTranslator("ComponentsLayoutShortcutsCatalog", defaultMessages);

export type Shortcut = { keys: string[]; label: string; sequence?: boolean };

export const SHORTCUTS: Shortcut[] = [
  { keys: ["?"], label: i18n("showTheseShortcuts") },
  { keys: ["Esc"], label: i18n("closeADialogYouOpened") },
  { keys: ["Tab"], label: i18n("nextField") },
  { keys: ["Shift", "Tab"], label: i18n("previousField") },
  { keys: ["g", "h"], label: i18n("walletHome"), sequence: true },
  { keys: ["g", "s"], label: i18n("sendFunds"), sequence: true },
  { keys: ["g", "r"], label: i18n("addFunds"), sequence: true },
  { keys: ["g", "p"], label: i18n("people"), sequence: true },
  { keys: ["g", "w"], label: i18n("walletSettings"), sequence: true },
  { keys: ["g", "u"], label: i18n("scheduledPayments"), sequence: true },
  { keys: ["g", "c"], label: i18n("createWallet"), sequence: true }
];

/**
 * Second key after `g`, to the query it opens. `?wallet` is carried across every one of
 * these by the handler; see the comment on that block for what losing it costs.
 */
export const NAV_TARGETS: Record<string, string> = {
  h: "?step=overview",
  s: "?action=send&step=configure",
  r: "?action=add-funds&step=configure",
  p: "?action=manage-people&step=configure",
  w: "?action=wallet-settings&step=configure",
  u: "?action=manage-streaming-payments&step=configure"
};

/**
 * `g c` is deliberately not in `NAV_TARGETS`: starting wallet creation clears the wallet
 * selection, which is what the `start-create-wallet` reducer does too
 * (`workspace-controller.ts:282-292`, `selectedWalletUnit: null`). Preserving `?wallet`
 * here would make the keyboard path disagree with the button path.
 */
export const CREATE_WALLET_TARGET = "?action=create-wallet&step=configure";
