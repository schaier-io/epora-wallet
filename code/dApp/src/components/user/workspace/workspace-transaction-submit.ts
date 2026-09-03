import { buildDiagnosticIdAtom, mintConfirmationRunAtom, submitConfirmationAtom, submitHashAtom } from "@/components/user/workspace/atoms/transaction-flow.atoms";
import { resetLockFundsFormAtom } from "@/components/user/workspace/atoms/forms/lock-funds-form.atoms";
import { sttExtraTransfersAtom } from "@/components/user/workspace/atoms/forms/stt-spend-form.atoms";
import {
  MINT_CONFIRMATION_MAX_ATTEMPTS,
  SUBMIT_CONFIRMATION_INITIAL_DELAY_MS,
  SUBMIT_CONFIRMATION_MAX_ATTEMPTS,
  SUBMIT_CONFIRMATION_POLL_MS
} from "@/components/user/workspace/constants";
import { fetchTransactionsByHash, formatBuildError, waitFor } from "@/components/user/workspace/helpers";
import type { resolveWorkspaceTransactionInputs } from "@/components/user/workspace/workspace-transaction-inputs";
import { schedulePostSubmitRefresh } from "@/components/user/workspace/workspace-transaction-refresh";
import type { WorkspaceTransactionsCtx } from "@/components/user/workspace/workspace-transactions-types";
import { normalizeWalletName } from "@/lib/contracts/state-wallet-name";
import { signAndSubmitTx } from "@/lib/mesh/transactions";
import type { BuildResult } from "@/lib/types/contracts";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceWorkspaceTransactions.json";

const i18n = createDefaultTranslator("ComponentsUserWorkspaceWorkspaceTransactions", defaultMessages);

// The wallet, lifecycle, and refresh surface the sign-and-send path closes over,
// plus the two form snapshots `resolveWorkspaceTransactionInputs` gathered for
// the builders (the mint name snapshot and the staged payout transfers).
type SubmitDeps = Pick<
  WorkspaceTransactionsCtx,
  | "activeWallet"
  | "activeWalletName"
  | "isDemoWallet"
  | "networkId"
  | "jotaiStore"
  | "selectedAction"
  | "preview"
  | "previewMatchesSelectedAction"
  | "submitHash"
  | "submitInFlightRef"
  | "setActiveSubmit"
  | "setBuildError"
  | "setBuildErrorExpected"
  | "setSubmitHash"
  | "setMintConfirmation"
  | "setMintedWalletName"
  | "addSubmittedTransactionToActivity"
  | "rememberRecipients"
  | "refreshDetectedTokens"
  | "refreshLockedContractUtxos"
  | "refreshPermissionWalletSummaries"
  | "refreshWalletBalance"
  | "lockingContract"
  | "postSubmitRefreshTimersRef"
  | "watchMintCreationConfirmation"
> & {
  mintStateForm: ReturnType<typeof resolveWorkspaceTransactionInputs>["mintStateForm"];
  sttExtraTransfers: ReturnType<typeof resolveWorkspaceTransactionInputs>["sttExtraTransfers"];
};

/**
 * The SUBMIT half of the build/submit flow: guard, sign, send, and the
 * post-submit bookkeeping. Extracted from `workspace-transactions.ts` to keep
 * that module under the repo's 750-line cap; the build half stays there and
 * calls into this factory. Same i18n namespace as the build half, so the two
 * share one message catalog.
 */
