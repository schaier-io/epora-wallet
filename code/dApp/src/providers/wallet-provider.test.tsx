import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The identity atoms have several writers: the connect path, the focus refresh, and
 * disconnect. These tests hold a read open with a deferred promise so a second writer can
 * finish first, then release the older read and check that it did not overwrite the newer
 * answer. Both cases below were real: the wallet object alone could not tell a live result
 * from a stale one, because two reads of the SAME wallet can be in flight at once and
 * `disconnectWallet` clears the atoms before the ref that tracks the wallet catches up.
 */

type Deferred = {
  promise: Promise<string[]>;
  resolve: (addresses: string[]) => void;
};

function deferred(): Deferred {
  let resolve!: (addresses: string[]) => void;
  const promise = new Promise<string[]>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

const extension = vi.hoisted(() => ({
  /** One deferred per `getUsedAddresses` call, in call order. */
  reads: [] as Deferred[],
  wallet: null as Record<string, unknown> | null
}));

vi.mock("@meshsdk/core", () => ({
  BrowserWallet: {
    getAvailableWallets: vi.fn(async () => []),
    enable: vi.fn(async () => extension.wallet)
  },
  // The tests care about which address won, so the hash just has to be derived from it.
  resolvePaymentKeyHash: (address: string) => `keyhash-of-${address}`
}));
vi.mock("@/lib/wallet/storage", () => ({
  readLastConnectedWalletName: () => null,
  persistLastConnectedWalletName: vi.fn(),
  clearLastConnectedWalletName: vi.fn()
}));
vi.mock("@/lib/wallet/injection", () => ({
  waitForCardanoInjection: async () => undefined
}));

import { WalletProvider, useWalletContext } from "./wallet-provider";

function Probe() {
  const { activePaymentKeyHash, connectWallet, disconnectWallet } = useWalletContext();
  return (
    <div>
      <span data-testid="key-hash">{activePaymentKeyHash ?? "none"}</span>
      <button type="button" onClick={() => void connectWallet("eternl")}>
        connect
      </button>
      {/*
        Disconnect from a microtask, not straight from the click. React flushes passive
        effects synchronously at the end of a discrete event, so a click-driven disconnect
        has `activeWalletRef` already cleared by the time any read resolves. Called from
        async code (a network callback, an effect) the effect defers to a macrotask and the
        stale-ref window is real. That is the case under test.
      */}
      <button type="button" onClick={() => void Promise.resolve().then(disconnectWallet)}>
        disconnect
      </button>
    </div>
  );
}

const keyHash = () => screen.getByTestId("key-hash").textContent;

/** Releases the n-th `getUsedAddresses` call (0-based) with `address`. */
async function answerRead(index: number, address: string) {
  await act(async () => {
    extension.reads[index]?.resolve([address]);
    await Promise.resolve();
  });
}

async function connect() {
  await act(async () => {
    screen.getByRole("button", { name: "connect" }).click();
    await Promise.resolve();
  });
}

async function focusWindow() {
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
    await Promise.resolve();
  });
}

beforeEach(() => {
  extension.reads = [];
  // `connectWallet` refuses to enable a wallet the page cannot see injected.
  (window as unknown as { cardano: Record<string, unknown> }).cardano = { eternl: {} };
  extension.wallet = {
    getUsedAddresses: vi.fn(() => {
      const read = deferred();
      extension.reads.push(read);
      return read.promise;
    }),
    getUnusedAddresses: vi.fn(async () => []),
    getChangeAddress: vi.fn(async () => null),
    getRewardAddresses: vi.fn(async () => []),
    getNetworkId: vi.fn(async () => 0)
  };
});

describe("the connected identity under concurrent reads", () => {
  /**
   * Two focus events leave two reads of the same wallet in flight. The extension may answer
   * them in either order, so the guard cannot be "is this still the connected wallet": it is,
   * for both of them. Without a per-read claim the older account's key hash lands last and
   * the whole app believes the user switched back.
   */
  it("keeps the newer answer when an older read finishes last", async () => {
    render(
      <WalletProvider>
        <Probe />
      </WalletProvider>
    );

    await connect();
    await answerRead(0, "addr_connected");
    await waitFor(() => expect(keyHash()).toBe("keyhash-of-addr_connected"));

    // Two refreshes in flight at once, answered out of order.
    await focusWindow();
    await focusWindow();
    expect(extension.reads).toHaveLength(3);

    await answerRead(2, "addr_new_account");
    await waitFor(() => expect(keyHash()).toBe("keyhash-of-addr_new_account"));

    await answerRead(1, "addr_old_account");
    expect(keyHash()).toBe("keyhash-of-addr_new_account");
  });

  /**
   * `disconnectWallet` clears the atoms synchronously, while the ref tracking the wallet
   * updates only in an effect. A read resolving in that window used to restore the identity of
   * a wallet no longer connected. That is not merely stale: `/user/proposals` compares the
   * connected key with the signed-in one, so a restored key hash re-opens the previous
   * account's approval list.
   */
  it("stays disconnected when a read finishes after disconnect", async () => {
    render(
      <WalletProvider>
        <Probe />
      </WalletProvider>
    );

    await connect();
    await answerRead(0, "addr_connected");
    await waitFor(() => expect(keyHash()).toBe("keyhash-of-addr_connected"));

    await focusWindow();
    expect(extension.reads).toHaveLength(2);

    // Deliberately outside `act`: `act` flushes the effect that clears `activeWalletRef` at
    // every await boundary, and that effect closing the window IS the bug under test.
    screen.getByRole("button", { name: "disconnect" }).click();
    await Promise.resolve();
    extension.reads[1]?.resolve(["addr_connected"]);
    // `readWalletIdentity` awaits a Promise.all, so the write is several microtasks deep.
    for (let tick = 0; tick < 8; tick += 1) {
      await Promise.resolve();
    }
    await act(async () => {
      await Promise.resolve();
    });

    expect(keyHash()).toBe("none");
  });
});
