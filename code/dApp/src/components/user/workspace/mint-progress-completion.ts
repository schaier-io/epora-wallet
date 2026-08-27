import { type ReviewCompletion } from "@/components/user/review-panel";
import { MINT_CONFIRMATION_MAX_ATTEMPTS } from "@/components/user/workspace/constants";
import { type MintConfirmationState } from "@/components/user/workspace/types";

/**
 * The words the mint progress overlay shows while a wallet is being created.
 *
 * `workspace-view.tsx` mounts that overlay only while `phase !== "confirmed"`, so nothing
 * here may speak as though the wallet already exists: the celebration overlay does the
 * congratulating, and it mounts on the confirmation itself. Extracted from the view so the
 * phase-to-wording map is a pure function with a test, rather than an inline IIFE.
 */
export type MintProgressCopy = Pick<
  ReviewCompletion,
  "title" | "description" | "statusLabel" | "progress"
>;

export function buildMintProgressCopy(
  mintConfirmation: MintConfirmationState | null,
  walletName: string
): MintProgressCopy {
  const attempts = mintConfirmation?.attempts ?? 0;
  const maxAttempts = mintConfirmation?.maxAttempts ?? MINT_CONFIRMATION_MAX_ATTEMPTS;
  const phase = mintConfirmation?.phase ?? "waiting";

  const progress =
    phase === "confirmed"
      ? 100
      : phase === "delayed"
        ? 92
        : phase === "submitting"
          ? 8
          : Math.min(90, 30 + Math.round((attempts / maxAttempts) * 55));

  const statusLabel =
    phase === "confirmed"
      ? "Live on-chain. Save or share your card, then open it when ready."
      : phase === "refreshing"
        ? "Checking the network for your new wallet…"
        : phase === "delayed"
          ? "Still waiting. This can take another block."
          : phase === "submitting"
            ? "Sending to the network…"
            : "Waiting for the network to confirm.";

  const title =
    phase === "submitting" ? `Creating ${walletName}…` : `Confirming ${walletName}…`;

  const description =
    phase === "submitting"
      ? "Broadcasting the transaction you just signed."
      : phase === "confirmed"
        ? "Your smart wallet is live on Cardano Preprod. Save or share your membership card below, then open your wallet whenever you're ready."
        : // Closing the overlay only hides it (`onClose` sets `dismissedSubmitHash`); the
          // confirmation poll and the celebration both carry on without it. So this must not
          // ask the reader to keep it open.
          "Your transaction is on the network. This usually takes a block or two.";

  return { title, description, statusLabel, progress };
}
