import { act, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(() => Promise.resolve()),
  session: { getAll: () => [] as unknown[] },
  on: vi.fn()
}));

vi.mock("@/lib/walletconnect/client", () => ({
  getSignClient: () => Promise.resolve(client),
  isWalletConnectConfigured: () => true,
  buildRequiredNamespaces: () => ({})
}));

const { WalletConnectProvider, useWalletConnect } = await import(
  "@/providers/walletconnect-provider"
);

function renderProvider() {
  const seen: { status: string; session: unknown }[] = [];
  const controller = {
    connect: () => Promise.resolve(),
    disconnect: () => Promise.resolve()
  };

  function Harness() {
    const wc = useWalletConnect();
    controller.connect = wc.connect;
    controller.disconnect = wc.disconnect;
    seen.push({ status: wc.status, session: wc.session });
    return null;
  }

  render(
    <NextIntlClientProvider locale="en" messages={{}}>
      <WalletConnectProvider>
        <Harness />
      </WalletConnectProvider>
    </NextIntlClientProvider>
  );

  return {
    controller,
    latest: () => seen[seen.length - 1]!
  };
}

describe("WalletConnectProvider", () => {
  beforeEach(() => {
    client.connect.mockReset();
    client.disconnect.mockClear();
  });

  it("does not connect after the user cancels the pairing", async () => {
    // `approval()` keeps running after Cancel, because nothing tells the
    // in-flight attempt it was superseded. The panel used to jump to "connected"
    // some time after the user had backed out.
    let approve: (session: unknown) => void = () => {};
    client.connect.mockResolvedValue({
      uri: "wc:pairing",
      approval: () =>
        new Promise((resolve) => {
          approve = resolve;
        })
    });

    const app = renderProvider();
    await act(async () => {
      void app.controller.connect();
    });
    expect(app.latest().status).toBe("awaiting-approval");

    await act(async () => {
      await app.controller.disconnect();
    });
    expect(app.latest().status).toBe("idle");

    await act(async () => {
      approve({ topic: "approved-late" });
      await Promise.resolve();
    });

    expect(app.latest().status).toBe("idle");
    expect(app.latest().session).toBe(null);
    // The phone did approve, so that session is closed rather than left open.
    expect(client.disconnect).toHaveBeenCalledWith(
      expect.objectContaining({ topic: "approved-late" })
    );
  });

  it("connects when the approval is not cancelled", async () => {
    client.connect.mockResolvedValue({
      uri: "wc:pairing",
      approval: () => Promise.resolve({ topic: "approved" })
    });

    const app = renderProvider();
    await act(async () => {
      await app.controller.connect();
    });

    expect(app.latest().status).toBe("connected");
    expect(app.latest().session).toEqual({ topic: "approved" });
  });
});
