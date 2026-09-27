import { createQueryTestWrapper } from "@/test/query-client";
import { act, renderHook as queryRenderhook, waitFor } from "@testing-library/react";
const renderHook: typeof queryRenderhook = (callback, options) => queryRenderhook(callback, { wrapper: createQueryTestWrapper().wrapper, ...options });
import { beforeEach, expect, it, vi } from "vitest";

import type * as ProposalClient from "@/lib/proposals/client";
import type * as BetaConsentModule from "@/lib/legal/browser-beta-consent";

const consentCheck = vi.hoisted(() => vi.fn());
vi.mock("@/lib/legal/browser-beta-consent", async (original) => ({
  ...await original<typeof BetaConsentModule>(),
  requireBrowserBetaConsent: consentCheck
}));
import { BetaConsentRequiredError } from "@/lib/legal/browser-beta-consent";

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
import { proposalKeys } from "@/lib/proposals/query";

const SESSION = {
  paymentKeyHash: "cc".repeat(28),
  address: "addr_test1session"
};

beforeEach(() => {
  consentCheck.mockReset().mockResolvedValue(undefined);
  dependencies.fetchProposalSession.mockReset().mockResolvedValue(SESSION);
  dependencies.completeSignIn.mockReset();
  dependencies.requestSignInNonce.mockReset().mockResolvedValue("nonce");
  dependencies.walletContext.activeWallet = { signData: vi.fn() };
  dependencies.walletContext.activeAddress = SESSION.address;
  dependencies.walletContext.activePaymentKeyHash = SESSION.paymentKeyHash;
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


it("clears private cached proposals and ignores an old auth response after sign-out", async () => {
  const { wrapper, queryClient } = createQueryTestWrapper();
  queryClient.setQueryData(proposalKeys.session, SESSION);
  queryClient.setQueryData(proposalKeys.detail(SESSION.paymentKeyHash, "private"), { id: "private" });
  let resolveRead!: (value: typeof SESSION) => void;
  dependencies.fetchProposalSession.mockReturnValue(new Promise<typeof SESSION>((resolve) => { resolveRead = resolve; }));
  dependencies.signOutProposals.mockResolvedValue(undefined);
  const { result } = renderHook(() => useProposalSession(), { wrapper });
  act(() => { void queryClient.invalidateQueries({ queryKey: proposalKeys.session }); });
  await act(async () => result.current.signOut());
  await waitFor(() => expect(result.current.session).toBeNull());
  expect(queryClient.getQueriesData({ queryKey: proposalKeys.all })).toEqual([]);
  await act(async () => { resolveRead(SESSION); });
  expect(result.current.session).toBeNull();
  expect(queryClient.getQueryData(proposalKeys.session)).toBeNull();
});


it("refuses a wallet authentication signature when beta consent is absent", async () => {
  consentCheck.mockRejectedValue(new BetaConsentRequiredError());
  const { result } = renderHook(() => useProposalSession());
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => result.current.signIn());
  expect(dependencies.walletContext.activeWallet.signData).not.toHaveBeenCalled();
  expect(dependencies.completeSignIn).not.toHaveBeenCalled();
  expect(result.current.error).toContain("Reload and accept the current risks and terms");
});

it("does not let an unmounted sign-in overwrite a newer account session", async () => {
  const context = createQueryTestWrapper();
  const accountB = { paymentKeyHash: "bb".repeat(28), address: "addr_test1B" };
  let resolveOldSignature!: (value: {signature: string; key: string}) => void;
  const oldWallet = dependencies.walletContext.activeWallet;
  oldWallet.signData.mockReturnValue(new Promise(resolve => { resolveOldSignature = resolve; }));
  dependencies.completeSignIn.mockImplementation(async (payload: Parameters<typeof ProposalClient.completeSignIn>[0]) => payload.address === SESSION.address ? SESSION : accountB);
  dependencies.fetchProposalSession.mockResolvedValue(null);
  const first = renderHook(() => useProposalSession(), {wrapper: context.wrapper});
  await waitFor(() => expect(first.result.current.loading).toBe(false));
  let oldOperation!: Promise<void>;
  act(() => { oldOperation = first.result.current.signIn(); });
  await waitFor(() => expect(oldWallet.signData).toHaveBeenCalledTimes(1));
  first.unmount();
  dependencies.walletContext.activeWallet = {signData: vi.fn().mockResolvedValue({signature: "new", key: "new"})};
  dependencies.walletContext.activeAddress = accountB.address;
  dependencies.walletContext.activePaymentKeyHash = accountB.paymentKeyHash;
  const second = renderHook(() => useProposalSession(), {wrapper: context.wrapper});
  await act(async () => second.result.current.signIn());
  await waitFor(() => expect(second.result.current.session).toEqual(accountB));
  await act(async () => { resolveOldSignature({signature: "old", key: "old"}); await oldOperation; });
  expect(context.queryClient.getQueryData(proposalKeys.session)).toEqual(accountB);
  expect(dependencies.completeSignIn).toHaveBeenCalledTimes(1);
});


it.each([
  ["signIn", false],
  ["signOut", false],
  ["signIn", true]
] as const)("serializes a newer %s after an auth POST (rejection: %s)", async (operation, rejectOld) => {
  const actual = await vi.importActual<typeof ProposalClient>("@/lib/proposals/client");
  const accountB = { paymentKeyHash: "bb".repeat(28), address: "addr_test1B" };
  let releaseOld!: () => void;
  const oldResponse = new Promise<void>((resolve) => { releaseOld = resolve; });
  let cookie: typeof SESSION | null = null;
  let calls = 0;
  const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    calls += 1;
    if (calls === 1) {
      await oldResponse;
      if (rejectOld) throw new Error("Connection failed");
      cookie = SESSION;
      return Response.json(SESSION);
    }
    cookie = init?.method === "DELETE" ? null : accountB;
    return Response.json(cookie);
  });
  vi.stubGlobal("fetch", fetchMock);
  dependencies.completeSignIn.mockImplementation(actual.completeSignIn);
  dependencies.signOutProposals.mockImplementation(actual.signOutProposals);
  dependencies.fetchProposalSession.mockResolvedValue(null);
  dependencies.walletContext.activeWallet.signData.mockResolvedValue({ signature: "old", key: "old" });
  const context = createQueryTestWrapper();
  const first = renderHook(() => useProposalSession(), { wrapper: context.wrapper });
  let oldOperation!: Promise<void>;
  act(() => { oldOperation = first.result.current.signIn(); });
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  dependencies.walletContext.activeWallet = { signData: vi.fn().mockResolvedValue({ signature: "new", key: "new" }) };
  dependencies.walletContext.activeAddress = accountB.address;
  dependencies.walletContext.activePaymentKeyHash = accountB.paymentKeyHash;
  const second = renderHook(() => useProposalSession(), { wrapper: context.wrapper });
  let newOperation!: Promise<void>;
  await act(async () => { newOperation = second.result.current[operation](); });
  first.unmount();
  const callsBeforeOldResponse = fetchMock.mock.calls.length;
  await act(async () => {
    releaseOld();
    await Promise.all([oldOperation, newOperation]);
  });
  vi.unstubAllGlobals();

  expect(callsBeforeOldResponse).toBe(1);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  const expected = operation === "signIn" ? accountB : null;
  expect(cookie).toEqual(expected);
  expect(context.queryClient.getQueryData(proposalKeys.session)).toEqual(expected);
});


