import { act, render, screen } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { beforeEach, expect, it } from "vitest";
import { pendingWalletStateUpdateAtom } from "./atoms/wallet-state-update.atoms";
import { routeStateAtom } from "./atoms/workspace-route.atoms";
import type { UserActionKind } from "@/components/user/flow-types";
import { WalletStateUpdateBanner } from "./wallet-state-update-banner";

const UNIT = `${"ab".repeat(28)}01`;
const TX_HASH = "9f8b60d1" + "00".repeat(25) + "3aaf01";

// jsdom's localStorage in this suite lacks working methods; the pending record persists
// through it, so give each test a fresh Map-backed store.
beforeEach(() => {
  const data = new Map<string, string>();
  Object.defineProperty(window, "localStorage", { configurable: true, value: {
    get length() { return data.size; },
    key: (index: number) => [...data.keys()][index] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
    clear: () => data.clear()
  } });
});

function renderBanner(selectedAction: UserActionKind | null, pending = true) {
  const store = createStore();
  store.set(routeStateAtom, { ...store.get(routeStateAtom), selectedWalletUnit: UNIT, selectedAction });
  if (pending) store.set(pendingWalletStateUpdateAtom, {
    walletUnit: UNIT, submittedTxHash: TX_HASH, spentRef: { txHash: "cd".repeat(32), outputIndex: 0 }
  });
  return { store, ...render(<Provider store={store}><WalletStateUpdateBanner /></Provider>) };
}

it("renders nothing while no wallet state update is pending", () => {
  renderBanner(null, false);
  expect(screen.getByRole("status")).toBeEmptyDOMElement();
});

// The live region must exist before its text does, or a screen reader may not announce it.
it("fills the same live region when an update starts", () => {
  const { store } = renderBanner(null, false);
  const region = screen.getByRole("status");
  act(() => store.set(pendingWalletStateUpdateAtom, {
    walletUnit: UNIT, submittedTxHash: TX_HASH, spentRef: { txHash: "cd".repeat(32), outputIndex: 0 }
  }));
  expect(screen.getByRole("status")).toBe(region);
  expect(region).toHaveTextContent("Updating this wallet");
});

it("names what pauses and what still works on the dashboard, with the transaction on one line", () => {
  renderBanner(null);
  const status = screen.getByRole("status");
  expect(status).toHaveTextContent("Updating this wallet");
  expect(status).toHaveTextContent("Sending, settings and payouts unlock when it confirms. You can still add funds.");
  const link = screen.getByRole("link", { name: `View transaction ${TX_HASH} on Cardanoscan` });
  expect(link.querySelector("span")).toHaveClass("truncate");
  expect(link).toHaveTextContent("9f8b60d1...3aaf01");
});

it("says the open action waits when it spends the STT, but not on add funds", () => {
  const { unmount } = renderBanner("use");
  expect(screen.getByRole("status")).toHaveTextContent("This action unlocks when it confirms.");
  unmount();
  renderBanner("lock-funds");
  expect(screen.getByRole("status")).toHaveTextContent("Sending, settings and payouts unlock when it confirms.");
});
