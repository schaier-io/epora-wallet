import { type ReviewCompletion } from "@/components/user/review-panel";
import { MINT_CONFIRMATION_MAX_ATTEMPTS } from "@/components/user/workspace/constants";
import { type MintConfirmationState } from "@/components/user/workspace/types";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceMintProgressCompletion.json";

const i18n = createDefaultTranslator("ComponentsUserWorkspaceMintProgressCompletion", defaultMessages);

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
      ? i18n("liveOnChainSaveOrShareYourCard")
      : phase === "refreshing"
        ? i18n("checkingTheNetworkForYourNewWallet")
        : phase === "delayed"
          ? i18n("stillWaitingThisCanTakeAnotherBlock")
          : phase === "submitting"
            ? i18n("sendingToTheNetwork")
            : i18n("waitingForTheNetworkToConfirm");

  const title =
    phase === "submitting"
      ? i18n("creatingWallet", { walletName })
      : i18n("confirmingWallet", { walletName });

  const description =
    phase === "submitting"
      ? i18n("broadcastingTheTransactionYouJustSigned")
      : phase === "confirmed"
        ? i18n("yourSmartWalletIsLiveOnCardanoPreprod")
        : // Closing the overlay only hides it (`onClose` sets `dismissedSubmitHash`); the
          // confirmation poll and the celebration both carry on without it. So this must not
          // ask the reader to keep it open.
          i18n("yourTransactionIsOnTheNetwork");

  return { title, description, statusLabel, progress };
}
