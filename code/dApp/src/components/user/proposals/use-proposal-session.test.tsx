import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  fetchProposalSession: vi.fn(),
  signOutProposals: vi.fn(),
  walletContext: {
    activeWallet: null,
    activeAddress: "addr_test1session",
    activePaymentKeyHash: "cc".repeat(28),
    isDemoWallet: false
  }
}));

vi.mock("@/lib/proposals/client", () => ({
  completeSignIn: vi.fn(),
  fetchProposalSession: dependencies.fetchProposalSession,
  requestSignInNonce: vi.fn(),
  signOutProposals: dependencies.signOutProposals
}));

vi.mock("@/providers/wallet-provider", () => ({
  useWalletContext: () => dependencies.walletContext
}));

import { useProposalSession } from "./use-proposal-session";

const SESSION = {
  paymentKeyHash: "cc".repeat(28),
  address: "addr_test1session"
};

beforeEach(() => {
  dependencies.fetchProposalSession.mockReset().mockResolvedValue(SESSION);
  dependencies.signOutProposals.mockReset();
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
