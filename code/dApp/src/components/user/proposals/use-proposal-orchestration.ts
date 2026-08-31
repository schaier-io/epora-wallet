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
    setLoading(true);
    setLoadError(null);
    setVerification(null);
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

  const summary = detail ? parseProposalSummary(detail) : null;
  const isCreator = detail?.createdByKeyHash === sessionKeyHash;
  const alreadySigned = Boolean(
    detail?.signatures.some(
      (signature) => signature.current && signature.signerKeyHash === sessionKeyHash
    )
  );
  const isOpen = detail?.status === "OPEN";
  const isInvalid = verification?.validity === "invalid";
  const isVerifiedValid = Boolean(
    verification?.validity === "valid" && verification.signers
  );
  const canSign = Boolean(isOpen && isVerifiedValid && !alreadySigned);
  const canSubmit = Boolean(isOpen && isVerifiedValid && verification?.signers?.satisfied);
  const buildContext = detail ? parseProposalBuildContext(detail) : null;
  const canRebuild = Boolean(
    detail && buildContext && isAutoRebuildable(buildContext.builder) && isOpen && isInvalid
  );

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
    detail,
    loading,
    loadError,
    verification,
    verifying,
    busy,
    actionError,
    actionInfo,
    summary,
    isCreator,
    alreadySigned,
    isOpen,
    isInvalid,
    canSign,
    canSubmit,
    canRebuild,
    handleSign,
    handleSubmit,
    handleRebuild,
    handleCancel
  };
}
