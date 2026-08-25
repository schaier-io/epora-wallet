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

export type Shortcut = { keys: string[]; label: string; sequence?: boolean };

export const SHORTCUTS: Shortcut[] = [
  { keys: ["?"], label: "Show these shortcuts" },
  { keys: ["Esc"], label: "Close a dialog you opened" },
  { keys: ["Tab"], label: "Next field" },
  { keys: ["Shift", "Tab"], label: "Previous field" },
  { keys: ["g", "h"], label: "Wallet home", sequence: true },
  { keys: ["g", "s"], label: "Send funds", sequence: true },
  { keys: ["g", "r"], label: "Add funds", sequence: true },
  { keys: ["g", "p"], label: "People", sequence: true },
  { keys: ["g", "w"], label: "Wallet settings", sequence: true },
  { keys: ["g", "u"], label: "Scheduled payments", sequence: true },
  { keys: ["g", "c"], label: "Create wallet", sequence: true }
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