export function createWorkspaceTransactionSubmit(deps: SubmitDeps) {
  const {
    activeWallet,
    activeWalletName,
    isDemoWallet,
    networkId,
    jotaiStore,
    selectedAction,
    preview,
    previewMatchesSelectedAction,
    submitHash,
    submitInFlightRef,
    setActiveSubmit,
    setBuildError,
    setBuildErrorExpected,
    setSubmitHash,
    setMintConfirmation,
    setMintedWalletName,
    addSubmittedTransactionToActivity,
    rememberRecipients,
    refreshLockedContractUtxos,
    refreshPermissionWalletSummaries,
    refreshWalletBalance,
    lockingContract,
    watchMintCreationConfirmation,
    mintStateForm,
    sttExtraTransfers
  } = deps;

  async function submitTransactionPreview(
    transactionPreview: BuildResult,
    options: { allowExistingSubmitHash?: boolean; requireCurrentPreview?: boolean } = {}
  ) {
    const { allowExistingSubmitHash = false, requireCurrentPreview = true } = options;

    // Synchronous re-entry guard: blocks the second handler call when the
    // user double-clicks before React re-renders the button as disabled.
    if (submitInFlightRef.current) {
      return;
    }

    // Cleared before the guarded exits below, so a new expected error never
    // keeps the diagnostic id of an earlier unexpected failure.
    jotaiStore.set(buildDiagnosticIdAtom, null);

    if (!activeWallet) {
      setBuildError(i18n("connectWalletFirst"));
      setBuildErrorExpected(true);
      return;
    }

    if (isDemoWallet) {
      setBuildError(
        i18n("demoWalletCannotConfirmActionsConnectABrowser")
      );
      setBuildErrorExpected(true);
      return;
    }

    if (submitHash && !allowExistingSubmitHash) {
      setBuildError(i18n("thisActionWasAlreadyCompletedChangeSomethingBefore"));
      setBuildErrorExpected(true);
      return;
    }

    if (!transactionPreview.txHex) {
      setBuildError(i18n("theTransactionCouldNotBePreparedTryAgain"));
      setBuildErrorExpected(true);
      return;
    }

    if (
      requireCurrentPreview &&
      (!previewMatchesSelectedAction || preview?.txHex !== transactionPreview.txHex)
    ) {
      setBuildError(i18n("theTransactionDetailsAreStaleContinueAgainTo_34b074"));
      setBuildErrorExpected(true);
      return;
    }

    submitInFlightRef.current = true;
    setActiveSubmit(true);
    setBuildError(null);
    setBuildErrorExpected(false);

    if (selectedAction === "mint") {
      // Snapshot the name now, before the post-submit list refresh can bump the
      // live form value, so the celebration shows the name actually minted.
      setMintedWalletName(normalizeWalletName(mintStateForm.walletName));
      jotaiStore.set(mintConfirmationRunAtom, jotaiStore.get(mintConfirmationRunAtom) + 1);
      setMintConfirmation({
        txHash: "",
        phase: "submitting",
        attempts: 0,
        maxAttempts: MINT_CONFIRMATION_MAX_ATTEMPTS,
        updatedAt: Date.now()
      });
    }

    try {
      const txHash = await signAndSubmitTx(activeWallet, transactionPreview.txHex);
      setSubmitHash(txHash);
      jotaiStore.set(submitConfirmationAtom, "pending");
      void watchTransactionConfirmation(txHash);
      void addSubmittedTransactionToActivity(txHash);
      if (
        selectedAction === "use" ||
        selectedAction === "use-allowance" ||
        selectedAction === "use-beneficiary"
      ) {
        rememberRecipients(sttExtraTransfers.map((transfer) => transfer.address));
        // Clear the payouts this transaction just sent. Leaving them staged made the
        // review rail keep describing the send in the future tense -- "You are sending
        // 5 ₳ to ..." -- over money that had already left the wallet, with Next step
        // still saying "Review the receipt and continue".
        jotaiStore.set(sttExtraTransfersAtom, []);
      }
      if (selectedAction === "lock-funds") {
        // Same reason: the receipt read "You are adding 10 ₳ to the selected wallet."
        // after the 10 ₳ had already been locked.
        jotaiStore.set(resetLockFundsFormAtom);
      }
      void refreshWalletBalance();
      void refreshLockedContractUtxos(lockingContract.address);
      if (selectedAction === "mint") {
        void watchMintCreationConfirmation(txHash);
      } else {
        void refreshPermissionWalletSummaries();
        // The immediate refresh above runs before the tx confirms; re-poll over
        // the next ~75s so the wallet updates itself once the tx lands.
        schedulePostSubmitRefresh(deps);
      }
    } catch (error) {
      const parsed = formatBuildError(error, {
        action: "submit",
        wallet: activeWalletName,
        networkId,
        context: {
          previewAction: transactionPreview.preview.action,
          previewSummary: transactionPreview.preview.summary
        }
      });
      setBuildError(parsed.message, parsed.staleInputs);
      setBuildErrorExpected(parsed.expected);
      jotaiStore.set(buildDiagnosticIdAtom, parsed.diagnosticId);
      if (selectedAction === "mint") {
        jotaiStore.set(mintConfirmationRunAtom, jotaiStore.get(mintConfirmationRunAtom) + 1);
        setMintConfirmation(null);
      }
      // Recognised outcomes (a declined signature, a named ledger rule) are shown to the
      // reader and stay out of the console; only the genuinely unexpected get logged.
      if (!parsed.expected) {
        console.error("[submit]", parsed.diagnosticId, parsed.details);
      }
    } finally {
      setActiveSubmit(false);
      submitInFlightRef.current = false;
    }
  }

  /**
   * The review rail's submitted banner promises "your balance updates after the
   * next block", but nothing ever told it when the block arrived, so the spinner
   * span forever. Poll a bounded number of times until an indexer sees the hash,
   * then flip the banner to confirmed and pull the balance once more.
   *
   * Exhausting the poll is its own outcome. Falling out of the loop used to leave
   * the status on `"pending"`, which spun the same spinner for the rest of the
   * session over a transaction nobody was still watching. Record `"timed-out"`
   * instead and leave `submitHashAtom` set, so the rail can point at Cardanoscan.
   */
  async function watchTransactionConfirmation(txHash: string) {
    for (let attempt = 1; attempt <= SUBMIT_CONFIRMATION_MAX_ATTEMPTS; attempt += 1) {
      await waitFor(
        attempt === 1 ? SUBMIT_CONFIRMATION_INITIAL_DELAY_MS : SUBMIT_CONFIRMATION_POLL_MS
      );

      // A newer build/submit (or a flow reset) replaced the hash: this run is stale.
      if (jotaiStore.get(submitHashAtom) !== txHash) {
        return;
      }

      const [confirmed] = await fetchTransactionsByHash([txHash]);
      if (!confirmed) {
        continue;
      }

      if (jotaiStore.get(submitHashAtom) === txHash) {
        jotaiStore.set(submitConfirmationAtom, "confirmed");
        void refreshWalletBalance();
      }
      return;
    }

    if (jotaiStore.get(submitHashAtom) === txHash) {
      jotaiStore.set(submitConfirmationAtom, "timed-out");
    }
  }

  return { submitTransactionPreview };
}
