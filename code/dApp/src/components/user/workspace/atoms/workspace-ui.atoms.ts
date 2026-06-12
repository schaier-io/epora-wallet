import { atom } from "jotai";

/**
 * Atomic model of the workspace's **transient UI state** — the handful of view-only
 * `useState`s that the controller used to own and thread through its return object +
 * the various sub-hook contexts. Promoting them to atoms lets each view / hook read the
 * value where it is used (`useAtomValue` / `useSetAtom`) instead of receiving it via a
 * giant prop/ctx surface, which dissolves those threading lines from the controller.
 *
 * These are pure UI state (no funds): which asset-detail is open, the token search box,
 * the guided-overview tab, the connection dialog, and the connect-step pin. Atoms are
 * module-global, so they are reset on workspace unmount / wallet-change via
 * `resetWorkspaceUiAtom` to mirror the per-mount reset that component-local `useState` gave.
 */

/** The unit (assetId / "lovelace") whose detail panel is open, or `null`. */
export const assetDetailUnitAtom = atom<string | null>(null);
/** The detected-token search box query. */
export const detectedTokenSearchAtom = atom("");
/** Whether the connect step is pinned open in the guided flow. */
export const connectStepPinnedAtom = atom(false);
/** The active guided-overview section tab. */
export const guidedOverviewSectionAtom = atom<"home" | "transactions">("home");
/** Whether the wallet-connection dialog is open. */
export const walletConnectionDialogOpenAtom = atom(false);
/** Transient "copied to clipboard" feedback label (auto-cleared ~1.8s after a copy). */
export const copyFeedbackAtom = atom<string | null>(null);
/** Most-recent custom send recipients (localStorage-backed, re-read on mount), newest first. */
export const recentRecipientsAtom = atom<string[]>([]);
/**
 * Mount-time clock (ms) for time-relative DISPLAY fallbacks (wealth-chart timestamps, streaming
 * due preview). Seeded once by the foundation on mount (defaults to 0 pre-mount to avoid an SSR
 * hydration mismatch); the tx-build path computes its own Date.now() at build time.
 */
export const renderNowMsAtom = atom(0);

/**
 * Reset every workspace UI atom to its initial value. Called on workspace unmount so each
 * fresh mount starts clean (mirrors the per-mount reset of component-local `useState`).
 */
export const resetWorkspaceUiAtom = atom(null, (_get, set) => {
  set(assetDetailUnitAtom, null);
  set(detectedTokenSearchAtom, "");
  set(connectStepPinnedAtom, false);
  set(guidedOverviewSectionAtom, "home");
  set(walletConnectionDialogOpenAtom, false);
  set(copyFeedbackAtom, null);
});
