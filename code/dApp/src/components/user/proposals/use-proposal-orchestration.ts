"use client";
import { useTranslations } from "next-intl";
import { deserializeTx } from "@/lib/mesh/cst";
import { useAtomValue, useStore } from "jotai";
import { beginWalletStateUpdateAtom, pendingWalletStateUpdatesAtom, walletStateSubmissionsAtom } from "../workspace/atoms/wallet-state-update.atoms";

// Orchestration for the proposal detail view: observes shared queries and owns the
// sign / submit / rebuild / cancel handlers so proposal-detail.tsx stays a thin view.
import { useWalletStateUpdate } from "../workspace/use-wallet-state-update";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  normalizeWitnessSetHex
} from "@/lib/proposals/assemble";
import {
  cancelProposal,
  deleteProposal,
  getProposalErrorMessage,
  markProposalSubmitted,
  parseProposalBuildContext,
  parseProposalSummary,
  rebuildProposal,
  signProposal
} from "@/lib/proposals/client";
import { TERMINAL_PROPOSAL_STATUSES } from "@/lib/proposals/list-pagination";
import { RebuildUnsupportedError, isAutoRebuildable, rebuildProposalTx } from "@/lib/proposals/rebuild";
import type { ProposalDetailDto, ProposalSummary, ProposalVerification } from "@/lib/proposals/types";
import { proposalDetailQueryOptions, proposalKeys, refreshProposalBackgroundQueries } from "@/lib/proposals/query";
import { queryPolicy } from "@/lib/query/keys";
import { invalidateChainQueries } from "@/lib/query/invalidation";
import { useProposalVerification } from "./use-proposal-verification";
import { useWalletContext } from "@/providers/wallet-provider";

type ProposalOrchestrationArgs = {
  proposalId: string;
  refreshRevision?: number;
  sessionKeyHash: string;
  onChanged: () => void;
};

export type ProposalOrchestration = {
  detail: ProposalDetailDto | null;
  loading: boolean;
  loadError: string | null;
  verification: ProposalVerification | null;
  verifying: boolean;
  busy: null | "sign" | "submit" | "rebuild" | "cancel" | "delete";
  actionError: string | null;
  actionInfo: string | null;
  summary: ProposalSummary | null;
  isCreator: boolean;
  alreadySigned: boolean;
  isOpen: boolean;
  isInvalid: boolean;
  // A finished request (withdrawn or sent): the one state the creator may
  // hard-delete. OPEN and SUBMITTING never satisfy this.
  isDeletable: boolean;
  canSign: boolean;
  canSubmit: boolean;
  canRebuild: boolean;
  // Rebuildable, but the session is a co-signer: the server accepts only the proposer.
  rebuildNeedsProposer: boolean;
  handleSign: () => Promise<void>;
  handleSubmit: () => Promise<void>;
  handleRebuild: () => Promise<void>;
  handleCancel: () => Promise<void>;
  // Resolves true when the request is gone, so the view can leave the detail
  // pane; a failure keeps the request on screen with the error set.
  handleDelete: () => Promise<boolean>;
};

