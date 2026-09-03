"use client";
import { useTranslations } from "next-intl";

// Orchestration for the proposal detail view: owns the fetch + verify effect and the
// sign / submit / rebuild / cancel handlers so proposal-detail.tsx stays a thin view.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  normalizeWitnessSetHex
} from "@/lib/proposals/assemble";
import {
  cancelProposal,
  fetchProposal,
  markProposalSubmitted,
  parseProposalBuildContext,
  parseProposalSummary,
  rebuildProposal,
  signProposal
} from "@/lib/proposals/client";
import { RebuildUnsupportedError, isAutoRebuildable, rebuildProposalTx } from "@/lib/proposals/rebuild";
import type { ProposalDetailDto, ProposalSummary, ProposalVerification } from "@/lib/proposals/types";
import { verifyProposal } from "@/lib/proposals/verify";
import { useWalletContext } from "@/providers/wallet-provider";
import { truncateMiddle } from "./format";

type ProposalOrchestrationArgs = {
  proposalId: string;
  sessionKeyHash: string;
  onChanged: () => void;
};

export type ProposalOrchestration = {
  detail: ProposalDetailDto | null;
  loading: boolean;
  loadError: string | null;
  verification: ProposalVerification | null;
  verifying: boolean;
  busy: null | "sign" | "submit" | "rebuild" | "cancel";
  actionError: string | null;
  actionInfo: string | null;
  summary: ProposalSummary | null;
  isCreator: boolean;
  alreadySigned: boolean;
  isOpen: boolean;
  isInvalid: boolean;
  canSign: boolean;
  canSubmit: boolean;
  canRebuild: boolean;
  // Rebuildable, but the session is a co-signer: the server accepts only the proposer.
  rebuildNeedsProposer: boolean;
  handleSign: () => Promise<void>;
  handleSubmit: () => Promise<void>;
  handleRebuild: () => Promise<void>;
  handleCancel: () => Promise<void>;
};

