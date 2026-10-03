import { preparedWorkspaceTransactionAtom, preparedWorkspaceTransactionIsCurrent, workspaceTransactionSnapshotAtom, type WorkspaceSubmissionOwnership } from "./workspace-prepared-transaction";
import { assertBeneficiaryWithdrawalReviewCurrent } from "./beneficiary-withdrawal-review";
import { assertPreparedTransactionFresh } from "@/lib/mesh/transactions/prepared-transaction-freshness";
import { queryClientAtom } from "jotai-tanstack-query";
import { isWorkspaceBuildResultExpired } from "./workspace-build-expiry";
import { buildRunAtom, invalidateBuildAtom, submittedActionAtom } from "./atoms/transaction-flow.atoms";
import { watchTransactionConfirmation } from "./watch-transaction-confirmation";
import { saveDepositReceipt } from "./deposit-receipt";
import { invalidateChainQueries } from "@/lib/query/invalidation";
import { beneficiaryPreparationActiveAtom, consolidateWalletInputsAtom } from "./atoms/forms/consolidate-form.atoms";
import { recoveryCapacityFailureAtom, recoveryCapacitySignatureAtom } from "./atoms/recovery-capacity.atoms";
import { recordRecoveryCapacityFailure } from "./recovery-capacity-model";
import { submitPhaseAtom, workspaceSessionAtom, previewSignatureAtom, buildDiagnosticIdAtom, mintConfirmationRunAtom, submitConfirmedAtom, submitConfirmationUnseenAtom } from "@/components/user/workspace/atoms/transaction-flow.atoms";
import {
  beginWalletStateUpdateAtom,
  walletStateBlocksAction,
  walletStateSubmissionsAtom,
  pendingWalletStateUpdatesAtom,
  resolveSpentSttRef,
} from "@/components/user/workspace/atoms/wallet-state-update.atoms";
import { resetLockFundsFormAtom } from "@/components/user/workspace/atoms/forms/lock-funds-form.atoms";
import { resetTransferFormAtom, transferRecipientModeAtom, transferCustomAddressAtom, transferSelectedUnitAtom, transferDisplayAmountAtom } from "@/components/user/workspace/atoms/forms/transfer-form.atoms";
import { sttExtraTransfersAtom, sttWalletInputsAtom } from "@/components/user/workspace/atoms/forms/stt-spend-form.atoms";
import { selectedOrphanInputsAtom } from "./atoms/forms/orphan-inputs.atoms";
import { capturePendingActivityInputs, recordPendingActivity } from "./atoms/pending-activity.atoms";
import {
  MINT_CONFIRMATION_MAX_ATTEMPTS
} from "@/components/user/workspace/constants";
import { formatBuildError, safeStringify } from "@/components/user/workspace/helpers";
import { OwnedMessageError } from "./helpers/build-errors";
import type { resolveWorkspaceTransactionInputs } from "@/components/user/workspace/workspace-transaction-inputs";
import type { WorkspaceTransactionsCtx } from "@/components/user/workspace/workspace-transactions-types";
import { normalizeWalletName } from "@/lib/contracts/state-wallet-name";
import { signAndSubmitTx } from "@/lib/mesh/transactions";
import { captureClientError } from "@/lib/observability/sentry-client-forward";
import type { BuildResult } from "@/lib/types/contracts";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceWorkspaceTransactions.json";

const i18n = createDefaultTranslator("ComponentsUserWorkspaceWorkspaceTransactions", defaultMessages);

