import { act, render, screen, waitFor } from "@testing-library/react";
import { Provider as JotaiProvider, useAtomValue } from "jotai";
import { useEffect } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type * as CardanoNetwork from "@/lib/cardano-network";
import messages from "@/i18n/messages/en";
import { clearLastConnectedWalletName, persistLastConnectedWalletName } from "@/lib/wallet/storage";

const mocks = vi.hoisted(() => ({
  networkId: 0,
  enable: vi.fn(),
  resolvePaymentKeyHash: vi.fn<(address: string) => string>(),
  resolveWalletPaymentKeyHash: vi.fn<(address: string) => Promise<string>>(),
  getAvailableWallets: vi.fn().mockResolvedValue([
    { id: "lace", name: "Lace", icon: "", version: "1" }
  ])
}));

vi.mock("@/lib/cardano-network", async (importOriginal) => ({
  ...(await importOriginal<typeof CardanoNetwork>()),
  cardanoNetworkId: () => mocks.networkId
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
  waitForCardanoWalletInjection: async () => undefined,
  hasCardanoInjection: () => typeof (window as { cardano?: unknown }).cardano !== "undefined"
}));

// The provider imports `@meshsdk/core` on demand rather than statically, so the first use in
// a worker pays for resolving it. Resolving it once here keeps that cost out of the tests,
// which drive the provider synchronously and would otherwise time out under a loaded suite.
await import("@meshsdk/core");

import { DEMO_WALLET_ID, WalletProvider, useWalletContext } from "./wallet-provider";
import { resolvedWalletAddressesAtom } from "./wallet-address-book";
import { walletReadyAtom } from "./wallet.atoms";

type Context = ReturnType<typeof useWalletContext>;
const latest: { current: Context | null } = { current: null };
let probeRenderCount = 0;

