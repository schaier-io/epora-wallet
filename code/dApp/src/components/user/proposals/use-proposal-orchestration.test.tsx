import { act, renderHook, waitFor } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ProposalBuildContext,
  ProposalDetailDto,
  ProposalVerification
} from "@/lib/proposals/types";

type ProposalErrorMessage = (error: unknown, fallback: string) => string;

const dependencies = vi.hoisted(() => {
  class RebuildUnsupportedError extends Error {}

  const wallet = { signTx: vi.fn() };
  return {
    RebuildUnsupportedError,
    wallet,
    walletContext: { activeWallet: wallet, isDemoWallet: false },
    normalizeWitnessSetHex: vi.fn(),
    cancelProposal: vi.fn(),
    fetchProposal: vi.fn(),
    markProposalSubmitted: vi.fn(),
    parseProposalBuildContext: vi.fn(),
    parseProposalSummary: vi.fn(),
    rebuildProposal: vi.fn(),
    signProposal: vi.fn(),
    isAutoRebuildable: vi.fn(),
    rebuildProposalTx: vi.fn(),
    verifyProposal: vi.fn()
  };
});

vi.mock("@/lib/proposals/assemble", () => ({
  normalizeWitnessSetHex: dependencies.normalizeWitnessSetHex
}));

vi.mock("@/lib/proposals/client", async () => {
  const actual = await vi.importActual<{ getProposalErrorMessage: ProposalErrorMessage }>(
    "@/lib/proposals/client"
  );
  return {
    cancelProposal: dependencies.cancelProposal,
    fetchProposal: dependencies.fetchProposal,
    getProposalErrorMessage: actual.getProposalErrorMessage,
    markProposalSubmitted: dependencies.markProposalSubmitted,
    parseProposalBuildContext: dependencies.parseProposalBuildContext,
    parseProposalSummary: dependencies.parseProposalSummary,
    rebuildProposal: dependencies.rebuildProposal,
    signProposal: dependencies.signProposal
  };
});

vi.mock("@/lib/proposals/rebuild", () => ({
  RebuildUnsupportedError: dependencies.RebuildUnsupportedError,
  isAutoRebuildable: dependencies.isAutoRebuildable,
  rebuildProposalTx: dependencies.rebuildProposalTx
}));

vi.mock("@/lib/proposals/verify", () => ({
  verifyProposal: dependencies.verifyProposal
}));

vi.mock("@/providers/wallet-provider", () => ({
  useWalletContext: () => dependencies.walletContext
}));

import { useProposalOrchestration } from "./use-proposal-orchestration";

const SIGNER_KEY_HASH = "dd".repeat(28);
const TX_BODY_HASH = "bb".repeat(32);

function proposal(
  id: string,
  overrides: Partial<ProposalDetailDto> = {}
): ProposalDetailDto {
  return {
    id,
    walletUnit: `${"aa".repeat(28)}01`,
    walletPolicyId: "aa".repeat(28),
    title: id,
    description: null,
    actionKind: "use",
    authorityPath: "multisig",
    status: "OPEN",
    txBodyHash: TX_BODY_HASH,
    submittedTxHash: null,
    createdByKeyHash: "cc".repeat(28),
    createdAt: "2026-08-31T00:00:00.000Z",
    updatedAt: "2026-08-31T00:00:00.000Z",
    signatureCount: 0,
    signerKeyHashes: [],
    unsignedTxHex: "80",
    buildContextJson: null,
    summaryJson: null,
    signatures: [],
    ...overrides
  };
}

