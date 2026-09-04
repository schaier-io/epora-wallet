import { act, render, screen, waitFor } from "@testing-library/react";
import { Provider as JotaiProvider } from "jotai";
import { useEffect } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import messages from "@/i18n/messages/en";
import { clearLastConnectedWalletName, persistLastConnectedWalletName } from "@/lib/wallet/storage";

const mocks = vi.hoisted(() => ({
  enable: vi.fn(),
  getAvailableWallets: vi.fn().mockResolvedValue([
    { id: "lace", name: "Lace", icon: "", version: "1" }
  ])
}));

vi.mock("@meshsdk/core", () => ({
  BrowserWallet: { enable: mocks.enable, getAvailableWallets: mocks.getAvailableWallets },
  resolvePaymentKeyHash: () => "aa".repeat(28)
}));
// `hasCardanoInjection` mirrors the real module: the provider skips the SDK entirely when
// nothing injected `window.cardano`, so a stub that always answered one way would make every
// test below run a path no browser takes.
vi.mock("@/lib/wallet/injection", () => ({
  waitForCardanoInjection: async () => undefined,
  hasCardanoInjection: () => typeof (window as { cardano?: unknown }).cardano !== "undefined"
}));

// The provider imports `@meshsdk/core` on demand rather than statically, so the first use in
// a worker pays for resolving it. Resolving it once here keeps that cost out of the tests,
// which drive the provider synchronously and would otherwise time out under a loaded suite.
await import("@meshsdk/core");

import { DEMO_WALLET_ID, WalletProvider, useWalletContext } from "./wallet-provider";

type Context = ReturnType<typeof useWalletContext>;
const latest: { current: Context | null } = { current: null };

function Probe() {
  const context = useWalletContext();
  useEffect(() => {
    latest.current = context;
  });
  return (
    <>
      <span data-testid="wallet">{context.activeWalletName ?? "none"}</span>
      <span data-testid="error">{context.connectError ?? ""}</span>
    </>
  );
}

function renderProvider() {
  return render(
    <JotaiProvider>
      <WalletProvider>
        <Probe />
      </WalletProvider>
    </JotaiProvider>
  );
}

function inject(wallets: Record<string, unknown>) {
  (window as { cardano?: Record<string, unknown> }).cardano = wallets;
}

function fakeWallet() {
  return {
    getUsedAddresses: async () => ["addr_test1used"],
    getUnusedAddresses: async () => [],
    getChangeAddress: async () => null,
    getRewardAddresses: async () => [],
    getNetworkId: async () => 0
  };
}

// jsdom's storage here has no working getItem/setItem; the remembered wallet name
// has to survive between the persist call and the provider's read.
const stored = new Map<string, string>();
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key)
  }
});

beforeEach(() => {
  mocks.enable.mockReset();
  clearLastConnectedWalletName();
});

afterEach(() => {
  delete (window as { cardano?: unknown }).cardano;
});

it("reports its own connect messages as written instead of the generic fallback", async () => {
  // "not available in this tab" used to be re-mapped to "Unlock the wallet extension".
  inject({});
  renderProvider();
  await act(async () => {
    await expect(latest.current!.connectWallet("lace")).rejects.toThrow();
  });
  expect(screen.getByTestId("error").textContent).toBe(
    messages.ProvidersWalletProvider.walletNotAvailable.replace("{walletName}", "lace")
  );
});

it("resolves false, not success, when the attempt was cancelled before the wallet answered", async () => {
  // The panel closes on success; a cancelled attempt that later resolved closed it too.
  inject({ lace: {} });
  let approve!: (wallet: ReturnType<typeof fakeWallet>) => void;
  mocks.enable.mockReturnValue(
    new Promise((resolve) => {
      approve = resolve;
    })
  );
  renderProvider();

  let pending!: Promise<boolean>;
  act(() => {
    pending = latest.current!.connectWallet("lace");
  });
  act(() => latest.current!.cancelConnect());
  await act(async () => {
    approve(fakeWallet());
    await expect(pending).resolves.toBe(false);
  });
  expect(screen.getByTestId("wallet").textContent).toBe("none");
  expect(screen.getByTestId("error").textContent).toBe("");
});

it("resolves true once the wallet is connected", async () => {
  inject({ lace: {} });
  mocks.enable.mockResolvedValue(fakeWallet());
  renderProvider();
  await act(async () => {
    await expect(latest.current!.connectWallet("lace")).resolves.toBe(true);
  });
  expect(screen.getByTestId("wallet").textContent).toBe("lace");
});

it("marks the wallet it reconnected on its own until the person connects one themselves", async () => {
  // The toast bridge stays quiet for this mark alone; reading localStorage instead
  // swallowed the first click on the remembered wallet when no restore had run.
  persistLastConnectedWalletName("lace");
  inject({ lace: { isEnabled: async () => true } });
  mocks.enable.mockResolvedValue(fakeWallet());
  renderProvider();

  await waitFor(() => expect(latest.current?.restoredWalletName).toBe("lace"));
  expect(screen.getByTestId("wallet").textContent).toBe("lace");

  await act(async () => {
    await latest.current!.connectWallet("lace");
  });
  expect(latest.current!.restoredWalletName).toBeNull();
});

it("lets a click made during the restore check win over the restore", async () => {
  // The restore starts only after `isEnabled()` answers; a wallet clicked in that
  // window is the person's choice and must not be superseded and silenced.
  persistLastConnectedWalletName("lace");
  let answerIsEnabled: (value: boolean) => void = () => undefined;
  inject({
    lace: { isEnabled: () => new Promise<boolean>((resolve) => (answerIsEnabled = resolve)) },
    eternl: {}
  });
  mocks.enable.mockResolvedValue(fakeWallet());
  renderProvider();
  await waitFor(() => expect(latest.current?.installedWallets.length).toBeGreaterThan(0));

  await act(async () => {
    await expect(latest.current!.connectWallet("eternl")).resolves.toBe(true);
  });
  await act(async () => {
    answerIsEnabled(true);
  });

  expect(screen.getByTestId("wallet").textContent).toBe("eternl");
  expect(latest.current!.restoredWalletName).toBeNull();
});

it("never reaches the SDK when no extension injected window.cardano", async () => {
  // The list this produces is the same one the SDK returned for an empty `window.cardano`,
  // so nothing on screen changes. What changes is that `@meshsdk/core` is not imported, which
  // is what keeps its ~6 MB chunk off routes nobody connects a wallet on.
  mocks.getAvailableWallets.mockClear();
  renderProvider();

  await waitFor(() => expect(latest.current?.walletsLoaded).toBe(true));
  expect(mocks.getAvailableWallets).not.toHaveBeenCalled();
  expect(latest.current!.installedWallets.map((wallet) => wallet.id)).toEqual([DEMO_WALLET_ID]);
});