function Probe() {
  const context = useWalletContext();
  const addressBook = useAtomValue(resolvedWalletAddressesAtom);
  const walletReady = useAtomValue(walletReadyAtom);
  useEffect(() => {
    probeRenderCount += 1;
    latest.current = context;
  });
  return (
    <>
      <span data-testid="ready">{String(walletReady)}</span>
      <span data-testid="wallet">{context.activeWalletName ?? "none"}</span>
      <span data-testid="address">{context.activeAddress ?? "none"}</span>
      <span data-testid="payment-key">{context.activePaymentKeyHash ?? "none"}</span>
      <span data-testid="error">{context.connectError ?? ""}</span>
      <span data-testid="connecting">{String(context.isConnecting)}</span>
      <span data-testid="session-loading">{String(context.walletSessionLoading)}</span>
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

function fakeWallet(address = "addr_test1used") {
  return {
    getUsedAddresses: async () => [address],
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
  mocks.networkId = 0;
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

it("settles a stalled restore authorization check and ignores its late answer", async () => {
  vi.useFakeTimers();
  try {
    let authorize!: (value: boolean) => void;
    persistLastConnectedWalletName("lace");
    inject({ lace: { isEnabled: () => new Promise<boolean>((resolve) => { authorize = resolve; }) } });
    renderProvider();
    await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });

    expect(latest.current!.walletSessionLoading).toBe(false);
    expect(latest.current!.connectError).toBeNull();
    expect(mocks.enable).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => { authorize(true); });
    expect(mocks.enable).not.toHaveBeenCalled();
    expect(latest.current!.activeWallet).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

for (const stalledRead of ["getUsedAddresses", "getRewardAddresses", "getNetworkId"] as const) {
  it(`times out connection identity when ${stalledRead} stalls and permits retry`, async () => {
    vi.useFakeTimers();
    try {
      inject({ lace: {} });
      let finishRead!: (value: never) => void;
      mocks.enable.mockResolvedValue({
        ...fakeWallet(),
        [stalledRead]: () => new Promise((resolve) => { finishRead = resolve; })
      });
      renderProvider();
      let error: unknown;
      await act(async () => {
        void latest.current!.connectWallet("lace").catch((failure) => { error = failure; });
      });
      await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });

      expect(latest.current!.isConnecting).toBe(false);
      expect(latest.current!.activeWallet).toBeNull();
      expect(error).toBeInstanceOf(Error);
      expect(latest.current!.connectError).toContain("did not respond");
      expect(vi.getTimerCount()).toBe(0);

      mocks.enable.mockResolvedValue(fakeWallet("addr_test1retry"));
      await act(async () => { await latest.current!.connectWallet("lace"); });
      expect(latest.current!.activeAddress).toBe("addr_test1retry");
      await act(async () => { finishRead((stalledRead === "getNetworkId" ? 0 : ["addr_test1old"]) as never); });
      expect(latest.current!.activeAddress).toBe("addr_test1retry");
      expect(latest.current!.connectError).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
}

it("settles restore loading when an authorized wallet stalls during identity reads", async () => {
  vi.useFakeTimers();
  try {
    persistLastConnectedWalletName("lace");
    inject({ lace: { isEnabled: async () => true } });
    mocks.enable.mockResolvedValue({ ...fakeWallet(), getNetworkId: () => new Promise(() => {}) });
    renderProvider();
    await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });

    expect(latest.current!.walletSessionLoading).toBe(false);
    expect(latest.current!.isConnecting).toBe(false);
    expect(latest.current!.activeWallet).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

it.each([0, 1])("makes the demo ready on configured network %s", async (networkId) => {
  mocks.networkId = networkId;
  renderProvider();
  await act(async () => { await latest.current!.connectWallet(DEMO_WALLET_ID); });

  expect(latest.current!.networkId).toBe(networkId);
  expect(await latest.current!.activeWallet!.getNetworkId()).toBe(networkId);
  expect(screen.getByTestId("ready").textContent).toBe("true");
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

it("keeps replacement identity when an old focus scan resolves in the same batch", async () => {
  inject({ lace: {}, eternl: {} });
  const oldWallet = fakeWallet("addr_test1old");
  let approveReplacement!: (wallet: ReturnType<typeof fakeWallet>) => void;
  mocks.enable
    .mockResolvedValueOnce(oldWallet)
    .mockReturnValueOnce(new Promise((resolve) => (approveReplacement = resolve)));
  mocks.resolvePaymentKeyHash.mockReturnValueOnce("aa".repeat(28));
  renderProvider();
  await act(async () => {
    await latest.current!.connectWallet("lace");
  });

  let resolveOldFocus!: (paymentKeyHash: string) => void;
  mocks.resolveWalletPaymentKeyHash.mockReturnValueOnce(
    new Promise((resolve) => (resolveOldFocus = resolve))
  );
  mocks.resolvePaymentKeyHash.mockImplementationOnce(() => {
    resolveOldFocus("cc".repeat(28));
    return "bb".repeat(28);
  });

  let replacement!: Promise<boolean>;
  act(() => {
    replacement = latest.current!.connectWallet("eternl");
  });
  act(() => window.dispatchEvent(new Event("focus")));
  await waitFor(() => expect(mocks.resolveWalletPaymentKeyHash).toHaveBeenCalledTimes(1));

  await act(async () => {
    approveReplacement(fakeWallet("addr_test1new"));
    await replacement;
    await Promise.resolve();
  });

  expect(screen.getByTestId("wallet").textContent).toBe("eternl");
  expect(screen.getByTestId("address").textContent).toBe("addr_test1new");
  expect(screen.getByTestId("payment-key").textContent).toBe("bb".repeat(28));
});

it("re-enables the wallet when a focus read reports a CIP-30 account change", async () => {
  // CIP-30 APIError AccountChange (-4): the old api object is dead and the dapp must call
  // enable() again. Keeping the old identity left every later wallet call failing.
  inject({ lace: { isEnabled: async () => true } });
  const oldWallet = {
    ...fakeWallet("addr_test1old"),
    getUsedAddresses: vi.fn().mockResolvedValueOnce(["addr_test1old"])
  };
  mocks.enable.mockResolvedValueOnce(oldWallet).mockResolvedValueOnce(fakeWallet("addr_test1new"));
  mocks.resolvePaymentKeyHash.mockReturnValueOnce("aa".repeat(28)).mockReturnValueOnce("bb".repeat(28));
  renderProvider();
  await act(async () => {
    await latest.current!.connectWallet("lace");
  });
  oldWallet.getUsedAddresses.mockRejectedValue({ code: -4, info: "account changed" });

  act(() => window.dispatchEvent(new Event("focus")));

  await waitFor(() => expect(screen.getByTestId("address").textContent).toBe("addr_test1new"));
  expect(mocks.enable).toHaveBeenCalledTimes(2);
  expect(screen.getByTestId("payment-key").textContent).toBe("bb".repeat(28));
});

it("drops the identity without prompting when the changed account has not authorized the site", async () => {
  inject({ lace: { isEnabled: async () => false } });
  const wallet = {
    ...fakeWallet("addr_test1old"),
    getUsedAddresses: vi.fn().mockResolvedValueOnce(["addr_test1old"])
  };
  mocks.enable.mockResolvedValueOnce(wallet);
  renderProvider();
  await act(async () => {
    await latest.current!.connectWallet("lace");
  });
  wallet.getUsedAddresses.mockRejectedValue({ code: -4, info: "account changed" });

  act(() => window.dispatchEvent(new Event("focus")));

  await waitFor(() => expect(screen.getByTestId("address").textContent).toBe("none"));
  expect(mocks.enable).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId("wallet").textContent).toBe("none");
});

it.each([false, true])(
  "keeps a newer manual connection when focus authorization resolves %s",
  async (authorized) => {
    let answerAuthorization!: (authorized: boolean) => void;
    const isEnabled = vi.fn(() => new Promise<boolean>((resolve) => (answerAuthorization = resolve)));
    inject({ lace: { isEnabled }, eternl: {} });
    const oldWallet = {
      ...fakeWallet("addr_test1old"),
      getUsedAddresses: vi.fn().mockResolvedValueOnce(["addr_test1old"])
    };
    let approveReplacement!: (wallet: ReturnType<typeof fakeWallet>) => void;
    mocks.enable.mockResolvedValue(fakeWallet("addr_test1stale")).mockResolvedValueOnce(oldWallet).mockReturnValueOnce(
      new Promise((resolve) => (approveReplacement = resolve))
    );
    renderProvider();
    await act(async () => {
      await latest.current!.connectWallet("lace");
    });
    oldWallet.getUsedAddresses.mockRejectedValue({ code: -4, info: "account changed" });
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(isEnabled).toHaveBeenCalledTimes(1));

    let replacement!: Promise<boolean>;
    act(() => {
      replacement = latest.current!.connectWallet("eternl");
    });
    await waitFor(() => expect(mocks.enable).toHaveBeenCalledTimes(2));
    await act(async () => {
      answerAuthorization(authorized);
      await Promise.resolve();
    });

    expect(mocks.enable).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("connecting").textContent).toBe("true");
    await act(async () => {
      approveReplacement(fakeWallet("addr_test1new"));
      expect(await replacement).toBe(true);
    });
    expect(screen.getByTestId("wallet").textContent).toBe("eternl");
    expect(screen.getByTestId("address").textContent).toBe("addr_test1new");
  }
);

it.each([false, true])("does not cancel an already pending manual connection on focus (%s)", async (authorized) => {
  inject({ lace: { isEnabled: async () => authorized }, eternl: {} });
  const oldWallet = {
    ...fakeWallet("addr_test1old"),
    getUsedAddresses: vi.fn().mockResolvedValueOnce(["addr_test1old"])
  };
  let approveReplacement!: (wallet: ReturnType<typeof fakeWallet>) => void;
  mocks.enable.mockResolvedValue(fakeWallet("addr_test1stale")).mockResolvedValueOnce(oldWallet).mockReturnValueOnce(
    new Promise((resolve) => (approveReplacement = resolve))
  );
  renderProvider();
  await act(async () => { await latest.current!.connectWallet("lace"); });
  oldWallet.getUsedAddresses.mockRejectedValue({ code: -4, info: "account changed" });
  let replacement!: Promise<boolean>;
  act(() => { replacement = latest.current!.connectWallet("eternl"); });
  await waitFor(() => expect(mocks.enable).toHaveBeenCalledTimes(2));
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
    await Promise.resolve();
  });
  await act(async () => { approveReplacement(fakeWallet("addr_test1new")); });
  expect(await replacement).toBe(true);
  expect(screen.getByTestId("wallet").textContent).toBe("eternl");
});

it("keeps the identity when a focus read fails for another reason", async () => {
  inject({ lace: {} });
  const wallet = {
    ...fakeWallet("addr_test1old"),
    getUsedAddresses: vi.fn().mockResolvedValueOnce(["addr_test1old"])
  };
  mocks.enable.mockResolvedValueOnce(wallet);
  renderProvider();
  await act(async () => {
    await latest.current!.connectWallet("lace");
  });
  wallet.getUsedAddresses.mockRejectedValue({ code: -2, info: "internal error" });

  await act(async () => {
    window.dispatchEvent(new Event("focus"));
    await Promise.resolve();
  });

  expect(mocks.enable).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId("address").textContent).toBe("addr_test1old");
  expect(latest.current!.connectError).not.toBeNull();
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

it("keeps identity cleared when a focus scan starts in the disconnect batch", async () => {
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

  await act(async () => {
    latest.current!.disconnectWallet();
    window.dispatchEvent(new Event("focus"));
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(screen.getByTestId("wallet")).toHaveTextContent("none");
  expect(screen.getByTestId("address")).toHaveTextContent("none");
  expect(wallet.getUsedAddresses).toHaveBeenCalledTimes(1);
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
  inject({ lace: { isEnabled: async () => true, enable: mocks.enable } });
  mocks.enable.mockResolvedValue(fakeWallet());
  renderProvider();

  await waitFor(() => expect(latest.current?.restoredWalletName).toBe("lace"));
  expect(screen.getByTestId("wallet").textContent).toBe("lace");

  await act(async () => {
    await latest.current!.connectWallet("lace");
  });
  expect(latest.current!.restoredWalletName).toBeNull();
});

it("keeps the wallet session loading until silent reconnect settles", async () => {
  persistLastConnectedWalletName("lace");
  let answerIsEnabled!: (value: boolean) => void;
  inject({
    lace: {
      isEnabled: () => new Promise<boolean>((resolve) => (answerIsEnabled = resolve)),
      enable: mocks.enable
    }
  });
  mocks.enable.mockResolvedValue(fakeWallet());
  renderProvider();

  await waitFor(() => expect(latest.current?.installedWallets.length).toBeGreaterThan(0));
  expect(screen.getByTestId("wallet").textContent).toBe("none");
  expect(screen.getByTestId("session-loading").textContent).toBe("true");

  await act(async () => answerIsEnabled(true));

  await waitFor(() => expect(screen.getByTestId("wallet").textContent).toBe("lace"));
  expect(screen.getByTestId("session-loading").textContent).toBe("false");
});

it("restores the saved wallet before wallet enumeration settles", async () => {
  persistLastConnectedWalletName("lace");
  inject({ lace: { isEnabled: async () => true, enable: mocks.enable } });
  mocks.enable.mockResolvedValue(fakeWallet());
  let finishEnumeration!: (wallets: Array<{ id: string; name: string; icon: string; version: string }>) => void;
  mocks.getAvailableWallets.mockReturnValue(
    new Promise((resolve) => { finishEnumeration = resolve; })
  );
  renderProvider();

  await waitFor(() => expect(screen.getByTestId("wallet").textContent).toBe("lace"));
  expect(latest.current?.walletsLoaded).toBe(false);

  await act(async () => {
    finishEnumeration([{ id: "lace", name: "Lace", icon: "", version: "1" }]);
  });
});

it("lets a click made during the restore check win over the restore", async () => {
  // The restore starts only after `isEnabled()` answers; a wallet clicked in that
  // window is the person's choice and must not be superseded and silenced.
  persistLastConnectedWalletName("lace");
  let answerIsEnabled: (value: boolean) => void = () => undefined;
  inject({
    lace: {
      isEnabled: () => new Promise<boolean>((resolve) => (answerIsEnabled = resolve)),
      enable: mocks.enable
    },
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

it("restores a saved demo session when no extension wallet is installed", async () => {
  // Without an injection, discovery falls back to offering the demo wallet, so the
  // saved demo session reconnects on its own.
  persistLastConnectedWalletName(DEMO_WALLET_ID);
  renderProvider();

  await waitFor(() => expect(screen.getByTestId("wallet").textContent).toBe(DEMO_WALLET_ID));
  expect(latest.current?.walletsLoaded).toBe(true);
  expect(screen.getByTestId("session-loading").textContent).toBe("false");
});

it("settles a saved demo session when a real extension is installed instead", async () => {
  // Discovery hides the demo wallet once real wallets exist, so the saved demo
  // session can never restore. The session must still settle into a usable state
  // instead of spinning forever, and the person connects an available wallet.
  persistLastConnectedWalletName(DEMO_WALLET_ID);
  inject({ lace: { isEnabled: async () => true, enable: mocks.enable } });
  mocks.enable.mockResolvedValue(fakeWallet());
  renderProvider();

  await waitFor(() => expect(latest.current?.walletsLoaded).toBe(true));
  expect(latest.current!.installedWallets.map((wallet) => wallet.id)).toEqual(["lace"]);
  expect(screen.getByTestId("wallet").textContent).toBe("none");
  // Abandon clears the flag from a microtask after the scan settles, so wait on
  // the flag itself rather than assuming it landed by the time walletsLoaded did.
  await waitFor(() => expect(screen.getByTestId("session-loading").textContent).toBe("false"));

  await act(async () => {
    await expect(latest.current!.connectWallet("lace")).resolves.toBe(true);
  });
  expect(screen.getByTestId("wallet").textContent).toBe("lace");
  expect(screen.getByTestId("session-loading").textContent).toBe("false");
});


it("reports a stalled focus identity read and ignores its late result", async () => {
  vi.useFakeTimers();
  try {
    inject({ lace: {} });
    const wallet = { ...fakeWallet("addr_test1old"), getUsedAddresses: vi.fn().mockResolvedValueOnce(["addr_test1old"]) };
    mocks.enable.mockResolvedValue(wallet);
    renderProvider();
    await act(async () => { await latest.current!.connectWallet("lace"); });
    let finish!: (value: string[]) => void;
    wallet.getUsedAddresses.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });
    expect(latest.current!.connectError).toContain("did not respond");
    expect(latest.current!.activeAddress).toBe("addr_test1old");
    await act(async () => { finish(["addr_test1late"]); });
    expect(latest.current!.activeAddress).toBe("addr_test1old");
  } finally { vi.useRealTimers(); }
});

it.each(["success", "failure followed by recovery"])("preserves a failed replacement connection error through overlapping focus %s", async (focusResult) => {
  inject({ lace: {}, eternl: {} });
  let rejectReplacement!: (error: Error) => void;
  mocks.enable.mockResolvedValueOnce(fakeWallet()).mockReturnValueOnce(new Promise((_resolve, reject) => { rejectReplacement = reject; }));
  renderProvider();
  await act(async () => { await latest.current!.connectWallet("lace"); });
  let finishFocus!: (hash: string) => void;
  let failFocus!: (error: Error) => void;
  mocks.resolveWalletPaymentKeyHash.mockReturnValueOnce(new Promise((resolve, reject) => { finishFocus = resolve; failFocus = reject; }));
  let replacement!: Promise<boolean>;
  act(() => { replacement = latest.current!.connectWallet("eternl"); });
  act(() => window.dispatchEvent(new Event("focus")));
  await waitFor(() => expect(finishFocus).toBeTypeOf("function"));
  await act(async () => {
    const failed = expect(replacement).rejects.toThrow("replacement rejected");
    rejectReplacement(new Error("replacement rejected"));
    await failed;
  });
  const error = screen.getByTestId("error").textContent;
  expect(error).not.toBe("");
  await act(async () => {
    if (focusResult === "success") finishFocus("aa".repeat(28));
    else failFocus(new Error("focus identity read failed"));
  });
  expect(screen.getByTestId("error").textContent).toBe(error);
  if (focusResult !== "success") {
    await act(async () => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(mocks.resolveWalletPaymentKeyHash).toHaveBeenCalledTimes(2));
  }
  expect(screen.getByTestId("wallet").textContent).toBe("lace");
  expect(screen.getByTestId("error").textContent).toBe(error);
});

it("clears its own focus read error after a successful focus sync", async () => {
  inject({ lace: {} });
  const wallet = fakeWallet();
  mocks.enable.mockResolvedValue(wallet);
  renderProvider();
  await act(async () => { await latest.current!.connectWallet("lace"); });
  const read = vi.spyOn(wallet, "getUsedAddresses").mockRejectedValueOnce(new Error("focus read failed"));
  await act(async () => window.dispatchEvent(new Event("focus")));
  await waitFor(() => expect(screen.getByTestId("error").textContent).not.toBe(""));
  read.mockResolvedValue(["addr_test1used"]);
  await act(async () => window.dispatchEvent(new Event("focus")));
  await waitFor(() => expect(screen.getByTestId("error").textContent).toBe(""));
});

it("clears an old focus error when the pending replacement connection succeeds", async () => {
  inject({ lace: {}, eternl: {} });
  const oldWallet = fakeWallet();
  let approveReplacement!: (wallet: ReturnType<typeof fakeWallet>) => void;
  mocks.enable.mockResolvedValueOnce(oldWallet).mockReturnValueOnce(new Promise(resolve => { approveReplacement = resolve; }));
  renderProvider();
  await act(async () => { await latest.current!.connectWallet("lace"); });
  let replacement!: Promise<boolean>;
  act(() => { replacement = latest.current!.connectWallet("eternl"); });
  vi.spyOn(oldWallet, "getUsedAddresses").mockRejectedValueOnce(new Error("old focus read failed"));
  await act(async () => window.dispatchEvent(new Event("focus")));
  await waitFor(() => expect(screen.getByTestId("error").textContent).not.toBe(""));
  await act(async () => {
    approveReplacement(fakeWallet("addr_test1new"));
    await expect(replacement).resolves.toBe(true);
  });
  expect(screen.getByTestId("wallet").textContent).toBe("eternl");
  expect(screen.getByTestId("address").textContent).toBe("addr_test1new");
  expect(screen.getByTestId("error").textContent).toBe("");
});

it.each([false, true])("ignores stale account authorization after reconnecting the same wallet (%s)", async (authorized) => {
  let answerAuthorization!: (value: boolean) => void;
  const isEnabled = vi.fn(() => new Promise<boolean>(resolve => { answerAuthorization = resolve; }));
  inject({ lace: { isEnabled } });
  const oldWallet = {
    ...fakeWallet("addr_test1old"),
    getUsedAddresses: vi.fn().mockResolvedValueOnce(["addr_test1old"])
  };
  const newWallet = fakeWallet("addr_test1new");
  mocks.enable.mockResolvedValueOnce(oldWallet).mockResolvedValueOnce(newWallet).mockResolvedValue(fakeWallet("addr_test1unexpected"));
  renderProvider();
  await act(async () => { await latest.current!.connectWallet("lace"); });
  oldWallet.getUsedAddresses.mockRejectedValue({ code: -4, info: "account changed" });
  act(() => window.dispatchEvent(new Event("focus")));
  await waitFor(() => expect(isEnabled).toHaveBeenCalledTimes(1));
  await act(async () => { await latest.current!.connectWallet("lace"); });

  await act(async () => { answerAuthorization(authorized); });

  expect(latest.current!.activeWallet).toBe(newWallet);
  expect(screen.getByTestId("address").textContent).toBe("addr_test1new");
  expect(mocks.enable).toHaveBeenCalledTimes(2);
});

it("does not supersede a pending manual connection with stale account authorization", async () => {
  let answerAuthorization!: (value: boolean) => void;
  const isEnabled = vi.fn(() => new Promise<boolean>(resolve => { answerAuthorization = resolve; }));
  inject({ lace: { isEnabled } });
  const oldWallet = {
    ...fakeWallet("addr_test1old"),
    getUsedAddresses: vi.fn().mockResolvedValueOnce(["addr_test1old"])
  };
  let finishConnect!: (wallet: ReturnType<typeof fakeWallet>) => void;
  mocks.enable.mockResolvedValueOnce(oldWallet).mockReturnValueOnce(new Promise(resolve => { finishConnect = resolve; })).mockResolvedValue(fakeWallet("addr_test1unexpected"));
  renderProvider();
  await act(async () => { await latest.current!.connectWallet("lace"); });
  oldWallet.getUsedAddresses.mockRejectedValue({ code: -4, info: "account changed" });
  act(() => window.dispatchEvent(new Event("focus")));
  await waitFor(() => expect(isEnabled).toHaveBeenCalledTimes(1));
  let connection!: Promise<boolean>;
  act(() => { connection = latest.current!.connectWallet("lace"); });
  await waitFor(() => expect(mocks.enable).toHaveBeenCalledTimes(2));

  await act(async () => { answerAuthorization(true); });
  const newWallet = fakeWallet("addr_test1new");
  await act(async () => { finishConnect(newWallet); await connection; });

  expect(latest.current!.activeWallet).toBe(newWallet);
  expect(mocks.enable).toHaveBeenCalledTimes(2);
});
