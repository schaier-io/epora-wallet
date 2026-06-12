import { atom } from "jotai";

import type { BuildResult } from "@/lib/types/contracts";
import type { MintConfirmationState } from "@/components/user/workspace/types";

/**
 * Atomic model of the transaction **build/submit lifecycle** — the slice that was
 * the most state-coupled part of the workspace controller (~15 `useState`s threaded
 * through ~13 builders). Each primitive atom maps ≈1:1 to the legacy `useState`;
 * the write-only **action atoms** encapsulate the multi-write choreography the
 * builders used to perform inline, so it becomes pure + testable outside React.
 *
 * See ADR 0001 (`docs/adr/0001-workspace-controller-atomic-jotai-rearchitecture.md`).
 *
 * FUND-SAFETY: atoms are module-global. Fund-sensitive atoms (`previewAtom`,
 * `submitHashAtom`, `mintConfirmationAtom`) MUST be reset on wallet-change /
 * disconnect — use `resetFlowAtom`.
 */

/** Celebration overlay shown after a wallet-mint tx confirms. */
export interface MintCelebration {
  walletName: string;
  sttPolicyId: string | null;
  createdWalletUnit: string;
}

// --- primitive state atoms (≈ 1:1 with the controller's build/submit useStates) ---

/** Label of the action whose build is currently in flight (`null` = idle). */
export const activeBuildAtom = atom<string | null>(null);
/** A submit (sign + send) is in flight. */
export const activeSubmitAtom = atom(false);
export const buildErrorAtom = atom<string | null>(null);
export const buildErrorDetailsAtom = atom<string | null>(null);
/** Hash of the last successfully-submitted transaction. */
export const submitHashAtom = atom<string | null>(null);
/** The built-but-not-yet-submitted transaction awaiting review/sign. */
export const previewAtom = atom<BuildResult | null>(null);
/** The action signature the current `preview` was built for (staleness guard). */
export const previewSignatureAtom = atom<string | null>(null);
export const lastActionLabelAtom = atom("");
export const mintConfirmationAtom = atom<MintConfirmationState | null>(null);
export const mintCelebrationAtom = atom<MintCelebration | null>(null);
export const dismissedSubmitHashAtom = atom<string | null>(null);

// --- write-only action atoms (encapsulate the multi-write choreography) ---

/** Pre-flight check failed before a build started (no wallet / wrong network). */
export const precheckFailedAtom = atom(null, (_get, set, message: string) => {
  set(buildErrorAtom, message);
  set(buildErrorDetailsAtom, null);
});

/** A build began for `label`: clear prior error/hash/confirmation; any stale preview is kept until success/failure. */
export const buildStartedAtom = atom(null, (_get, set, label: string) => {
  set(activeBuildAtom, label);
  set(buildErrorAtom, null);
  set(buildErrorDetailsAtom, null);
  set(submitHashAtom, null);
  set(mintConfirmationAtom, null);
});

/** A build produced a preview for `label`. */
export const buildSucceededAtom = atom(
  null,
  (_get, set, payload: { preview: BuildResult; label: string; signature: string | null }) => {
    set(previewAtom, payload.preview);
    set(lastActionLabelAtom, payload.label);
    set(previewSignatureAtom, payload.signature);
  }
);

/** A build threw. */
export const buildFailedAtom = atom(
  null,
  (_get, set, payload: { message: string; details: string | null }) => {
    set(buildErrorAtom, payload.message);
    set(buildErrorDetailsAtom, payload.details);
  }
);

/** Build finished (success or failure): the in-flight marker clears. */
export const buildSettledAtom = atom(null, (_get, set) => {
  set(activeBuildAtom, null);
});

export const submitStartedAtom = atom(null, (_get, set) => {
  set(activeSubmitAtom, true);
});

export const submitSucceededAtom = atom(null, (_get, set, hash: string) => {
  set(submitHashAtom, hash);
});

export const submitSettledAtom = atom(null, (_get, set) => {
  set(activeSubmitAtom, false);
});

/**
 * Reset all build/submit *display* state. Used by the wallet-change reset effect
 * and the explicit "clear preview" action. (Does not touch `mintCelebration` or
 * `dismissedSubmitHash`, mirroring the legacy `clearPreviewResult`.)
 */
export const resetFlowAtom = atom(null, (_get, set) => {
  set(previewAtom, null);
  set(previewSignatureAtom, null);
  set(lastActionLabelAtom, "");
  set(buildErrorAtom, null);
  set(buildErrorDetailsAtom, null);
  set(submitHashAtom, null);
  set(mintConfirmationAtom, null);
});

/** Clear only the error banner (leaves any preview intact) — legacy `clearBuildMessages`. */
export const clearMessagesAtom = atom(null, (_get, set) => {
  set(buildErrorAtom, null);
  set(buildErrorDetailsAtom, null);
});

/**
 * Reset EVERY flow atom to its initial value. Because atoms are module-global,
 * the workspace calls this on unmount so each fresh mount starts clean — mirroring
 * the per-mount reset that component-local `useState` gave for free. Also the
 * natural hook for wallet-change / disconnect.
 */
export const resetAllFlowAtom = atom(null, (_get, set) => {
  set(activeBuildAtom, null);
  set(activeSubmitAtom, false);
  set(buildErrorAtom, null);
  set(buildErrorDetailsAtom, null);
  set(submitHashAtom, null);
  set(previewAtom, null);
  set(previewSignatureAtom, null);
  set(lastActionLabelAtom, "");
  set(mintConfirmationAtom, null);
  set(mintCelebrationAtom, null);
  set(dismissedSubmitHashAtom, null);
});

/**
 * Monotonic run-id for the mint-confirmation polling loop — bumped whenever a new
 * confirmation run starts or the flow is cleared, so in-flight async polls detect
 * they are stale (`captured !== current`) and abort. An atom (read/written via the
 * jotai store) rather than a `useRef`, so the React Compiler doesn't choke on the
 * read/write-across-callbacks ref pattern when the controller adopts `useAtom`.
 */
export const mintConfirmationRunAtom = atom(0);

/** Snapshot of the wallet name as it was at mint-submit time (read during render by the
 * celebration overlay — must be reactive state/atom, never a ref). */
export const mintedWalletNameAtom = atom("");

// --- derived atoms (read-only; the shape that will absorb the controller's memos) ---

/** A build is currently in flight. */
export const isBuildingAtom = atom((get) => get(activeBuildAtom) !== null);
