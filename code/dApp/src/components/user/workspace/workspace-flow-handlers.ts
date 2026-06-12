"use client";

import { type ProposalCapture } from "@/components/user/proposals/stash";

import type {
  UserActionKind
} from "@/components/user/flow-types";

import {
  type BuildResult } from "@/lib/types/contracts";
import { type useWalletContext } from "@/providers/wallet-provider";
import { type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { type MintConfirmationState } from "@/components/user/workspace/types";
import { type useWorkspaceWalletDerivations } from "@/components/user/workspace/use-workspace-wallet-derivations";
import { type useStore } from "jotai";
import { mintConfirmationRunAtom
} from "@/components/user/workspace/atoms/transaction-flow.atoms";
import { MINT_CONFIRMATION_INITIAL_DELAY_MS, MINT_CONFIRMATION_MAX_ATTEMPTS, MINT_CONFIRMATION_POLL_MS } from "@/components/user/workspace/constants";
import { fetchTransactionsByHash, formatBuildError, isUserActionKind, normalizeTransactionHash, waitFor } from "@/components/user/workspace/helpers";
import { type useDetectedSttTokens } from "@/components/user/workspace/use-detected-stt-tokens";
import { type useLockedContractUtxos } from "@/components/user/workspace/use-locked-contract-utxos";
import { type useWalletBalance } from "@/components/user/workspace/use-wallet-balance";
import { type useWalletActivity } from "@/components/user/workspace/use-wallet-activity";

/**
 * The workspace build/submit FLOW handlers, extracted from the controller hook.
 * `withBuildGuard` wraps every build (wallet/network pre-checks + build-state
 * choreography); `watchMintCreationConfirmation` is the post-submit confirmation
 * poll loop; `addSubmittedTransactionToActivity` records a submitted tx. Plain
 * factory (not a hook) so the React Compiler does not analyse the poll loop's
 * `Date.now()` timestamps as render-time impurity.
 */
export interface WorkspaceFlowHandlersCtx {
  activeWallet: ReturnType<typeof useWalletContext>["activeWallet"];
  activeWalletName: ReturnType<typeof useWalletContext>["activeWalletName"];
  isDemoWallet: ReturnType<typeof useWalletContext>["isDemoWallet"];
  networkId: ReturnType<typeof useWalletContext>["networkId"];
  buildActionSignature: (action: UserActionKind) => string;
  jotaiStore: ReturnType<typeof useStore>;
  lockingContract: ReturnType<typeof useWorkspaceWalletDerivations>["lockingContract"];
  prependSubmittedTransaction: ReturnType<typeof useWalletActivity>["prependSubmittedTransaction"];
  proposalCaptureRef: MutableRefObject<ProposalCapture | null>;
  refreshDetectedTokens: ReturnType<typeof useDetectedSttTokens>["refreshDetectedTokens"];
  refreshLockedContractUtxos: ReturnType<typeof useLockedContractUtxos>["refreshLockedContractUtxos"];
  refreshPermissionWalletSummaries: ReturnType<typeof useDetectedSttTokens>["refreshPermissionWalletSummaries"];
  refreshWalletBalance: ReturnType<typeof useWalletBalance>["refreshWalletBalance"];
  setActiveBuild: Dispatch<SetStateAction<string | null>>;
  setBuildError: Dispatch<SetStateAction<string | null>>;
  setBuildErrorDetails: Dispatch<SetStateAction<string | null>>;
  setLastActionLabel: Dispatch<SetStateAction<string>>;
  setMintConfirmation: Dispatch<SetStateAction<MintConfirmationState | null>>;
  setPreview: Dispatch<SetStateAction<BuildResult | null>>;
  setPreviewSignature: Dispatch<SetStateAction<string | null>>;
  setSubmitHash: Dispatch<SetStateAction<string | null>>;
}

export function createWorkspaceFlowHandlers(ctx: WorkspaceFlowHandlersCtx) {
  const {
    activeWallet,
    activeWalletName,
    isDemoWallet,
    networkId,
    buildActionSignature,
    jotaiStore,
    lockingContract,
    prependSubmittedTransaction,
    proposalCaptureRef,
    refreshDetectedTokens,
    refreshLockedContractUtxos,
    refreshPermissionWalletSummaries,
    refreshWalletBalance,
    setActiveBuild,
    setBuildError,
    setBuildErrorDetails,
    setLastActionLabel,
    setMintConfirmation,
    setPreview,
    setPreviewSignature,
    setSubmitHash
  } = ctx;

  async function withBuildGuard(
    label: string,
    run: () => Promise<BuildResult>,
    context?: Record<string, unknown>
  ): Promise<BuildResult | null> {
    if (!activeWallet) {
      setBuildError("Connect a browser wallet before continuing.");
      setBuildErrorDetails(null);
      return null;
    }

    if (isDemoWallet) {
      setBuildError(
        "Demo wallet is read-only. Connect a browser wallet before continuing."
      );
      setBuildErrorDetails(null);
      return null;
    }

    if (networkId !== 0) {
      setBuildError("Connected wallet is not on Preprod. Switch networks and try again.");
      setBuildErrorDetails(null);
      return null;
    }

    setActiveBuild(label);
    setBuildError(null);
    setBuildErrorDetails(null);
    setSubmitHash(null);
    setMintConfirmation(null);
    jotaiStore.set(mintConfirmationRunAtom, jotaiStore.get(mintConfirmationRunAtom) + 1);
    // Reset before each build; supported actions re-capture below.
    proposalCaptureRef.current = null;

    try {
      const result = await run();
      setPreview(result);
      setLastActionLabel(label);
      setPreviewSignature(isUserActionKind(label) ? buildActionSignature(label) : null);
      return result;
    } catch (error) {
      const parsed = formatBuildError(error, {
        action: label,
        wallet: activeWalletName,
        networkId,
        context
      });
      setBuildError(parsed.message);
      setBuildErrorDetails(parsed.details);
      console.warn(`[build:${label}]`, parsed.details);
      return null;
    } finally {
      setActiveBuild(null);
    }
  }

  async function addSubmittedTransactionToActivity(txHash: string) {
    const normalizedTxHash = normalizeTransactionHash(txHash);
    if (!normalizedTxHash) {
      return;
    }

    const [submittedTransaction] = await fetchTransactionsByHash([normalizedTxHash]);
    if (!submittedTransaction) {
      return;
    }

    prependSubmittedTransaction(submittedTransaction);
  }

  async function watchMintCreationConfirmation(txHash: string) {
    const runId = jotaiStore.get(mintConfirmationRunAtom) + 1;
    jotaiStore.set(mintConfirmationRunAtom, runId);
    const maxAttempts = MINT_CONFIRMATION_MAX_ATTEMPTS;

    setMintConfirmation({
      txHash,
      phase: "waiting",
      attempts: 0,
      maxAttempts,
      updatedAt: Date.now()
    });

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      await waitFor(
        attempt === 1 ? MINT_CONFIRMATION_INITIAL_DELAY_MS : MINT_CONFIRMATION_POLL_MS
      );

      if (jotaiStore.get(mintConfirmationRunAtom) !== runId) {
        return;
      }

      setMintConfirmation({
        txHash,
        phase: "refreshing",
        attempts: attempt,
        maxAttempts,
        updatedAt: Date.now()
      });

      try {
        const detected = await refreshDetectedTokens();

        if (jotaiStore.get(mintConfirmationRunAtom) !== runId) {
          return;
        }

        const createdToken = detected.tokens.find(
          (token) => token.utxo.input.txHash.toLowerCase() === txHash.toLowerCase()
        );

        await Promise.allSettled([
          addSubmittedTransactionToActivity(txHash),
          refreshWalletBalance(),
          refreshLockedContractUtxos(lockingContract.address),
          refreshPermissionWalletSummaries(detected.tokens)
        ]);

        if (jotaiStore.get(mintConfirmationRunAtom) !== runId) {
          return;
        }

        if (createdToken) {
          setMintConfirmation({
            txHash,
            phase: "confirmed",
            attempts: attempt,
            maxAttempts,
            updatedAt: Date.now(),
            createdWalletUnit: createdToken.unit
          });
          return;
        }
      } catch {
        // Keep waiting; a fresh block or temporary indexer lag is normal right after submit.
      }

      setMintConfirmation({
        txHash,
        phase: attempt === maxAttempts ? "delayed" : "waiting",
        attempts: attempt,
        maxAttempts,
        updatedAt: Date.now()
      });
    }
  }

  return {
    withBuildGuard,
    addSubmittedTransactionToActivity,
    watchMintCreationConfirmation
  };
}