function runPostSubmitTask(label: string, task: () => unknown) {
  try {
    void Promise.resolve(task()).catch((error) => {
      console.error(`[post-submit:${label}]`, error);
    });
  } catch (error) {
    console.error(`[post-submit:${label}]`, error);
  }
}

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
  | "selectedDetectedToken"
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
    selectedDetectedToken,
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
    watchMintCreationConfirmation,
    mintStateForm,
    sttExtraTransfers
  } = deps;

  const sessionAtCreation = jotaiStore.get(workspaceSessionAtom);

  async function submitTransactionPreview(
    transactionPreview: BuildResult,
    options: { allowExistingSubmitHash?: boolean; requireCurrentPreview?: boolean } = {}
  ) {
    if (jotaiStore.get(workspaceSessionAtom) !== sessionAtCreation) return;
    const walletUnit = selectedDetectedToken?.unit;
    // A signing in flight serializes every action on this wallet. A pending STT update
    // holds only the actions that spend the STT.
    if (walletUnit && (jotaiStore.get(walletStateSubmissionsAtom)[walletUnit] ||
      (jotaiStore.get(pendingWalletStateUpdatesAtom)[walletUnit] && walletStateBlocksAction(jotaiStore.get, selectedAction)))) return;
    const { allowExistingSubmitHash = false, requireCurrentPreview = true } = options;
    jotaiStore.set(recoveryCapacityFailureAtom, null);
    const recoverySignature = jotaiStore.get(recoveryCapacitySignatureAtom);

    const session = jotaiStore.get(workspaceSessionAtom);
    // Block duplicate calls in this session without blocking a new wallet.
    if (submitInFlightRef.current === session || walletStateBlocksAction(jotaiStore.get, selectedAction)) {
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

    if (
      transactionPreview.warnings?.length &&
      !window.confirm(
        i18n("reviewTheseWarningsBeforeYouSignContinue", {
          warnings: transactionPreview.warnings.join("\n\n")
        })
      )
    ) {
      return;
    }

    if (isWorkspaceBuildResultExpired(transactionPreview)) {
      jotaiStore.set(invalidateBuildAtom);
      setBuildError(i18n("theTransactionDetailsAreStaleContinueAgainTo_34b074"));
      setBuildErrorExpected(true);
      return;
    }

    submitInFlightRef.current = session;
    setActiveSubmit(true);
    jotaiStore.set(submitPhaseAtom, "checking");
    setBuildError(null);
    setBuildErrorExpected(false);

    if (selectedAction === "mint") {
      // Snapshot the name now, before the post-submit list refresh can bump the
      // live form value, so the celebration shows the name actually minted.
      setMintedWalletName(normalizeWalletName(mintStateForm.walletName));
      jotaiStore.set(mintConfirmationRunAtom, jotaiStore.get(mintConfirmationRunAtom) + 1);
      setMintConfirmation({
        txHash: null,
        phase: "submitting",
        attempts: 0,
        maxAttempts: MINT_CONFIRMATION_MAX_ATTEMPTS,
        updatedAt: Date.now()
      });
    }

    const isCurrent = () => jotaiStore.get(workspaceSessionAtom) === session;
    const spentSttRef = resolveSpentSttRef(jotaiStore, selectedAction, selectedDetectedToken);
    const submissionUnit = selectedDetectedToken?.unit;
    if (submissionUnit) jotaiStore.set(walletStateSubmissionsAtom, {
      ...jotaiStore.get(walletStateSubmissionsAtom), [submissionUnit]: true
    });
    const submittedOrphanDraft = jotaiStore.get(selectedOrphanInputsAtom);
    // Broadcasting can outlive the reviewed draft. Include raw editor text because
    // the transaction snapshot normalizes amounts and recipient addresses.
    const readDraftSnapshot = () => safeStringify([
      jotaiStore.get(workspaceTransactionSnapshotAtom), jotaiStore.get(buildRunAtom),
      jotaiStore.get(transferRecipientModeAtom), jotaiStore.get(transferCustomAddressAtom),
      jotaiStore.get(transferSelectedUnitAtom), jotaiStore.get(transferDisplayAmountAtom)
    ]);
    const submittedDraftSnapshot = readDraftSnapshot();
    // Read before signing: after the broadcast, the spent inputs leave every UTxO list.
    const pendingActivityInputs = capturePendingActivityInputs(jotaiStore);
    const pendingActivityWallet = deps.lockingContract.address;
    let txHash: string;
    try {
      const submissionOwner: WorkspaceSubmissionOwnership | undefined = submissionUnit
        ? { walletUnit: submissionUnit, pending: null } : undefined;
      const beforeBroadcast = spentSttRef && submissionOwner
        ? (transaction: { txHash: string; invalidHereafter?: number }) => {
            assertSnapshot();
            const pending = { walletUnit: submissionOwner.walletUnit,
              submittedTxHash: transaction.txHash, spentRef: spentSttRef, submittedAt: Date.now(),
              invalidHereafter: transaction.invalidHereafter };
            jotaiStore.set(beginWalletStateUpdateAtom, pending);
            submissionOwner.pending = pending;
          }
        : undefined;
      const prepared = jotaiStore.get(preparedWorkspaceTransactionAtom);
      const snapshot = jotaiStore.get(workspaceTransactionSnapshotAtom);
      const assertSnapshot = () => {
        if (!isCurrent() || !prepared || prepared.result !== transactionPreview ||
          jotaiStore.get(workspaceTransactionSnapshotAtom) !== snapshot ||
          !preparedWorkspaceTransactionIsCurrent(jotaiStore, prepared, Date.now(), submissionOwner)) {
          throw new OwnedMessageError(i18n("theTransactionDetailsAreStaleContinueAgainTo_34b074"));
        }
      };
      txHash = await signAndSubmitTx(activeWallet, transactionPreview.txHex, {
        onPhase: phase => {
          if (isCurrent() && submitInFlightRef.current === session) jotaiStore.set(submitPhaseAtom, phase);
        },
        assertCurrent: async () => {
          try {
            assertSnapshot();
            await Promise.all([
              assertPreparedTransactionFresh(transactionPreview.txHex),
              selectedAction === "use-beneficiary"
                ? assertBeneficiaryWithdrawalReviewCurrent(deps.lockingContract.address, transactionPreview)
                : Promise.resolve()
            ]);
            assertSnapshot();
          } catch (error) {
            if (jotaiStore.get(preparedWorkspaceTransactionAtom) === prepared) {
              jotaiStore.set(preparedWorkspaceTransactionAtom, null);
              jotaiStore.set(previewSignatureAtom, null);
            }
            throw error;
          }
        },
        ...(beforeBroadcast ? { beforeBroadcast } : {})
      });
      if (selectedAction === "lock-funds" && submissionUnit && session.address && session.network !== null) {
        saveDepositReceipt({ address: session.address, network: session.network, walletUnit: submissionUnit }, txHash);
      }
      if (spentSttRef && submissionUnit && !jotaiStore.get(pendingWalletStateUpdatesAtom)[submissionUnit]) {
        jotaiStore.set(beginWalletStateUpdateAtom, {
          walletUnit: submissionUnit, submittedTxHash: txHash, spentRef: spentSttRef, submittedAt: Date.now()
        });
      }
    } catch (error) {
      if (!isCurrent()) return;
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
      recordRecoveryCapacityFailure(jotaiStore, selectedAction, error, recoverySignature);
      if (selectedAction === "mint") {
        jotaiStore.set(mintConfirmationRunAtom, jotaiStore.get(mintConfirmationRunAtom) + 1);
        setMintConfirmation(null);
      }
      // Recognised outcomes (a declined signature, a named ledger rule) are shown to the
      // reader and stay out of the console; only the genuinely unexpected get logged.
      if (!parsed.expected) {
        console.error("[submit]", parsed.diagnosticId, parsed.details);
        captureClientError("ui.tx_submit_failed", error, {
          action: "submit",
          wallet: activeWalletName,
          diagnosticId: parsed.diagnosticId
        });
      }
      return;
    } finally {
      if (submissionUnit) {
        const submissions = { ...jotaiStore.get(walletStateSubmissionsAtom) };
        delete submissions[submissionUnit];
        jotaiStore.set(walletStateSubmissionsAtom, submissions);
      }
      if (isCurrent()) {
        setActiveSubmit(false);
        jotaiStore.set(submitPhaseAtom, null);
      }
      if (submitInFlightRef.current === session) submitInFlightRef.current = null;
    }

    if (!isCurrent()) return;
    const mayClearSubmittedDraft = readDraftSnapshot() === submittedDraftSnapshot;
    if (selectedAction === "use-beneficiary" && jotaiStore.get(selectedOrphanInputsAtom) === submittedOrphanDraft) {
      jotaiStore.set(selectedOrphanInputsAtom, null);
    }
    jotaiStore.set(submittedActionAtom, selectedAction);
    setSubmitHash(txHash);
    jotaiStore.set(submitConfirmedAtom, false);
    jotaiStore.set(submitConfirmationUnseenAtom, false);
    runPostSubmitTask("confirmation", () => watchTransactionConfirmation(jotaiStore, txHash, selectedAction));
    runPostSubmitTask("pending-activity", () => recordPendingActivity(jotaiStore, {
      txHash, txHex: transactionPreview.txHex, walletAddress: pendingActivityWallet, knownUtxos: pendingActivityInputs
    }));
    runPostSubmitTask("activity", () => addSubmittedTransactionToActivity(txHash));
    if (
      selectedAction === "use" ||
      selectedAction === "use-allowance" ||
      selectedAction === "use-beneficiary"
    ) {
      runPostSubmitTask("recent-recipients", () =>
        rememberRecipients(sttExtraTransfers.map((transfer) => transfer.address))
      );
      // Clear the payouts this transaction just sent. Leaving them staged made the
      // review rail keep describing the send in the future tense -- "You are sending
      // 5 ₳ to ..." -- over money that had already left the wallet, with Next step
      // still saying "Review the receipt and continue".
      // The transfer form is cleared with them. Leaving Recipient on "My address" after a
      // send re-aims the next payout at the signer's own wallet, which is the default
      // `transfer-form.atoms.ts` deliberately removed on a wallet with several owners.
      // The fund pools go too: this transaction spent them. Left selected, the seeding
      // effect skips the next payout (it seeds only an empty selection) and the next
      // build fails on inputs that no longer exist.
      runPostSubmitTask("clear-payouts", () => {
        if (!mayClearSubmittedDraft) return;
        jotaiStore.set(sttExtraTransfersAtom, []);
        jotaiStore.set(sttWalletInputsAtom, []);
        jotaiStore.set(resetTransferFormAtom);
      });
    }
    if (selectedAction === "consolidate-utxo" && jotaiStore.get(beneficiaryPreparationActiveAtom) && mayClearSubmittedDraft) {
      runPostSubmitTask("clear-prepared-inputs", () => jotaiStore.set(consolidateWalletInputsAtom, []));
    }
    if (selectedAction === "distribute-beneficiaries" && mayClearSubmittedDraft) {
      runPostSubmitTask("clear-distributed-input", () => jotaiStore.set(sttWalletInputsAtom, []));
    }
    if (selectedAction === "lock-funds" && mayClearSubmittedDraft) {
      // Same reason: the receipt read "You are adding 10 ₳ to the selected wallet."
      // after the 10 ₳ had already been locked.
      runPostSubmitTask("clear-lock-funds", () => jotaiStore.set(resetLockFundsFormAtom));
    }
    runPostSubmitTask("chain-cache", () => invalidateChainQueries(jotaiStore.get(queryClientAtom)));
    // The immediate refresh above runs before the tx confirms. The confirmation
    // watcher refreshes again once the tx lands.
    if (selectedAction === "mint") {
      runPostSubmitTask("mint-confirmation", () =>
        watchMintCreationConfirmation(txHash, transactionPreview.createdWalletUnit)
      );
    }
  }


  return { submitTransactionPreview };
}
