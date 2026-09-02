import { act, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  disconnect: vi.fn().mockResolvedValue(undefined),
  connect: vi.fn()
}));

vi.mock("@/lib/walletconnect/client", () => ({
  isWalletConnectConfigured: () => true,
  buildRequiredNamespaces: () => ({}),
  getSignClient: async () => ({
    session: { getAll: () => [] },
    on: () => undefined,
    connect: mocks.connect,
    disconnect: mocks.disconnect
  })
}));

import { WalletConnectProvider, useWalletConnect } from "./walletconnect-provider";

function Probe() {
  const wc = useWalletConnect();
  return (
    <>
      <span data-testid="status">{wc.status}</span>
      <button type="button" onClick={() => void wc.connect()}>
        pair
      </button>
      <button type="button" onClick={() => void wc.disconnect()}>
        cancel
      </button>
    </>
  );
}

beforeEach(() => {
  mocks.connect.mockReset();
  mocks.disconnect.mockClear();
});

it("drops a pairing the user cancelled and ends the session the phone approved late", async () => {
  // Cancel used to leave the approval running; five minutes later the UI flipped to
  // connected (or to an error banner) on its own.
  let approve!: (session: { topic: string }) => void;
  mocks.connect.mockResolvedValue({
    uri: "wc:topic@2",
    approval: () =>
      new Promise((resolve) => {
        approve = resolve;
      })
  });
  render(
    <WalletConnectProvider>
      <Probe />
    </WalletConnectProvider>
  );

  await act(async () => {
    screen.getByRole("button", { name: "pair" }).click();
  });
  expect(screen.getByTestId("status").textContent).toBe("awaiting-approval");

  await act(async () => {
    screen.getByRole("button", { name: "cancel" }).click();
  });
  expect(screen.getByTestId("status").textContent).toBe("idle");

  await act(async () => {
    approve({ topic: "late-session" });
  });
  expect(screen.getByTestId("status").textContent).toBe("idle");
  expect(mocks.disconnect).toHaveBeenCalledWith(
    expect.objectContaining({ topic: "late-session" })
  );
});

it("keeps a cancelled pairing's failure off the screen", async () => {
  let reject!: (error: Error) => void;
  mocks.connect.mockResolvedValue({
    uri: "wc:topic@2",
    approval: () =>
      new Promise((_, rejectPromise) => {
        reject = rejectPromise;
      })
  });
  render(
    <WalletConnectProvider>
      <Probe />
    </WalletConnectProvider>
  );

  await act(async () => {
    screen.getByRole("button", { name: "pair" }).click();
  });
  await act(async () => {
    screen.getByRole("button", { name: "cancel" }).click();
  });
  await act(async () => {
    reject(new Error("Proposal expired"));
  });
  expect(screen.getByTestId("status").textContent).toBe("idle");
});