export function useProposalOrchestration({
  proposalId,
  sessionKeyHash,
  onChanged
}: ProposalOrchestrationArgs): ProposalOrchestration {
  const i18n = useTranslations("ComponentsUserProposalsProposalDetail");
  const { activeWallet, isDemoWallet } = useWalletContext();
  const [stateProposalId, setStateProposalId] = useState(proposalId);
  const [detail, setDetail] = useState<ProposalDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [verification, setVerification] = useState<ProposalVerification | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [busy, setBusy] = useState<null | "sign" | "submit" | "rebuild" | "cancel">(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);
  const verifyTokenRef = useRef(0);
  const lifecycleTokenRef = useRef(0);
  const proposalIdRef = useRef(proposalId);

  useLayoutEffect(() => {
    proposalIdRef.current = proposalId;
  }, [proposalId]);

  const isCurrentLifecycle = useCallback(
    (expectedProposalId: string, token: number) =>
      proposalIdRef.current === expectedProposalId &&
      lifecycleTokenRef.current === token,
    []
  );

  const runVerify = useCallback(async (record: ProposalDetailDto) => {
    const token = (verifyTokenRef.current += 1);
    setVerification(null);
    setVerifying(true);
    try {
      const result = await verifyProposal(record);
      if (verifyTokenRef.current === token) {
        setVerification(result);
      }
    } catch {
      if (verifyTokenRef.current === token) {
        setVerification(null);
      }
    } finally {
      if (verifyTokenRef.current === token) {
        setVerifying(false);
      }
    }
  }, []);

  useEffect(() => {
    // Legitimate data-fetch effect (loads the proposal + verifies it on open).
    /* eslint-disable react-hooks/set-state-in-effect */
    let cancelled = false;
    const lifecycleToken = (lifecycleTokenRef.current += 1);
    setStateProposalId(proposalId);
    setDetail(null);
    setLoading(true);
    setLoadError(null);
    setVerification(null);
    setVerifying(false);
    setActionError(null);
    setActionInfo(null);
    setBusy(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    fetchProposal(proposalId)
      .then((record) => {
        if (cancelled || !isCurrentLifecycle(proposalId, lifecycleToken)) {
          return;
        }
        setDetail(record);
        void runVerify(record);
      })
      .catch((caught) => {
        if (!cancelled && isCurrentLifecycle(proposalId, lifecycleToken)) {
          setLoadError(
            caught instanceof Error
              ? caught.message
              : i18n("couldNotLoadThisApprovalRequest")
          );
        }
      })
      .finally(() => {
        if (!cancelled && isCurrentLifecycle(proposalId, lifecycleToken)) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
      verifyTokenRef.current += 1;
      lifecycleTokenRef.current += 1;
    };
  }, [i18n, isCurrentLifecycle, proposalId, runVerify]);

  const apply = useCallback(
    (record: ProposalDetailDto, expectedProposalId: string, token: number) => {
      const isCurrent = isCurrentLifecycle(expectedProposalId, token);
      onChanged();
      if (!isCurrent) {
        return false;
      }
      setDetail(record);
      void runVerify(record);
      return true;
    },
    [isCurrentLifecycle, onChanged, runVerify]
  );

  const hasCurrentLifecycleState = stateProposalId === proposalId;
  const currentDetail =
    hasCurrentLifecycleState && detail?.id === proposalId ? detail : null;
  const currentVerification = currentDetail ? verification : null;
  const isSwitchingProposal =
    !hasCurrentLifecycleState || (detail !== null && currentDetail === null);
  const summary = currentDetail ? parseProposalSummary(currentDetail) : null;
  const isCreator = currentDetail?.createdByKeyHash === sessionKeyHash;
  const alreadySigned = Boolean(
    currentDetail?.signatures.some(
      (signature) => signature.current && signature.signerKeyHash === sessionKeyHash
    )
  );
  const isOpen = currentDetail?.status === "OPEN";
  const isInvalid = currentVerification?.validity === "invalid";
  const isVerifiedValid = Boolean(
    currentVerification?.validity === "valid" && currentVerification.signers
  );
  const canSign = Boolean(isOpen && isVerifiedValid && !alreadySigned);
  const canSubmit = Boolean(
    isOpen && isVerifiedValid && currentVerification?.signers?.satisfied
  );
  const buildContext = currentDetail
    ? parseProposalBuildContext(currentDetail)
    : null;
  const isRebuildable = Boolean(
    currentDetail &&
      buildContext &&
      isAutoRebuildable(buildContext.builder) &&
      isOpen &&
      isInvalid
  );
  // The server only lets the proposer rebuild (`evaluateProposalRebuildGuard`), so a
  // co-signer must not be offered a button that drives their wallet through a full
  // rebuild and then answers 403.
  const canRebuild = isRebuildable && isCreator;
  const rebuildNeedsProposer = isRebuildable && !isCreator;

  const guardWallet = (): boolean => {
    if (!activeWallet || isDemoWallet) {
      setActionError(i18n("connectABrowserWalletNotTheDemoWallet"));
      return false;
    }
    return true;
  };

  async function handleSign() {
    if (
      !detail ||
      detail.id !== proposalId ||
      busy !== null ||
      !canSign ||
      !guardWallet() ||
      !activeWallet
    ) {
      return;
    }
    const actionProposalId = detail.id;
    const lifecycleToken = lifecycleTokenRef.current;
    setBusy("sign");
    setActionError(null);
    setActionInfo(null);
    try {
      const signed = await activeWallet.signTx(detail.unsignedTxHex, true);
      const witnessSetHex = normalizeWitnessSetHex(signed);
      const updated = await signProposal(actionProposalId, {
        witnessSetHex,
        txBodyHash: detail.txBodyHash
      });
      if (apply(updated, actionProposalId, lifecycleToken)) {
        setActionInfo(i18n("yourSignatureWasAdded"));
      }
    } catch (caught) {
      if (isCurrentLifecycle(actionProposalId, lifecycleToken)) {
        setActionError(caught instanceof Error ? caught.message : i18n("signingFailed"));
      }
    } finally {
      if (isCurrentLifecycle(actionProposalId, lifecycleToken)) {
        setBusy(null);
      }
    }
  }

  async function handleSubmit() {
    if (!detail || detail.id !== proposalId || busy !== null || !canSubmit) {
      return;
    }
    const actionProposalId = detail.id;
    const lifecycleToken = lifecycleTokenRef.current;
    setBusy("submit");
    setActionError(null);
    setActionInfo(null);
    try {
      const submitted = await markProposalSubmitted(actionProposalId, detail.txBodyHash);
      if (apply(submitted, actionProposalId, lifecycleToken)) {
        setActionInfo(
          i18n("submittedOnChainValue1", {
            value1: truncateMiddle(submitted.submittedTxHash ?? detail.txBodyHash, 12, 8)
          })
        );
      }
    } catch (caught) {
      if (isCurrentLifecycle(actionProposalId, lifecycleToken)) {
        setActionError(caught instanceof Error ? caught.message : i18n("submissionFailed"));
      }
    } finally {
      if (isCurrentLifecycle(actionProposalId, lifecycleToken)) {
        setBusy(null);
      }
    }
  }

  async function handleRebuild() {
    if (
      !detail ||
      detail.id !== proposalId ||
      busy !== null ||
      !canRebuild ||
      !guardWallet() ||
      !activeWallet
    ) {
      return;
    }
    const actionProposalId = detail.id;
    const lifecycleToken = lifecycleTokenRef.current;
    setBusy("rebuild");
    setActionError(null);
    setActionInfo(null);
    try {
      const result = await rebuildProposalTx(detail, parseProposalBuildContext(detail), activeWallet);
      const rebuilt = await rebuildProposal(actionProposalId, {
        unsignedTxHex: result.txHex,
        txBodyHash: result.txBodyHash,
        expectedBodyHash: detail.txBodyHash,
        buildContext: result.buildContext
      });
      if (apply(rebuilt, actionProposalId, lifecycleToken)) {
        setActionInfo(i18n("rebuiltAgainstLiveChainStateExistingSignaturesWere"));
      }
    } catch (caught) {
      if (isCurrentLifecycle(actionProposalId, lifecycleToken)) {
        setActionError(
          caught instanceof RebuildUnsupportedError
            ? caught.message
            : caught instanceof Error
              ? caught.message
              : i18n("rebuildFailed")
        );
      }
    } finally {
      if (isCurrentLifecycle(actionProposalId, lifecycleToken)) {
        setBusy(null);
      }
    }
  }

  async function handleCancel() {
    if (!detail || detail.id !== proposalId || busy !== null || !isCreator || !isOpen) {
      return;
    }
    const actionProposalId = detail.id;
    const lifecycleToken = lifecycleTokenRef.current;
    setBusy("cancel");
    setActionError(null);
    try {
      await cancelProposal(actionProposalId);
      const cancelled = await fetchProposal(actionProposalId);
      apply(cancelled, actionProposalId, lifecycleToken);
    } catch (caught) {
      if (isCurrentLifecycle(actionProposalId, lifecycleToken)) {
        setActionError(caught instanceof Error ? caught.message : i18n("couldNotCancel"));
      }
    } finally {
      if (isCurrentLifecycle(actionProposalId, lifecycleToken)) {
        setBusy(null);
      }
    }
  }

  return {
    detail: currentDetail,
    loading: loading || isSwitchingProposal,
    loadError: hasCurrentLifecycleState ? loadError : null,
    verification: currentVerification,
    verifying: hasCurrentLifecycleState && verifying,
    busy: hasCurrentLifecycleState ? busy : null,
    actionError: hasCurrentLifecycleState ? actionError : null,
    actionInfo: hasCurrentLifecycleState ? actionInfo : null,
    summary,
    isCreator,
    alreadySigned,
    isOpen,
    isInvalid,
    canSign,
    canSubmit,
    canRebuild,
    rebuildNeedsProposer,
    handleSign,
    handleSubmit,
    handleRebuild,
    handleCancel
  };
}
