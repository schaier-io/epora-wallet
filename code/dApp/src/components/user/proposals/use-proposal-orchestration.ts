"use client";
// Orchestration for the proposal detail view: owns the fetch + verify effect and the
// sign / submit / rebuild / cancel handlers so proposal-detail.tsx stays a thin view.
import { useCallback, useEffect, useState } from "react";
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
  const { activeWallet, isDemoWallet } = useWalletContext();
  const [detail, setDetail] = useState<ProposalDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [verification, setVerification] = useState<ProposalVerification | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [busy, setBusy] = useState<null | "sign" | "submit" | "rebuild" | "cancel">(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);

  const runVerify = useCallback(async (record: ProposalDetailDto) => {
    setVerifying(true);
    try {
      setVerification(await verifyProposal(record));
    } catch {
      setVerification(null);
    } finally {
      setVerifying(false);
    }
  }, []);

  useEffect(() => {
    // Legitimate data-fetch effect (loads the proposal + verifies it on open).
    /* eslint-disable react-hooks/set-state-in-effect */
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setVerification(null);
    setActionError(null);
    setActionInfo(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    fetchProposal(proposalId)
      .then((record) => {
        if (cancelled) {
          return;
        }
        setDetail(record);
        void runVerify(record);
      })
      .catch((caught) => {
        if (!cancelled) {
          setLoadError(caught instanceof Error ? caught.message : "Could not load proposal.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [proposalId, runVerify]);

  const apply = useCallback(
    (record: ProposalDetailDto) => {
      setDetail(record);
      onChanged();
      void runVerify(record);
    },
    [onChanged, runVerify]
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
    detail && buildContext && isAutoRebuildable(buildContext.builder) && isOpen
  );

  const guardWallet = (): boolean => {
    if (!activeWallet || isDemoWallet) {
      setActionError("Connect a browser wallet (not the demo wallet) to continue.");
      return false;
    }
    return true;
  };

  async function handleSign() {
    if (!detail || !canSign || !guardWallet() || !activeWallet) {
      return;
    }
    setBusy("sign");
    setActionError(null);
    setActionInfo(null);
    try {
      const signed = await activeWallet.signTx(detail.unsignedTxHex, true);
      const witnessSetHex = normalizeWitnessSetHex(signed);
      apply(await signProposal(detail.id, { witnessSetHex, txBodyHash: detail.txBodyHash }));
      setActionInfo("Your signature was added.");
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Signing failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleSubmit() {
    if (!detail) {
      return;
    }
    setBusy("submit");
    setActionError(null);
    setActionInfo(null);
    try {
      const submitted = await markProposalSubmitted(detail.id, detail.txBodyHash);
      apply(submitted);
      setActionInfo(
        `Submitted on-chain: ${truncateMiddle(submitted.submittedTxHash ?? detail.txBodyHash, 12, 8)}`
      );
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Submission failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleRebuild() {
    if (!detail || !guardWallet() || !activeWallet) {
      return;
    }
    setBusy("rebuild");
    setActionError(null);
    setActionInfo(null);
    try {
      const result = await rebuildProposalTx(detail, parseProposalBuildContext(detail), activeWallet);
      apply(
        await rebuildProposal(detail.id, {
          unsignedTxHex: result.txHex,
          txBodyHash: result.txBodyHash,
          expectedBodyHash: detail.txBodyHash,
          buildContext: result.buildContext
        })
      );
      setActionInfo("Rebuilt against live chain state. Existing signatures were reset.");
    } catch (caught) {
      setActionError(
        caught instanceof RebuildUnsupportedError
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : "Rebuild failed."
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleCancel() {
    if (!detail) {
      return;
    }
    setBusy("cancel");
    setActionError(null);
    try {
      await cancelProposal(detail.id);
      apply(await fetchProposal(detail.id));
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Could not cancel.");
    } finally {
      setBusy(null);
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
    canSubmit,
    canRebuild,
    handleSign,
    handleSubmit,
    handleRebuild,
    handleCancel
  };
}
