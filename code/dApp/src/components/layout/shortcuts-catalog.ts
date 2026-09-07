/**
 * The keyboard-shortcut map, as data.
 *
 * Split out of `shortcuts-help.tsx` so a test can hold the one invariant this list has:
 * every label must be a name the destination actually carries. The list is a map of the
 * app, and a map that renames the places it points at is worse than no map. Three labels
 * had drifted into names used nowhere else -- `Send money` (the screen says "Send funds"),
 * `Receive money` (it says "Add funds") and `Create a new wallet` (it says "Create wallet").
 *
 * Pure data, no React, no JSX. Same reason `guided-admin-catalog.ts` is separate.
 */

export type ShortcutLabelKey =
  | "showTheseShortcuts"
  | "closeOpenedDialog"
  | "nextField"
  | "previousField"
  | "walletHome"
  | "sendFunds"
  | "addFunds"
  | "people"
  | "walletSettings"
  | "scheduledPayments"
  | "createWallet";

export type Shortcut = { keys: string[]; labelKey: ShortcutLabelKey; sequence?: boolean };

export const SHORTCUTS: Shortcut[] = [
  { keys: ["?"], labelKey: "showTheseShortcuts" },
  { keys: ["Esc"], labelKey: "closeOpenedDialog" },
  { keys: ["Tab"], labelKey: "nextField" },
  { keys: ["Shift", "Tab"], labelKey: "previousField" },
  { keys: ["g", "h"], labelKey: "walletHome", sequence: true },
  { keys: ["g", "s"], labelKey: "sendFunds", sequence: true },
  { keys: ["g", "r"], labelKey: "addFunds", sequence: true },
  { keys: ["g", "p"], labelKey: "people", sequence: true },
  { keys: ["g", "w"], labelKey: "walletSettings", sequence: true },
  { keys: ["g", "u"], labelKey: "scheduledPayments", sequence: true },
  { keys: ["g", "c"], labelKey: "createWallet", sequence: true }
];

/**
 * Second key after `g`, to the query it opens. `?wallet` is carried across every one of
 * these by the handler; see the comment on that block for what losing it costs.
 */
export const NAV_TARGETS: Record<string, string> = {
  h: "?step=overview",
  s: "?action=send&step=configure",
  r: "?action=add-funds&step=configure",
  // People merged into Wallet settings; `g p` still means People, so it opens the
  // merged surface directly on that tab.
  p: "?action=wallet-settings&task=settings-people&step=configure",
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