it("drops a pending signature when the wallet changes without unmounting", async () => {
  let releaseSignature!: (value: { signature: string; key: string }) => void;
  const pendingSignature = new Promise<{ signature: string; key: string }>((resolve) => { releaseSignature = resolve; });
  const oldWallet = dependencies.walletContext.activeWallet;
  oldWallet.signData.mockReturnValue(pendingSignature);
  dependencies.fetchProposalSession.mockResolvedValue(null);
  const accountB = { paymentKeyHash: "bb".repeat(28), address: "addr_test1B" };
  dependencies.completeSignIn.mockResolvedValue(accountB);
  const context = createQueryTestWrapper();
  const { result, rerender } = renderHook(() => useProposalSession(), { wrapper: context.wrapper });
  let oldOperation!: Promise<void>;
  act(() => { oldOperation = result.current.signIn(); });
  await waitFor(() => expect(oldWallet.signData).toHaveBeenCalledTimes(1));
  dependencies.walletContext.activeWallet = { signData: vi.fn().mockResolvedValue({ signature: "new", key: "new" }) };
  dependencies.walletContext.activeAddress = accountB.address;
  dependencies.walletContext.activePaymentKeyHash = accountB.paymentKeyHash;
  rerender();
  expect(result.current.signingIn).toBe(false);
  await act(async () => result.current.signIn());
  await act(async () => {
    releaseSignature({ signature: "old", key: "old" });
    await oldOperation;
  });
  expect(dependencies.completeSignIn).toHaveBeenCalledTimes(1);
  expect(dependencies.completeSignIn).toHaveBeenCalledWith(expect.objectContaining({ address: accountB.address }));
  expect(context.queryClient.getQueryData(proposalKeys.session)).toEqual(accountB);
});
