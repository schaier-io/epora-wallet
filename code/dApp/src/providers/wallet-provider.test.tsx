import { act, render, screen, waitFor } from "@testing-library/react";
import { Provider as JotaiProvider, useAtomValue } from "jotai";
import { useEffect } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import messages from "@/i18n/messages/en";
import { clearLastConnectedWalletName, persistLastConnectedWalletName } from "@/lib/wallet/storage";

const mocks = vi.hoisted(() => ({
  enable: vi.fn(),
  resolvePaymentKeyHash: vi.fn<(address: string) => string>(),
  resolveWalletPaymentKeyHash: vi.fn<(address: string) => Promise<string>>(),
  getAvailableWallets: vi.fn().mockResolvedValue([
    { id: "lace", name: "Lace", icon: "", version: "1" }
  ])
}));

vi.mock("@meshsdk/core", () => ({
  BrowserWallet: { enable: mocks.enable, getAvailableWallets: mocks.getAvailableWallets },
  resolvePaymentKeyHash: (address: string) => mocks.resolvePaymentKeyHash(address),
  deserializeAddress: (address: string) => {
    if (address === "addr_test1used") return { pubKeyHash: "cc".repeat(28) };
    throw new Error("not a payment address");
  }
}));

vi.mock("@/providers/wallet-payment-key-hash", () => ({
  resolveWalletPaymentKeyHash: (address: string) => mocks.resolveWalletPaymentKeyHash(address)
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
import { resolvedWalletAddressesAtom } from "./wallet-address-book";

type Context = ReturnType<typeof useWalletContext>;
const latest: { current: Context | null } = { current: null };
let probeRenderCount = 0;

function Probe() {
  const context = useWalletContext();
  const addressBook = useAtomValue(resolvedWalletAddressesAtom);
  useEffect(() => {
    probeRenderCount += 1;
    latest.current = context;
  });
  return (
    <>
      <span data-testid="wallet">{context.activeWalletName ?? "none"}</span>
      <span data-testid="address">{context.activeAddress ?? "none"}</span>
      <span data-testid="payment-key">{context.activePaymentKeyHash ?? "none"}</span>
      <span data-testid="error">{context.connectError ?? ""}</span>
      <span data-testid="connecting">{String(context.isConnecting)}</span>
      <span data-testid="book">{JSON.stringify(addressBook)}</span>
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
  probeRenderCount = 0;
  mocks.resolvePaymentKeyHash.mockReset().mockReturnValue("aa".repeat(28));
  mocks.resolveWalletPaymentKeyHash.mockReset().mockResolvedValue("aa".repeat(28));
  mocks.enable.mockReset();
  mocks.getAvailableWallets.mockReset().mockResolvedValue([
    { id: "lace", name: "Lace", icon: "", version: "1" }
  ]);
  clearLastConnectedWalletName();
  window.localStorage.removeItem("epora.walletAddressBook.v1");
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

it("keeps a disconnected wallet disconnected when an earlier connect finishes", async () => {
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
  act(() => latest.current!.disconnectWallet());
  await act(async () => {
    approve(fakeWallet());
    await expect(pending).resolves.toBe(false);
  });

  expect(screen.getByTestId("wallet").textContent).toBe("none");
  expect(screen.getByTestId("connecting").textContent).toBe("false");
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

it("keeps the current wallet when a replacement wallet fails to connect", async () => {
  inject({ lace: {}, eternl: {} });
  mocks.enable
    .mockResolvedValueOnce(fakeWallet())
    .mockRejectedValueOnce(new Error("replacement rejected"));
  renderProvider();

  await act(async () => {
    await expect(latest.current!.connectWallet("lace")).resolves.toBe(true);
  });
  await act(async () => {
    await expect(latest.current!.connectWallet("eternl")).rejects.toThrow("replacement rejected");
  });

  expect(screen.getByTestId("wallet").textContent).toBe("lace");
  expect(screen.getByTestId("address").textContent).toBe("addr_test1used");
  expect(screen.getByTestId("error").textContent).not.toBe("");
});

it("keeps the current wallet when replacement key resolution fails", async () => {
  inject({ lace: {}, eternl: {} });
  mocks.enable.mockResolvedValue(fakeWallet());
  mocks.resolvePaymentKeyHash
    .mockReturnValueOnce("aa".repeat(28))
    .mockImplementationOnce(() => {
      throw new Error("malformed replacement address");
    });
  renderProvider();

  await act(async () => {
    await expect(latest.current!.connectWallet("lace")).resolves.toBe(true);
  });
  await act(async () => {
    await expect(latest.current!.connectWallet("eternl")).rejects.toThrow(
      "malformed replacement address"
    );
  });

  expect(screen.getByTestId("wallet").textContent).toBe("lace");
  expect(screen.getByTestId("address").textContent).toBe("addr_test1used");
  expect(screen.getByTestId("payment-key").textContent).toBe("aa".repeat(28));
});

it("does not rescan installed wallets when only the active wallet changes", async () => {
  inject({ lace: {} });
  mocks.enable.mockResolvedValue(fakeWallet());
  renderProvider();
  await waitFor(() => expect(latest.current?.walletsLoaded).toBe(true));
  mocks.getAvailableWallets.mockClear();

  await act(async () => {
    await latest.current!.connectWallet("lace");
  });

  expect(mocks.getAvailableWallets).not.toHaveBeenCalled();
});

it("keeps the installed wallet list stable when a focus scan finds no changes", async () => {
  inject({ lace: {} });
  mocks.getAvailableWallets.mockImplementation(async () => [
    { id: "lace", name: "Lace", icon: "", version: "1" }
  ]);
  renderProvider();
  await waitFor(() => expect(latest.current?.walletsLoaded).toBe(true));
  const installedWallets = latest.current!.installedWallets;
  const rendersBeforeFocus = probeRenderCount;
  mocks.getAvailableWallets.mockClear();

  await act(async () => {
    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(mocks.getAvailableWallets).toHaveBeenCalledTimes(1));
  });

  expect(latest.current!.installedWallets).toBe(installedWallets);
  expect(probeRenderCount).toBe(rendersBeforeFocus);
});

it("ignores an older installed-wallet scan that finishes after a newer scan", async () => {
  inject({ lace: {}, eternl: {} });
  renderProvider();
  await waitFor(() => expect(latest.current?.walletsLoaded).toBe(true));

  let resolveOlder!: (wallets: Array<{ id: string; name: string; icon: string; version: string }>) => void;
  let resolveNewer!: (wallets: Array<{ id: string; name: string; icon: string; version: string }>) => void;
  mocks.getAvailableWallets
    .mockReturnValueOnce(new Promise((resolve) => (resolveOlder = resolve)))
    .mockReturnValueOnce(new Promise((resolve) => (resolveNewer = resolve)));

  let older!: Promise<void>;
  let newer!: Promise<void>;
  act(() => {
    older = latest.current!.refreshWallets();
  });
  await waitFor(() => expect(mocks.getAvailableWallets).toHaveBeenCalledTimes(2));
  act(() => {
    newer = latest.current!.refreshWallets();
  });
  await waitFor(() => expect(mocks.getAvailableWallets).toHaveBeenCalledTimes(3));

  await act(async () => {
    resolveNewer([{ id: "eternl", name: "Eternl", icon: "", version: "1" }]);
    await newer;
  });
  await act(async () => {
    resolveOlder([{ id: "lace", name: "Lace", icon: "", version: "1" }]);
    await older;
  });

  expect(latest.current!.installedWallets.map((wallet) => wallet.id)).toEqual(["eternl"]);
});

it("ignores an older account scan that finishes after a newer scan", async () => {
  inject({ lace: {} });
  let resolveOlder!: (addresses: string[]) => void;
  let resolveNewer!: (addresses: string[]) => void;
  const wallet = {
    ...fakeWallet(),
    getUsedAddresses: vi
      .fn()
      .mockResolvedValueOnce(["addr_test1used"])
      .mockReturnValueOnce(new Promise<string[]>((resolve) => (resolveOlder = resolve)))
      .mockReturnValueOnce(new Promise<string[]>((resolve) => (resolveNewer = resolve)))
  };
  mocks.enable.mockResolvedValue(wallet);
  renderProvider();
  await act(async () => {
    await latest.current!.connectWallet("lace");
  });

  act(() => window.dispatchEvent(new Event("focus")));
  await waitFor(() => expect(wallet.getUsedAddresses).toHaveBeenCalledTimes(2));
  act(() => window.dispatchEvent(new Event("focus")));
  await waitFor(() => expect(wallet.getUsedAddresses).toHaveBeenCalledTimes(3));

  await act(async () => resolveNewer(["addr_test1new"]));
  await waitFor(() => expect(screen.getByTestId("address")).toHaveTextContent("addr_test1new"));
  await act(async () => resolveOlder(["addr_test1old"]));

  expect(screen.getByTestId("address")).toHaveTextContent("addr_test1new");
});

it("keeps identity cleared when disconnect lands during account hash resolution", async () => {
  inject({ lace: {} });
  const wallet = {
    ...fakeWallet(),
    getUsedAddresses: vi.fn().mockResolvedValue(["addr_test1used"])
  };
  mocks.enable.mockResolvedValue(wallet);
  renderProvider();
  await act(async () => {
    await latest.current!.connectWallet("lace");
  });

  let resolveHash!: (hash: string) => void;
  mocks.resolveWalletPaymentKeyHash.mockReturnValueOnce(
    new Promise<string>((resolve) => {
      resolveHash = resolve;
    })
  );
  act(() => window.dispatchEvent(new Event("focus")));
  await waitFor(() => expect(wallet.getUsedAddresses).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(mocks.resolveWalletPaymentKeyHash).toHaveBeenCalledTimes(1));
  act(() => latest.current!.disconnectWallet());
  await act(async () => resolveHash("aa".repeat(28)));

  expect(screen.getByTestId("wallet")).toHaveTextContent("none");
  expect(screen.getByTestId("address")).toHaveTextContent("none");
});

it("teaches the address book the pair of the wallet it connected", async () => {
  // People entries store the payment key hash; the address the reader recognises
  // has to come from somewhere, and the connect is where the app sees it.
  inject({ lace: {} });
  mocks.enable.mockResolvedValue(fakeWallet());
  renderProvider();
  await act(async () => {
    await latest.current!.connectWallet("lace");
  });

  expect(JSON.parse(screen.getByTestId("book").textContent!)).toEqual({
    ["cc".repeat(28)]: "addr_test1used"
  });
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
