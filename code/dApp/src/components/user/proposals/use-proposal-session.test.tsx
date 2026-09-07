import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

type ProposalErrorMessage = (error: unknown, fallback: string) => string;
type ProposalRequestErrorConstructor = new (message?: string) => Error;

const dependencies = vi.hoisted(() => ({
  completeSignIn: vi.fn(),
  fetchProposalSession: vi.fn(),
  requestSignInNonce: vi.fn(),
  signOutProposals: vi.fn(),
  walletContext: {
    activeWallet: { signData: vi.fn() },
    activeAddress: "addr_test1session",
    activePaymentKeyHash: "cc".repeat(28),
    isDemoWallet: false
  }
}));

vi.mock("@/lib/proposals/client", async () => {
  const actual = await vi.importActual<{
    getProposalErrorMessage: ProposalErrorMessage;
    ProposalRequestError: ProposalRequestErrorConstructor;
  }>("@/lib/proposals/client");
  return {
    completeSignIn: dependencies.completeSignIn,
    fetchProposalSession: dependencies.fetchProposalSession,
    getProposalErrorMessage: actual.getProposalErrorMessage,
    ProposalRequestError: actual.ProposalRequestError,
    requestSignInNonce: dependencies.requestSignInNonce,
    signOutProposals: dependencies.signOutProposals
  };
});

vi.mock("@/providers/wallet-provider", () => ({
  useWalletContext: () => dependencies.walletContext
}));

import { useProposalSession } from "./use-proposal-session";
import { ProposalRequestError } from "@/lib/proposals/client";

const SESSION = {
  paymentKeyHash: "cc".repeat(28),
  address: "addr_test1session"
};

beforeEach(() => {
  dependencies.fetchProposalSession.mockReset().mockResolvedValue(SESSION);
  dependencies.completeSignIn.mockReset();
  dependencies.requestSignInNonce.mockReset().mockResolvedValue("nonce");
  dependencies.walletContext.activeWallet.signData.mockReset();
  dependencies.signOutProposals.mockReset();
});

it("reports an initial proposal-session service failure", async () => {
  dependencies.fetchProposalSession.mockRejectedValue(
    new ProposalRequestError("Proposal service unavailable.")
  );

  const { result } = renderHook(() => useProposalSession());
  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(result.current.session).toBeNull();
  expect(result.current.error).toBe("Proposal service unavailable.");
});

it("treats an unauthenticated proposal session as signed out without an error", async () => {
  dependencies.fetchProposalSession.mockResolvedValue(null);

  const { result } = renderHook(() => useProposalSession());
  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(result.current.session).toBeNull();
  expect(result.current.error).toBeNull();
});

it("does not show a wallet provider's sentence-form sign-in error", async () => {
  dependencies.walletContext.activeWallet.signData.mockRejectedValue(
    new Error("The wallet could not sign this message.")
  );
  const { result } = renderHook(() => useProposalSession());
  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => result.current.signIn());

  expect(result.current.error).toBe("Could not sign in. Try again.");
});

it("preserves typed proposal API copy during sign-in", async () => {
  dependencies.requestSignInNonce.mockRejectedValue(
    new ProposalRequestError("Too many sign-in challenges. Try again shortly.")
  );
  const { result } = renderHook(() => useProposalSession());
  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => result.current.signIn());

  expect(result.current.error).toBe("Too many sign-in challenges. Try again shortly.");
});

it("keeps the session and reports safe feedback when sign-out fails", async () => {
  dependencies.signOutProposals.mockRejectedValue(new Error("database details"));
  const { result } = renderHook(() => useProposalSession());
  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => {
    await result.current.signOut();
  });

  expect(result.current.session).toEqual(SESSION);
  expect(result.current.error).toBe("Could not sign out. Try again.");
  expect(result.current.error).not.toContain("database details");
});
