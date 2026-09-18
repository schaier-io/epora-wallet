import { atom } from "jotai";

/**
 * Whether the keyboard-shortcuts dialog is open. Shared, not component-local, because two
 * controls open the same dialog: the global `?` key handled in `shortcuts-help.tsx` and the
 * footer's "Press ? for shortcuts" button in `site-footer.tsx`, which is a sibling subtree
 * and cannot reach a `useState` in the help component. Same pattern as
 * `walletConnectionDialogOpenAtom` for the connect dialog. There is no close path outside
 * the dialog itself, so the flag never needs a reset-on-unmount.
 */
export const shortcutsHelpOpenAtom = atom(false);
