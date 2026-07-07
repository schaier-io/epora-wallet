"use client";
// Sign-and-submit flow for a built transaction preview: re-entry guarding,
// mint-confirmation bookkeeping, and the post-submit refresh cascade.
import { normalizeWalletName } from "@/lib/contracts/state-wallet-name";
import { signAndSubmitTx } from "@/lib/mesh/transactions";
import { type BuildResult } from "@/lib/types/contracts";
import { mintConfirmationRunAtom } from "@/components/user/workspace/atoms/transaction-flow.atoms";
import { MINT_CONFIRMATION_MAX_ATTEMPTS } from "@/components/user/workspace/constants";
import { formatBuildError } from "@/components/user/workspace/helpers";
import type { WorkspaceTransactionsCtx } from "@/components/user/workspace/workspace-transactions-types";
import type { WorkspaceFormSnapshot } from "@/components/user/workspace/workspace-transactions-forms";

export function createSubmitHandlers(
  ctx: WorkspaceTransactionsCtx,
  forms: WorkspaceFormSnapshot,
  builders: { buildSelectedActionTx: () => Promise<BuildResult | null> }
) {
  const {
    activeBuild,
    activeSubmit,
    activeWallet,
    activeWalletName,
    addSubmittedTransactionToActivity,
    isDemoWallet,
    jotaiStore,
    lockingContract,
    networkId,
    postSubmitRefreshTimersRef,
    preview,
    previewMatchesSelectedAction,
    refreshDetectedTokens,
    refreshLockedContractUtxos,
    refreshPermissionWalletSummaries,
    refreshWalletBalance,
    rememberRecipients,
    selectedAction,
    setActiveSubmit,
    setBuildError,
    setBuildErrorDetails,
    setMintConfirmation,
    setMintedWalletName,
    setSubmitHash,
    submitHash,
    submitInFlightRef,
    watchMintCreationConfirmation
  } = ctx;
  const { mintStateForm, sttExtraTransfers } = forms;

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

    if (!activeWallet) {
      setBuildError("Connect wallet first.");
      return;
    }

    if (isDemoWallet) {
      setBuildError(
        "Demo wallet cannot confirm actions. Connect a browser wallet to continue."
      );
      setBuildErrorDetails(null);
      return;
    }

    if (submitHash && !allowExistingSubmitHash) {
      setBuildError("This action was already completed. Change something before trying again.");
      setBuildErrorDetails(null);
      return;
    }

    if (!transactionPreview.txHex) {
      setBuildError("The transaction could not be prepared. Try again.");
      setBuildErrorDetails(null);
      return;
    }

    if (
      requireCurrentPreview &&
      (!previewMatchesSelectedAction || preview?.txHex !== transactionPreview.txHex)
    ) {
      setBuildError("The transaction details are stale. Continue again to refresh them.");
      setBuildErrorDetails(null);
      return;
    }

    submitInFlightRef.current = true;
    setActiveSubmit(true);
    setBuildError(null);
    setBuildErrorDetails(null);

    if (selectedAction === "mint") {
      // Snapshot the name now — before the post-submit list refresh can bump the
      // live form value — so the celebration shows the name actually minted.
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
      void addSubmittedTransactionToActivity(txHash);
      if (
        selectedAction === "use" ||
        selectedAction === "use-allowance" ||
        selectedAction === "use-beneficiary"
      ) {
        rememberRecipients(sttExtraTransfers.map((transfer) => transfer.address));
      }
      void refreshWalletBalance();
      void refreshLockedContractUtxos(lockingContract.address);
      if (selectedAction === "mint") {
        void watchMintCreationConfirmation(txHash);
      } else {
        void refreshPermissionWalletSummaries();
        // The refresh above runs before the tx confirms, so it still reads the
        // pre-submit balance/UTxOs. Re-poll over the next ~75s so the wallet
        // updates itself once the tx lands — no manual Refresh needed.
        postSubmitRefreshTimersRef.current.forEach((id) => window.clearTimeout(id));
        postSubmitRefreshTimersRef.current = [12000, 30000, 50000, 75000].map((delay) =>
          window.setTimeout(() => {
            void refreshLockedContractUtxos(lockingContract.address);
            void refreshWalletBalance();
            void refreshPermissionWalletSummaries();
            // Re-detect the STT state so datum-derived display (wallet name,
            // owners, backups, timer) refreshes after a state-changing admin
            // update — keepSelection avoids flashing the wallet during the gap.
            void refreshDetectedTokens({ keepSelection: true });
          }, delay)
        );
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
      setBuildError(parsed.message);
      setBuildErrorDetails(parsed.details);
      if (selectedAction === "mint") {
        jotaiStore.set(mintConfirmationRunAtom, jotaiStore.get(mintConfirmationRunAtom) + 1);
        setMintConfirmation(null);
      }
      console.warn("[submit]", parsed.details);
    } finally {
      setActiveSubmit(false);
      submitInFlightRef.current = false;
    }
  }

  async function buildAndSubmitSelectedActionTx() {
    if (activeBuild === selectedAction || activeSubmit) {
      return;
    }

    const nextPreview = await builders.buildSelectedActionTx();

    if (!nextPreview?.txHex) {
      return;
    }

    await submitTransactionPreview(nextPreview, {
      allowExistingSubmitHash: true,
      requireCurrentPreview: false
    });
  }

  return {
    submitTransactionPreview,
    buildAndSubmitSelectedActionTx
  };
}
