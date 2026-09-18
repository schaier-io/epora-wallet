/**
 * Pure matcher for the app's keyboard shortcuts, split out of `shortcuts-help.tsx` so
 * node:test can drive every branch (prefix expiry, modal suppression, the Konami tracker)
 * without a DOM. The component stays a view: it adapts the DOM `KeyboardEvent` into a
 * `ShortcutKeyEvent`, applies the returned action to the router and dialog state, and owns
 * the two DOM reads the engine must not (`isTypingTarget`, `isModalOpen`).
 *
 * The engine carries the two pieces of stateful matching the handler used to hold in refs:
 * the armed `g` prefix (with its expiry) and the Konami-code progress. One factory call per
 * mounted component; never share an instance across components.
 */

import { CREATE_WALLET_TARGET, NAV_TARGETS } from "@/lib/shortcuts/registry";

/** How long after `g` the second key may still land. Matches the previous handler's 1200. */
export const SHORTCUT_PREFIX_TIMEOUT_MS = 1200;

// Hidden reward: the Konami code (Up Up Down Down Left Right Left Right B A)
// opens a redeemable CRT terminal. A quiet nod for the curious.
const KONAMI_CODE = [
  "arrowup",
  "arrowup",
  "arrowdown",
  "arrowdown",
  "arrowleft",
  "arrowright",
  "arrowleft",
  "arrowright",
  "b",
  "a"
];

/** The DOM-independent slice of a `KeyboardEvent` the engine is allowed to see. */
export type ShortcutKeyEvent = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  /** The event target is a text field, contenteditable, or other typing surface. */
  isTypingTarget: boolean;
  /** A modal or portalled overlay currently owns the screen. */
  isModalOpen: boolean;
};

export type ShortcutAction =
  | { type: "none" }
  /** A bare `g`: consumed to arm the prefix, nothing visible yet. */
  | { type: "swallow" }
  | { type: "openHelp" }
  | { type: "showEasterEgg" }
  | { type: "navigate"; target: string; preserveWallet: boolean };

export type ShortcutEngine = (event: ShortcutKeyEvent) => ShortcutAction;

export function createShortcutEngine(now: () => number = Date.now): ShortcutEngine {
  let pendingPrefix: { key: string; expires: number } | null = null;
  let konamiProgress = 0;

  return function handleShortcutEvent(event: ShortcutKeyEvent): ShortcutAction {
    if (event.metaKey || event.ctrlKey || event.altKey) return { type: "none" };
    if (event.isTypingTarget) return { type: "none" };
    // Before the Konami tracker too: nothing here should reach behind a modal.
    if (event.isModalOpen) return { type: "none" };

    // Track the Konami code. Each correct key advances; any wrong key resets
    // (but a key that matches the start keeps the run alive). The code's last key
    // is `a`, which matches nothing below, so a completion is only ever observed
    // on the fall-through path.
    let konamiCompleted = false;
    const konamiKey = event.key.toLowerCase();
    if (konamiKey === KONAMI_CODE[konamiProgress]) {
      konamiProgress += 1;
      if (konamiProgress === KONAMI_CODE.length) {
        konamiProgress = 0;
        konamiCompleted = true;
      }
    } else {
      konamiProgress = konamiKey === KONAMI_CODE[0] ? 1 : 0;
    }

    if (event.key === "?") {
      pendingPrefix = null;
      return konamiCompleted ? { type: "showEasterEgg" } : { type: "openHelp" };
    }

    const nowMs = now();
    const pending = pendingPrefix;
    if (pending && pending.key === "g" && nowMs < pending.expires) {
      const key = event.key.toLowerCase();
      // Creating a wallet used to answer to a bare `c`. `c` is a browse-mode quick-nav key
      // in NVDA and JAWS, and the typing guard only skips text fields, so a screen-reader
      // user pressing it anywhere else landed in the wallet-creation flow. It keeps the
      // same destination; it just asks for the same `g` prefix as every other jump.
      if (key === "c") {
        pendingPrefix = null;
        return { type: "navigate", target: `/user${CREATE_WALLET_TARGET}`, preserveWallet: false };
      }
      const navTarget = NAV_TARGETS[key];
      if (navTarget) {
        pendingPrefix = null;
        return { type: "navigate", target: `/user${navTarget}`, preserveWallet: true };
      }
    }

    if (event.key.toLowerCase() === "g") {
      pendingPrefix = { key: "g", expires: nowMs + SHORTCUT_PREFIX_TIMEOUT_MS };
      return { type: "swallow" };
    }

    pendingPrefix = null;
    return konamiCompleted ? { type: "showEasterEgg" } : { type: "none" };
  };
}
