import { act, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  disconnect: vi.fn().mockResolvedValue(undefined),
  connect: vi.fn(),
  getSignClient: vi.fn<() => Promise<unknown>>(),
  on: vi.fn<(event: string, listener: (payload: { topic: string }) => void) => void>(),
  off: vi.fn<(event: string, listener: (payload: { topic: string }) => void) => void>(),
  sessions: [] as Array<{ topic: string; acknowledged?: boolean }>,
  listeners: new Map<string, (payload: { topic: string }) => void>()
}));

const signClient = {
  session: { getAll: () => mocks.sessions },
  on: mocks.on,
  off: mocks.off,
  connect: mocks.connect,
  disconnect: mocks.disconnect
};

vi.mock("@/lib/walletconnect/client", () => ({
  isWalletConnectConfigured: () => true,
  buildRequiredNamespaces: () => ({}),
  getSignClient: () => mocks.getSignClient()
}));

import { WalletConnectProvider, useWalletConnect } from "./walletconnect-provider";

function Probe() {
  const wc = useWalletConnect();
  return (
    <>
      <span data-testid="status">{wc.status}</span>
      <span data-testid="topic">{wc.session?.topic ?? "none"}</span>
      <span data-testid="acknowledged">{String(wc.session?.acknowledged ?? false)}</span>
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
  mocks.sessions = [];
  mocks.listeners.clear();
  mocks.on.mockReset().mockImplementation((event, listener) => {
    mocks.listeners.set(event, listener);
  });
  mocks.off.mockReset();
  mocks.getSignClient.mockReset().mockResolvedValue(signClient);
  mocks.connect.mockReset();
  mocks.disconnect.mockClear();
});

it("removes its singleton client listeners when the provider unmounts", async () => {
  const view = render(
    <WalletConnectProvider>
      <Probe />
    </WalletConnectProvider>
  );
  await act(async () => undefined);

  const deleteListener = mocks.listeners.get("session_delete");
  const eventListener = mocks.listeners.get("session_event");
  const updateListener = mocks.listeners.get("session_update");
  expect(deleteListener).toBeTypeOf("function");
  expect(eventListener).toBeTypeOf("function");
  expect(updateListener).toBeTypeOf("function");

  view.unmount();

  expect(mocks.off).toHaveBeenCalledWith("session_delete", deleteListener);
  expect(mocks.off).toHaveBeenCalledWith("session_event", eventListener);
  expect(mocks.off).toHaveBeenCalledWith("session_update", updateListener);
});

it("updates the matching session when its namespaces change", async () => {
  const active = { topic: "active", acknowledged: false };
  mocks.sessions = [active];
  render(
    <WalletConnectProvider>
      <Probe />
    </WalletConnectProvider>
  );
  await act(async () => undefined);
  expect(screen.getByTestId("topic").textContent).toBe("active");

  mocks.sessions = [{ topic: "active", acknowledged: true }, { topic: "other" }];
  await act(async () => {
    mocks.listeners.get("session_update")?.({ topic: "active" });
  });

  expect(screen.getByTestId("topic").textContent).toBe("active");
  expect(screen.getByTestId("acknowledged").textContent).toBe("true");
});

it("keeps handling application session events", async () => {
  mocks.sessions = [{ topic: "active", acknowledged: false }];
  render(
    <WalletConnectProvider>
      <Probe />
    </WalletConnectProvider>
  );
  await act(async () => undefined);

  mocks.sessions = [{ topic: "active", acknowledged: true }];
  await act(async () => {
    mocks.listeners.get("session_event")?.({ topic: "active" });
  });

  expect(screen.getByTestId("acknowledged").textContent).toBe("true");
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

it("does not open a pairing when the attempt was cancelled during client setup", async () => {
  // getSignClient is async; a cancel landing while it runs must not go on to
  // open a WalletConnect pairing for a dead attempt — that URI would stay live
  // with nothing left to reap it.
  let signClientReady!: (client: unknown) => void;
  mocks.getSignClient.mockReturnValue(
    new Promise((resolve) => {
      signClientReady = resolve;
    })
  );
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
    signClientReady(signClient);
  });

  expect(screen.getByTestId("status").textContent).toBe("idle");
  expect(mocks.connect).not.toHaveBeenCalled();
});

it("reaps the session when the pairing resolves after cancellation", async () => {
  // Cancellation during client.connect itself: the proposal may still be
  // approved by the phone, so the session must be awaited and disconnected
  // rather than leaked.
  let resolveConnect!: (result: {
    uri: string;
    approval: () => Promise<{ topic: string }>;
  }) => void;
  mocks.connect.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveConnect = resolve;
      })
  );
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
  expect(screen.getByTestId("status").textContent).toBe("idle");

  await act(async () => {
    resolveConnect({
      uri: "wc:late@2",
      approval: async () => ({ topic: "orphan-session" })
    });
  });
  expect(screen.getByTestId("status").textContent).toBe("idle");
  expect(mocks.disconnect).toHaveBeenCalledWith(
    expect.objectContaining({ topic: "orphan-session" })
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
