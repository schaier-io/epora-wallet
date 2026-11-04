import { StrictMode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { focusManager, onlineManager, type QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createQueryTestWrapper } from "@/test/query-client";
import { proposalKeys } from "@/lib/proposals/query";
import { STT_VISIT_SYNC_COOLDOWN_MS, STT_VISIT_SYNC_PATH } from "@/lib/stt-cache/visit-sync-policy";
import { SiteVisitSync } from "./site-visit-sync";

const wallet = vi.hoisted(() => ({
  activeWallet: null as object | null,
  activeAddress: undefined as string | undefined,
  walletSessionLoading: false,
  isDemoWallet: false
}));
vi.mock("@/providers/wallet-provider", () => ({ useWalletContext: () => wallet }));

const ADDRESS = "addr_test1visit";
const SESSION = { paymentKeyHash: "ab".repeat(28), address: ADDRESS };
const clients: QueryClient[] = [];
const complete = () => ({ outcome: "ran", retryAfterMs: STT_VISIT_SYNC_COOLDOWN_MS,
  historyComplete: true, walletReconcileComplete: true, continuationNeeded: false });

function network(options: { session?: boolean; result?: unknown; response?: () => Promise<Response> } = {}) {
  const fetch = vi.fn(async (url: unknown) => {
    if (url === "/api/proposals/auth") return options.session
      ? Response.json(SESSION) : new Response(null, { status: 401 });
    if (url === STT_VISIT_SYNC_PATH) return options.response
      ? options.response() : Response.json(options.result ?? complete());
    throw new Error(`Unexpected request: ${String(url)}`);
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function mount(strict = false) {
  const { wrapper, queryClient } = createQueryTestWrapper();
  clients.push(queryClient);
  const element = strict ? <StrictMode><SiteVisitSync /></StrictMode> : <SiteVisitSync />;
  return { ...render(element, { wrapper }), queryClient, wrapper };
}

beforeEach(() => {
  Object.assign(wallet, { activeWallet: null, activeAddress: undefined, walletSessionLoading: false, isDemoWallet: false });
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
});
afterEach(() => {
  clients.splice(0).forEach(client => client.clear());
  vi.unstubAllGlobals();
  vi.useRealTimers();
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
});

it("does not request synchronization for a guest page load", async () => {
  const fetch = network();
  mount();
  await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/proposals/auth", expect.anything()));
  expect(fetch.mock.calls.filter(([url]) => url === STT_VISIT_SYNC_PATH)).toHaveLength(0);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("starts after wallet restoration and completes once under Strict Mode", async () => {
  const fetch = network();
  wallet.walletSessionLoading = true;
  const view = mount(true);
  expect(fetch.mock.calls.filter(([url]) => url === STT_VISIT_SYNC_PATH)).toHaveLength(0);
  Object.assign(wallet, { activeWallet: {}, activeAddress: ADDRESS, walletSessionLoading: false });
  view.rerender(<StrictMode><SiteVisitSync /></StrictMode>);
  await screen.findByText("Wallet records refreshed.");
  const visits = fetch.mock.calls.filter(([url]) => url === STT_VISIT_SYNC_PATH);
  expect(visits).toHaveLength(1);
  expect(fetch).toHaveBeenCalledWith(STT_VISIT_SYNC_PATH, expect.objectContaining({
    method: "POST", credentials: "same-origin", body: JSON.stringify({ address: ADDRESS })
  }));
});

it("accepts an existing signature session without a connected wallet", async () => {
  const fetch = network({ session: true });
  mount();
  await screen.findByText("Wallet records refreshed.");
  expect(fetch).toHaveBeenCalledWith(STT_VISIT_SYNC_PATH, expect.objectContaining({ body: "{}" }));
});

it("does not let a demo visit trigger a real session's synchronization", async () => {
  const fetch = network({ session: true });
  Object.assign(wallet, { activeWallet: {}, activeAddress: ADDRESS, isDemoWallet: true });
  mount();
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  expect(fetch.mock.calls.filter(([url]) => url === STT_VISIT_SYNC_PATH)).toHaveLength(0);
});

it("waits for a hidden eligible visit to become visible, then never uses a heartbeat", async () => {
  const fetch = network({ session: true });
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
  mount();
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  expect(fetch.mock.calls.filter(([url]) => url === STT_VISIT_SYNC_PATH)).toHaveLength(0);
  await act(async () => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await screen.findByText("Wallet records refreshed.");
  vi.useFakeTimers();
  await act(async () => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(STT_VISIT_SYNC_COOLDOWN_MS * 2);
  });
  expect(fetch.mock.calls.filter(([url]) => url === STT_VISIT_SYNC_PATH)).toHaveLength(1);
});

it("shares the cooldown between page mounts and shows incomplete catch-up honestly", async () => {
  const fetch = network({ session: true, result: { ...complete(), historyComplete: false, continuationNeeded: true } });
  const view = mount();
  await screen.findByText(/Some wallet records still need an update/);
  view.unmount();
  render(<SiteVisitSync />, { wrapper: view.wrapper });
  await screen.findByText(/Some wallet records still need an update/);
  expect(fetch.mock.calls.filter(([url]) => url === STT_VISIT_SYNC_PATH)).toHaveLength(1);
});

it("refreshes cached proposal membership only after the sync response finishes", async () => {
  let finish!: (response: Response) => void;
  network({ session: true, response: () => new Promise<Response>(resolve => { finish = resolve; }) });
  const view = mount();
  const listKey = proposalKeys.list(SESSION.paymentKeyHash);
  view.queryClient.setQueryData(listKey, { pages: [], pageParams: [] });
  await screen.findByText("Checking for wallet updates…");
  expect(view.queryClient.getQueryState(listKey)?.isInvalidated).toBe(false);
  await act(async () => { finish(Response.json(complete())); });
  await screen.findByText("Wallet records refreshed.");
  expect(view.queryClient.getQueryState(listKey)?.isInvalidated).toBe(true);
});

it("keeps a failed or malformed result on cooldown without an automatic retry", async () => {
  const fetch = network({ session: true, result: { outcome: "ran", retryAfterMs: 0 } });
  const view = mount();
  await screen.findByText("Wallet updates could not finish. Please try again later.");
  view.unmount();
  render(<SiteVisitSync />, { wrapper: view.wrapper });
  await screen.findByText("Wallet updates could not finish. Please try again later.");
  expect(fetch.mock.calls.filter(([url]) => url === STT_VISIT_SYNC_PATH)).toHaveLength(1);
});

it("fails an offline visit without queuing sync for a later reconnect", async () => {
  Object.assign(wallet, { activeWallet: {}, activeAddress: ADDRESS });
  const fetch = network({ response: async () => { throw new TypeError("Offline"); } });
  onlineManager.setOnline(false);
  const view = mount();
  await screen.findByText("Wallet updates could not finish. Please try again later.");
  view.unmount();
  await act(async () => { onlineManager.setOnline(true); });
  expect(fetch.mock.calls.filter(([url]) => url === STT_VISIT_SYNC_PATH)).toHaveLength(1);
});