function verification(
  validity: ProposalVerification["validity"] = "valid",
  satisfied = false
): ProposalVerification {
  return {
    validity,
    reasons: [],
    bodyHashMatches: true,
    effect: { inputs: [], outputs: [], feeLovelace: "200000", validUntilMs: null },
    signers: {
      authorityPath: "multisig",
      requiredSigners: [],
      signedKeyHashes: [],
      satisfiedPower: satisfied ? 1 : 0,
      threshold: 1,
      satisfied
    }
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function synchronousDeferred<T>() {
  let onFulfilled: ((value: T) => unknown) | undefined;
  let onFinally: (() => unknown) | undefined;
  const chain = {
    then(callback: (value: T) => unknown) {
      onFulfilled = callback;
      return chain;
    },
    catch() {
      return chain;
    },
    finally(callback: () => unknown) {
      onFinally = callback;
      return chain;
    }
  };

  return {
    promise: chain as unknown as Promise<T>,
    resolve(value: T) {
      onFulfilled?.(value);
      onFinally?.();
    }
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  dependencies.walletContext.activeWallet = dependencies.wallet;
  dependencies.walletContext.isDemoWallet = false;
  dependencies.fetchProposal.mockImplementation(async (id: string) => proposal(id));
  dependencies.verifyProposal.mockResolvedValue(verification());
  dependencies.parseProposalBuildContext.mockReturnValue(null);
  dependencies.parseProposalSummary.mockReturnValue(null);
  dependencies.isAutoRebuildable.mockReturnValue(false);
  dependencies.wallet.signTx.mockResolvedValue("wallet-witness");
  dependencies.normalizeWitnessSetHex.mockReturnValue("normalized-witness");
});

describe("proposal lifecycle Model", () => {
  it("hides the loaded proposal while the next proposal is loading", async () => {
    const second = deferred<ProposalDetailDto>();
    dependencies.fetchProposal.mockImplementation((id: string) =>
      id === "proposal-1" ? Promise.resolve(proposal(id)) : second.promise
    );
    const { result, rerender } = renderHook(
      ({ proposalId }) =>
        useProposalOrchestration({
          proposalId,
          sessionKeyHash: SIGNER_KEY_HASH,
          onChanged: vi.fn()
        }),
      { initialProps: { proposalId: "proposal-1" } }
    );

    await waitFor(() => expect(result.current.detail?.id).toBe("proposal-1"));
    rerender({ proposalId: "proposal-2" });

    expect(result.current.detail).toBeNull();
    expect(result.current.loading).toBe(true);

    await act(async () => {
      second.resolve(proposal("proposal-2"));
      await second.promise;
    });
    await waitFor(() => expect(result.current.detail?.id).toBe("proposal-2"));
  });

  it("shows the next proposal load failure instead of keeping a spinner", async () => {
    const second = deferred<ProposalDetailDto>();
    dependencies.fetchProposal.mockImplementation((id: string) =>
      id === "proposal-1" ? Promise.resolve(proposal(id)) : second.promise
    );
    const { result, rerender } = renderHook(
      ({ proposalId }) =>
        useProposalOrchestration({
          proposalId,
          sessionKeyHash: SIGNER_KEY_HASH,
          onChanged: vi.fn()
        }),
      { initialProps: { proposalId: "proposal-1" } }
    );

    await waitFor(() => expect(result.current.detail?.id).toBe("proposal-1"));
    rerender({ proposalId: "proposal-2" });
    await act(async () => {
      second.reject(new Error("Proposal B failed"));
      await second.promise.catch(() => undefined);
    });
    await waitFor(() =>
      expect(result.current.loadError).toBe("Could not load this approval request.")
    );

    expect(result.current.detail).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("hides the prior load error during the proposal switch commit", async () => {
    const second = deferred<ProposalDetailDto>();
    dependencies.fetchProposal.mockImplementation((id: string) =>
      id === "proposal-1"
        ? Promise.reject(new Error("Proposal A failed"))
        : second.promise
    );
    const snapshots: Array<{
      proposalId: string;
      loading: boolean;
      loadError: string | null;
    }> = [];
    const { result, rerender } = renderHook(
      ({ proposalId }) => {
        const model = useProposalOrchestration({
          proposalId,
          sessionKeyHash: SIGNER_KEY_HASH,
          onChanged: vi.fn()
        });
        useLayoutEffect(() => {
          snapshots.push({
            proposalId,
            loading: model.loading,
            loadError: model.loadError
          });
        }, [model.loadError, model.loading, proposalId]);
        return model;
      },
      { initialProps: { proposalId: "proposal-1" } }
    );

    await waitFor(() =>
      expect(result.current.loadError).toBe("Could not load this approval request.")
    );
    rerender({ proposalId: "proposal-2" });

    const switchSnapshot = snapshots.find(
      (snapshot) => snapshot.proposalId === "proposal-2"
    );
    expect(switchSnapshot).toEqual({
      proposalId: "proposal-2",
      loading: true,
      loadError: null
    });

    await act(async () => {
      second.resolve(proposal("proposal-2"));
      await second.promise;
    });
  });

  it("rejects an earlier fetch during the proposal switch commit", async () => {
    const first = synchronousDeferred<ProposalDetailDto>();
    const second = deferred<ProposalDetailDto>();
    dependencies.fetchProposal.mockImplementation((id: string) =>
      id === "proposal-1" ? first.promise : second.promise
    );
    const onChanged = vi.fn();
    const { result, rerender } = renderHook(
      ({ proposalId }) => {
        const model = useProposalOrchestration({
          proposalId,
          sessionKeyHash: SIGNER_KEY_HASH,
          onChanged
        });
        useLayoutEffect(() => {
          if (proposalId === "proposal-2") {
            first.resolve(proposal("proposal-1"));
          }
        }, [proposalId]);
        return model;
      },
      { initialProps: { proposalId: "proposal-1" } }
    );

    await waitFor(() => expect(dependencies.fetchProposal).toHaveBeenCalledTimes(1));
    rerender({ proposalId: "proposal-2" });
    await waitFor(() => expect(dependencies.fetchProposal).toHaveBeenCalledTimes(2));

    expect(result.current.detail).toBeNull();

    await act(async () => {
      second.resolve(proposal("proposal-2"));
      await second.promise;
    });
    await waitFor(() => expect(result.current.detail?.id).toBe("proposal-2"));
  });

  it("ignores a verification result from the proposal that was just closed", async () => {
    const first = deferred<ProposalVerification>();
    const second = deferred<ProposalVerification>();
    dependencies.verifyProposal.mockImplementation((record: ProposalDetailDto) =>
      record.id === "proposal-1" ? first.promise : second.promise
    );
    const onChanged = vi.fn();
    const { result, rerender } = renderHook(
      ({ proposalId }) =>
        useProposalOrchestration({ proposalId, sessionKeyHash: SIGNER_KEY_HASH, onChanged }),
      { initialProps: { proposalId: "proposal-1" } }
    );

    await waitFor(() => expect(dependencies.verifyProposal).toHaveBeenCalledTimes(1));
    rerender({ proposalId: "proposal-2" });
    await waitFor(() => expect(dependencies.verifyProposal).toHaveBeenCalledTimes(2));

    await act(async () => {
      second.resolve(verification("valid"));
      await second.promise;
    });
    await waitFor(() => expect(result.current.verification?.validity).toBe("valid"));

    await act(async () => {
      first.resolve(verification("invalid"));
      await first.promise;
    });

    expect(result.current.detail?.id).toBe("proposal-2");
    expect(result.current.verification?.validity).toBe("valid");
    expect(result.current.verifying).toBe(false);
  });

  it("signs and submits through the current proposal command paths", async () => {
    dependencies.verifyProposal.mockResolvedValue(verification("valid", true));
    const initial = proposal("proposal-1");
    const signed = proposal("proposal-1", {
      signatureCount: 1,
      signerKeyHashes: [SIGNER_KEY_HASH],
      signatures: [
        {
          signerKeyHash: SIGNER_KEY_HASH,
          current: true,
          createdAt: "2026-08-31T00:01:00.000Z",
          witnessSetHex: "normalized-witness"
        }
      ]
    });
    const submitted = { ...signed, status: "SUBMITTED" as const, submittedTxHash: "ef".repeat(32) };
    dependencies.fetchProposal.mockResolvedValue(initial);
    dependencies.signProposal.mockResolvedValue(signed);
    dependencies.markProposalSubmitted.mockResolvedValue(submitted);
    const onChanged = vi.fn();
    const { result } = renderHook(() =>
      useProposalOrchestration({
        proposalId: initial.id,
        sessionKeyHash: SIGNER_KEY_HASH,
        onChanged
      })
    );

    await waitFor(() => expect(result.current.canSign).toBe(true));
    await act(async () => result.current.handleSign());

    expect(dependencies.wallet.signTx).toHaveBeenCalledWith(initial.unsignedTxHex, true);
    expect(dependencies.normalizeWitnessSetHex).toHaveBeenCalledWith("wallet-witness");
    expect(dependencies.signProposal).toHaveBeenCalledWith(initial.id, {
      witnessSetHex: "normalized-witness",
      txBodyHash: initial.txBodyHash
    });
    expect(result.current.canSign).toBe(false);

    await act(async () => result.current.handleSubmit());

    expect(dependencies.markProposalSubmitted).toHaveBeenCalledWith(
      initial.id,
      initial.txBodyHash
    );
    expect(result.current.detail?.status).toBe("SUBMITTED");
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it("does not show a wallet provider's internal signing error", async () => {
    dependencies.wallet.signTx.mockRejectedValue(
      new Error("provider endpoint /api/v0/key failed")
    );
    const { result } = renderHook(() =>
      useProposalOrchestration({
        proposalId: "proposal-1",
        sessionKeyHash: SIGNER_KEY_HASH,
        onChanged: vi.fn()
      })
    );

    await waitFor(() => expect(result.current.canSign).toBe(true));
    await act(async () => result.current.handleSign());

    expect(result.current.actionError).toBe("Signing failed.");
  });

  it("distinguishes a failed signature upload from failed wallet signing", async () => {
    dependencies.signProposal.mockRejectedValue(new Error("Failed to fetch"));
    const { result } = renderHook(() =>
      useProposalOrchestration({
        proposalId: "proposal-1",
        sessionKeyHash: SIGNER_KEY_HASH,
        onChanged: vi.fn()
      })
    );

    await waitFor(() => expect(result.current.canSign).toBe(true));
    await act(async () => result.current.handleSign());

    expect(dependencies.wallet.signTx).toHaveBeenCalledTimes(1);
    expect(result.current.actionError).toBe(
      "Your wallet signed this request, but the app could not add the signature. Check your connection and try again."
    );
  });

  it("rebuilds and withdraws through the current proposal command paths", async () => {
    dependencies.verifyProposal.mockResolvedValue(verification("invalid"));
    const initial = proposal("proposal-1", { createdByKeyHash: SIGNER_KEY_HASH });
    const rebuilt = proposal("proposal-1", {
      createdByKeyHash: SIGNER_KEY_HASH,
      unsignedTxHex: "81",
      txBodyHash: "ee".repeat(32)
    });
    const cancelled = { ...rebuilt, status: "CANCELLED" as const };
    const buildContext = { builder: "stt-spend" } as ProposalBuildContext;
    dependencies.fetchProposal
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(cancelled);
    dependencies.parseProposalBuildContext.mockReturnValue(buildContext);
    dependencies.isAutoRebuildable.mockReturnValue(true);
    dependencies.rebuildProposalTx.mockResolvedValue({
      txHex: rebuilt.unsignedTxHex,
      txBodyHash: rebuilt.txBodyHash,
      buildContext
    });
    dependencies.rebuildProposal.mockResolvedValue(rebuilt);
    dependencies.cancelProposal.mockResolvedValue(undefined);
    const onChanged = vi.fn();
    const { result } = renderHook(() =>
      useProposalOrchestration({
        proposalId: initial.id,
        sessionKeyHash: SIGNER_KEY_HASH,
        onChanged
      })
    );

    await waitFor(() => expect(result.current.canRebuild).toBe(true));
    await act(async () => result.current.handleRebuild());

    expect(dependencies.rebuildProposalTx).toHaveBeenCalledWith(
      initial,
      buildContext,
      dependencies.wallet
    );
    expect(dependencies.rebuildProposal).toHaveBeenCalledWith(initial.id, {
      unsignedTxHex: rebuilt.unsignedTxHex,
      txBodyHash: rebuilt.txBodyHash,
      expectedBodyHash: initial.txBodyHash,
      buildContext
    });
    expect(result.current.actionInfo).toBe(
      "Rebuilt against live chain state. Existing signatures were reset."
    );

    await act(async () => result.current.handleCancel());

    expect(dependencies.cancelProposal).toHaveBeenCalledWith(initial.id);
    expect(result.current.detail?.status).toBe("CANCELLED");
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it("disables rebuild while the rebuilt body is being verified", async () => {
    const rebuiltVerification = deferred<ProposalVerification>();
    dependencies.verifyProposal
      .mockResolvedValueOnce(verification("invalid"))
      .mockReturnValueOnce(rebuiltVerification.promise);
    const initial = proposal("proposal-1", { createdByKeyHash: SIGNER_KEY_HASH });
    const rebuilt = proposal("proposal-1", {
      createdByKeyHash: SIGNER_KEY_HASH,
      unsignedTxHex: "81",
      txBodyHash: "ee".repeat(32)
    });
    const buildContext = { builder: "stt-spend" } as ProposalBuildContext;
    dependencies.fetchProposal.mockResolvedValue(initial);
    dependencies.parseProposalBuildContext.mockReturnValue(buildContext);
    dependencies.isAutoRebuildable.mockReturnValue(true);
    dependencies.rebuildProposalTx.mockResolvedValue({
      txHex: rebuilt.unsignedTxHex,
      txBodyHash: rebuilt.txBodyHash,
      buildContext
    });
    dependencies.rebuildProposal.mockResolvedValue(rebuilt);
    const { result } = renderHook(() =>
      useProposalOrchestration({
        proposalId: initial.id,
        sessionKeyHash: SIGNER_KEY_HASH,
        onChanged: vi.fn()
      })
    );

    await waitFor(() => expect(result.current.canRebuild).toBe(true));
    await act(async () => result.current.handleRebuild());

    expect(result.current.busy).toBeNull();
    expect(result.current.verifying).toBe(true);
    expect(result.current.canRebuild).toBe(false);

    await act(async () => {
      rebuiltVerification.resolve(verification("valid"));
      await rebuiltVerification.promise;
    });
    expect(result.current.verifying).toBe(false);
  });

  it("ignores an action result after the selected proposal changes", async () => {
    const signed = deferred<ProposalDetailDto>();
    dependencies.signProposal.mockReturnValue(signed.promise);
    const onChanged = vi.fn();
    const { result, rerender } = renderHook(
      ({ proposalId }) =>
        useProposalOrchestration({ proposalId, sessionKeyHash: SIGNER_KEY_HASH, onChanged }),
      { initialProps: { proposalId: "proposal-1" } }
    );

    await waitFor(() => expect(result.current.canSign).toBe(true));
    let pendingSign!: Promise<void>;
    act(() => {
      pendingSign = result.current.handleSign();
    });
    await waitFor(() => expect(dependencies.signProposal).toHaveBeenCalledTimes(1));

    rerender({ proposalId: "proposal-2" });
    await waitFor(() => expect(result.current.detail?.id).toBe("proposal-2"));

    await act(async () => {
      signed.resolve(proposal("proposal-1", { signatureCount: 1 }));
      await pendingSign;
    });

    expect(result.current.detail?.id).toBe("proposal-2");
    expect(result.current.actionInfo).toBeNull();
    expect(result.current.busy).toBeNull();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("offers rebuild to the proposer only, and tells a co-signer who can", async () => {
    dependencies.verifyProposal.mockResolvedValue(verification("invalid"));
    const proposerKeyHash = "cc".repeat(28);
    dependencies.fetchProposal.mockResolvedValue(
      proposal("proposal-1", { createdByKeyHash: proposerKeyHash })
    );
    dependencies.parseProposalBuildContext.mockReturnValue({
      builder: "stt-spend"
    } as ProposalBuildContext);
    dependencies.isAutoRebuildable.mockReturnValue(true);
    const { result } = renderHook(() =>
      useProposalOrchestration({
        proposalId: "proposal-1",
        sessionKeyHash: SIGNER_KEY_HASH,
        onChanged: vi.fn()
      })
    );

    await waitFor(() => expect(result.current.isInvalid).toBe(true));

    expect(result.current.isCreator).toBe(false);
    expect(result.current.canRebuild).toBe(false);
    expect(result.current.rebuildNeedsProposer).toBe(true);

    await act(async () => result.current.handleRebuild());
    expect(dependencies.rebuildProposalTx).not.toHaveBeenCalled();
  });

  it("rejects submit, rebuild, and cancel commands outside their lifecycle gates", async () => {
    const onChanged = vi.fn();
    const { result } = renderHook(() =>
      useProposalOrchestration({
        proposalId: "proposal-1",
        sessionKeyHash: SIGNER_KEY_HASH,
        onChanged
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.handleSubmit();
      await result.current.handleRebuild();
      await result.current.handleCancel();
    });

    expect(dependencies.markProposalSubmitted).not.toHaveBeenCalled();
    expect(dependencies.rebuildProposalTx).not.toHaveBeenCalled();
    expect(dependencies.cancelProposal).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });
});