export function useProposalOrchestration({
  proposalId,
  refreshRevision = 0,
  sessionKeyHash,
  onChanged
}: ProposalOrchestrationArgs): ProposalOrchestration {
  const i18n = useTranslations("ComponentsUserProposalsProposalDetail");
  const { activeWallet, isDemoWallet } = useWalletContext();
  const queryClient = useQueryClient();
  const store = useStore();
  const pendingWalletUpdates = useAtomValue(pendingWalletStateUpdatesAtom);
  const walletStateSubmissions = useAtomValue(walletStateSubmissionsAtom);
  const flowI18n = useTranslations("ComponentsUserWorkspaceWorkspaceFlowHandlers");
  const lifecycleKey = `${sessionKeyHash}:${proposalId}`;
  const [stateLifecycleKey, setStateLifecycleKey] = useState(lifecycleKey);
  const [busy, setBusy] = useState<null | "sign" | "submit" | "rebuild" | "cancel" | "delete">(null);
  const [settledRefreshRevision, setSettledRefreshRevision] = useState(refreshRevision);
  const awaitingRefresh = busy === null && settledRefreshRevision !== refreshRevision;
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);
  const lifecycleTokenRef = useRef(0);
  const proposalIdRef = useRef(proposalId);
  const actionInFlight = useRef<number | null>(null);
  const detailQuery = useQuery({
    ...proposalDetailQueryOptions(sessionKeyHash, proposalId),
    enabled: Boolean(sessionKeyHash && proposalId),
    refetchInterval: (query) => query.state.data?.status === "OPEN" || query.state.data?.status === "SUBMITTING"
      ? queryPolicy.activePollMs : false
  });
  const detail = sessionKeyHash && !detailQuery.isError ? detailQuery.data ?? null : null;
  useWalletStateUpdate(detail?.walletUnit);
  const { verification, verifying } = useProposalVerification(sessionKeyHash, awaitingRefresh ? null : detail);
  const signMutation = useMutation({ mutationFn: ({ id, witnessSetHex, txBodyHash }: {
    id: string; witnessSetHex: string; txBodyHash: string;
  }) => signProposal(id, { witnessSetHex, txBodyHash }), retry: false, networkMode: "always" });
  const submitMutation = useMutation({ mutationFn: ({ id, bodyHash }: { id: string; bodyHash: string }) =>
    markProposalSubmitted(id, bodyHash), retry: false, networkMode: "always" });
  const rebuildMutation = useMutation({ mutationFn: ({ id, payload }: {
    id: string; payload: Parameters<typeof rebuildProposal>[1];
  }) => rebuildProposal(id, payload), retry: false, networkMode: "always" });
  const cancelMutation = useMutation({ mutationFn: (id: string) => cancelProposal(id), retry: false, networkMode: "always" });
  const deleteMutation = useMutation({ mutationFn: (id: string) => deleteProposal(id), retry: false, networkMode: "always" });

  useLayoutEffect(() => {
    proposalIdRef.current = proposalId;
    lifecycleTokenRef.current += 1;
    return () => { lifecycleTokenRef.current += 1; };
  }, [proposalId, sessionKeyHash, activeWallet]);

  const isCurrentLifecycle = useCallback(
    (expectedProposalId: string, token: number) =>
      proposalIdRef.current === expectedProposalId && lifecycleTokenRef.current === token,
    []
  );

  useEffect(() => {
    // Clear local action feedback when the proposal identity changes.
    /* eslint-disable react-hooks/set-state-in-effect */
    setStateLifecycleKey(lifecycleKey);
    setActionError(null);
    setActionInfo(null);
    setBusy(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [lifecycleKey]);

  useEffect(() => {
    // A manual refresh waits for the command to finish. Remote data stays in Query;
    // the revision only records which user refresh has finished for this view.
    if (!awaitingRefresh || !sessionKeyHash) return;
    const token = lifecycleTokenRef.current;
    const options = proposalDetailQueryOptions(sessionKeyHash, proposalId);
    let cancelled = false;
    void (async () => {
      await queryClient.cancelQueries({ queryKey: options.queryKey, exact: true });
      if (cancelled || !isCurrentLifecycle(proposalId, token)) return;
      let refreshed = false;
      try {
        await queryClient.fetchQuery({ ...options, staleTime: 0 });
        refreshed = true;
      } catch {
        // The detail query owns the error. Do not expose its previous data on failure.
      } finally {
        if (!cancelled && isCurrentLifecycle(proposalId, token)) {
          setSettledRefreshRevision(refreshRevision);
          void refreshProposalBackgroundQueries(queryClient, sessionKeyHash, refreshed ? proposalId : undefined);
        }
      }
    })();
    return () => {
      cancelled = true;
      void queryClient.cancelQueries({ queryKey: options.queryKey, exact: true });
    };
  }, [activeWallet, awaitingRefresh, isCurrentLifecycle, proposalId, queryClient, refreshRevision, sessionKeyHash]);

  const apply = useCallback(
    async (record: ProposalDetailDto, expectedProposalId: string, token: number) => {
      const isCurrent = isCurrentLifecycle(expectedProposalId, token);
      if (isCurrent) {
        // Cancel a pre-mutation read before publishing the server's new record.
        await queryClient.cancelQueries({ queryKey: proposalKeys.detail(sessionKeyHash, expectedProposalId), exact: true });
        if (isCurrentLifecycle(expectedProposalId, token)) {
          queryClient.setQueryData(proposalKeys.detail(sessionKeyHash, expectedProposalId), record);
        }
      }
      void queryClient.invalidateQueries({ queryKey: proposalKeys.lists(sessionKeyHash) });
      void queryClient.invalidateQueries({ queryKey: proposalKeys.backgrounds(sessionKeyHash) });
      onChanged();
      return isCurrentLifecycle(expectedProposalId, token);
    },
    [isCurrentLifecycle, onChanged, queryClient, sessionKeyHash]
  );

  const hasCurrentLifecycleState = stateLifecycleKey === lifecycleKey;
  const currentDetail = awaitingRefresh ? null : detail;
  const currentVerification = currentDetail ? verification : null;
  const summary = currentDetail ? parseProposalSummary(currentDetail) : null;
  const isCreator = currentDetail?.createdByKeyHash === sessionKeyHash;
  const alreadySigned = Boolean(
    currentDetail?.signatures.some(
      (signature) => signature.current && signature.signerKeyHash === sessionKeyHash
    )
  );
  const isOpen = currentDetail?.status === "OPEN";
  // Deletion is for finished requests only; the same terminal set the server's
  // delete guard enforces, so the button never offers a call that answers 409.
  const isDeletable = Boolean(
    currentDetail && (TERMINAL_PROPOSAL_STATUSES as readonly string[]).includes(currentDetail.status)
  );
  const isInvalid = !verifying && currentVerification?.validity === "invalid";
  const isVerifiedValid = Boolean(
    !verifying && currentVerification?.validity === "valid" && currentVerification.signers &&
    currentVerification.stateTransition?.txBodyHash === currentDetail?.txBodyHash
  );
  const walletStateUpdating = Boolean(currentDetail && (pendingWalletUpdates[currentDetail.walletUnit] || walletStateSubmissions[currentDetail.walletUnit]));
  const verifiedSttInputs = isVerifiedValid && currentVerification?.bodyHashMatches
    ? currentVerification.effect.inputs.filter((input) => input.isSttState) : [];
  const canSign = Boolean(isOpen && isVerifiedValid && !alreadySigned && !walletStateUpdating);
  const canSubmit = Boolean(
    isOpen && isVerifiedValid && currentVerification?.signers?.satisfied &&
    verifiedSttInputs.length === 1 && !walletStateUpdating
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
  const canRebuild = isRebuildable && isCreator && !walletStateUpdating;
  const rebuildNeedsProposer = isRebuildable && !isCreator;

  const guardWallet = (): boolean => {
    if (!activeWallet || isDemoWallet) {
      setActionError(i18n("connectABrowserWalletNotTheDemoWallet"));
      return false;
    }
    return true;
  };

  const guardWalletState = (): boolean => {
    if (detail && (store.get(pendingWalletStateUpdatesAtom)[detail.walletUnit] || store.get(walletStateSubmissionsAtom)[detail.walletUnit])) {
      setActionError(flowI18n("updatingWalletState"));
      return false;
    }
    return true;
  };

  async function handleSign() {
    if (!guardWalletState()) return;
    if (
      !detail ||
      detail.id !== proposalId ||
      busy !== null || actionInFlight.current === lifecycleTokenRef.current ||
      !canSign ||
      !guardWallet() ||
      !activeWallet
    ) {
      return;
    }
    const actionProposalId = detail.id;
    const lifecycleToken = lifecycleTokenRef.current;
    actionInFlight.current = lifecycleToken;
    setBusy("sign");
    setActionError(null);
    setActionInfo(null);
    let phase: "wallet" | "upload" = "wallet";
    try {
      const signed = await activeWallet.signTx(detail.unsignedTxHex, true);
      if (!isCurrentLifecycle(actionProposalId, lifecycleToken)) return;
      const witnessSetHex = normalizeWitnessSetHex(signed);
      phase = "upload";
      const updated = await signMutation.mutateAsync({
        id: actionProposalId,
        witnessSetHex,
        txBodyHash: detail.txBodyHash
      });
      if (await apply(updated, actionProposalId, lifecycleToken)) {
        setActionInfo(i18n("yourSignatureWasAdded"));
      }
    } catch (caught) {
      if (isCurrentLifecycle(actionProposalId, lifecycleToken)) {
        setActionError(
          getProposalErrorMessage(
            caught,
            phase === "wallet" ? i18n("signingFailed") : i18n("couldNotAddSignature")
          )
        );
      }
    } finally {
      if (actionInFlight.current === lifecycleToken) actionInFlight.current = null;
      if (isCurrentLifecycle(actionProposalId, lifecycleToken)) {
        setBusy(null);
      }
    }
  }

  async function handleSubmit() {
    if (!guardWalletState()) return;
    if (!detail || detail.id !== proposalId || busy !== null || actionInFlight.current === lifecycleTokenRef.current || !canSubmit) {
      return;
    }
    const actionProposalId = detail.id;
    const lifecycleToken = lifecycleTokenRef.current;
    actionInFlight.current = lifecycleToken;
    store.set(walletStateSubmissionsAtom, (current) => ({ ...current, [detail.walletUnit]: true }));
    setBusy("submit");
    setActionError(null);
    setActionInfo(null);
    try {
      const ttl = deserializeTx(detail.unsignedTxHex).body().ttl();
      const invalidHereafter = ttl === undefined ? undefined : Number(ttl);
      const spentRef = verifiedSttInputs[0];
      // Persist before POST: a reload or lost response cannot prove no broadcast occurred.
      store.set(beginWalletStateUpdateAtom, {
        walletUnit: detail.walletUnit,
        submittedTxHash: detail.txBodyHash,
        spentRef: { txHash: spentRef.txHash, outputIndex: spentRef.outputIndex },
        ...(invalidHereafter !== undefined && Number.isSafeInteger(invalidHereafter) && invalidHereafter >= 0
          ? { invalidHereafter } : {})
      });
      const submitted = await submitMutation.mutateAsync({ id: actionProposalId, bodyHash: detail.txBodyHash });
      void invalidateChainQueries(queryClient);
      await apply(submitted, actionProposalId, lifecycleToken);
    } catch (caught) {
      if (isCurrentLifecycle(actionProposalId, lifecycleToken)) {
        setActionError(getProposalErrorMessage(caught, i18n("submissionFailed")));
      }
    } finally {
      store.set(walletStateSubmissionsAtom, (current) => {
        const next = { ...current };
        delete next[detail.walletUnit];
        return next;
      });
      if (actionInFlight.current === lifecycleToken) actionInFlight.current = null;
      if (isCurrentLifecycle(actionProposalId, lifecycleToken)) {
        setBusy(null);
      }
    }
  }

  async function handleRebuild() {
    if (!guardWalletState()) return;
    if (
      !detail ||
      detail.id !== proposalId ||
      busy !== null || actionInFlight.current === lifecycleTokenRef.current ||
      !canRebuild ||
      !guardWallet() ||
      !activeWallet
    ) {
      return;
    }
    const actionProposalId = detail.id;
    const lifecycleToken = lifecycleTokenRef.current;
    actionInFlight.current = lifecycleToken;
    setBusy("rebuild");
    setActionError(null);
    setActionInfo(null);
    try {
      const result = await rebuildProposalTx(detail, parseProposalBuildContext(detail), activeWallet);
      if (!isCurrentLifecycle(actionProposalId, lifecycleToken)) return;
      const rebuilt = await rebuildMutation.mutateAsync({ id: actionProposalId, payload: {
        unsignedTxHex: result.txHex,
        txBodyHash: result.txBodyHash,
        expectedBodyHash: detail.txBodyHash,
        buildContext: result.buildContext
      } });
      if (await apply(rebuilt, actionProposalId, lifecycleToken)) {
        setActionInfo(i18n("rebuiltAgainstLiveChainStateExistingSignaturesWere"));
      }
    } catch (caught) {
      if (isCurrentLifecycle(actionProposalId, lifecycleToken)) {
        setActionError(
          caught instanceof RebuildUnsupportedError
            ? caught.message
            : getProposalErrorMessage(caught, i18n("rebuildFailed"))
        );
      }
    } finally {
      if (actionInFlight.current === lifecycleToken) actionInFlight.current = null;
      if (isCurrentLifecycle(actionProposalId, lifecycleToken)) {
        setBusy(null);
      }
    }
  }

  async function handleCancel() {
    if (!detail || detail.id !== proposalId || busy !== null || actionInFlight.current === lifecycleTokenRef.current || !isCreator || !isOpen) {
      return;
    }
    const actionProposalId = detail.id;
    const lifecycleToken = lifecycleTokenRef.current;
    actionInFlight.current = lifecycleToken;
    setBusy("cancel");
    setActionError(null);
    try {
      await cancelMutation.mutateAsync(actionProposalId);
      void queryClient.invalidateQueries({ queryKey: proposalKeys.lists(sessionKeyHash) });
      if (!isCurrentLifecycle(actionProposalId, lifecycleToken)) { onChanged(); return; }
      const options = proposalDetailQueryOptions(sessionKeyHash, actionProposalId);
      await queryClient.cancelQueries({ queryKey: options.queryKey, exact: true });
      if (!isCurrentLifecycle(actionProposalId, lifecycleToken)) { onChanged(); return; }
      const cancelled = await queryClient.fetchQuery({ ...options, staleTime: 0 });
      await apply(cancelled, actionProposalId, lifecycleToken);
    } catch (caught) {
      if (isCurrentLifecycle(actionProposalId, lifecycleToken)) {
        setActionError(getProposalErrorMessage(caught, i18n("couldNotCancel")));
      }
    } finally {
      if (actionInFlight.current === lifecycleToken) actionInFlight.current = null;
      if (isCurrentLifecycle(actionProposalId, lifecycleToken)) {
        setBusy(null);
      }
    }
  }

  // Hard-deletes a finished request. On failure the request stays on screen with
  // the error set, so the user can retry; on success the cached detail is
  // dropped and the list refetches without the row.
  async function handleDelete(): Promise<boolean> {
    if (
      !detail ||
      detail.id !== proposalId ||
      busy !== null || actionInFlight.current === lifecycleTokenRef.current ||
      !isCreator || !isDeletable
    ) {
      return false;
    }
    const actionProposalId = detail.id;
    const lifecycleToken = lifecycleTokenRef.current;
    actionInFlight.current = lifecycleToken;
    setBusy("delete");
    setActionError(null);
    try {
      await deleteMutation.mutateAsync(actionProposalId);
      void queryClient.invalidateQueries({ queryKey: proposalKeys.lists(sessionKeyHash) });
      void queryClient.invalidateQueries({ queryKey: proposalKeys.backgrounds(sessionKeyHash) });
      queryClient.removeQueries({
        queryKey: proposalKeys.detail(sessionKeyHash, actionProposalId),
        exact: true
      });
      return isCurrentLifecycle(actionProposalId, lifecycleToken);
    } catch (caught) {
      if (isCurrentLifecycle(actionProposalId, lifecycleToken)) {
        setActionError(getProposalErrorMessage(caught, i18n("couldNotDelete")));
      }
      return false;
    } finally {
      if (actionInFlight.current === lifecycleToken) actionInFlight.current = null;
      if (isCurrentLifecycle(actionProposalId, lifecycleToken)) {
        setBusy(null);
      }
    }
  }

  return {
    detail: currentDetail,
    loading: Boolean(sessionKeyHash) && (detailQuery.isPending || awaitingRefresh),
    loadError: !awaitingRefresh && detailQuery.error ? getProposalErrorMessage(detailQuery.error, i18n("couldNotLoadThisApprovalRequest")) : null,
    verification: currentVerification,
    verifying: hasCurrentLifecycleState && !awaitingRefresh && verifying,
    busy: hasCurrentLifecycleState ? busy : null,
    actionError: hasCurrentLifecycleState ? actionError : null,
    actionInfo: walletStateUpdating ? flowI18n("updatingWalletState") : hasCurrentLifecycleState ? actionInfo : null,
    summary,
    isCreator,
    alreadySigned,
    isOpen,
    isInvalid,
    isDeletable,
    canSign,
    canSubmit,
    canRebuild,
    rebuildNeedsProposer,
    handleSign,
    handleSubmit,
    handleRebuild,
    handleCancel,
    handleDelete
  };
}
