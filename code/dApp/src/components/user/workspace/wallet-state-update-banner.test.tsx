import { act, render, screen } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { beforeEach, expect, it } from "vitest";
import { walletStateChecksAtom, pendingWalletStateUpdateAtom } from "./atoms/wallet-state-update.atoms";
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
  const { store } = renderBanner("use", false);
  const region = screen.getByRole("status");
  act(() => store.set(pendingWalletStateUpdateAtom, {
    walletUnit: UNIT, submittedTxHash: TX_HASH, spentRef: { txHash: "cd".repeat(32), outputIndex: 0 }
  }));
  expect(screen.getByRole("status")).toBe(region);
  expect(region).toHaveTextContent("Updating this wallet");
});

it.each(["home", "transactions"] as const)("hides the banner on %s", overviewSection => {
  const { store } = renderBanner(null);
  act(() => store.set(routeStateAtom, { ...store.get(routeStateAtom), overviewSection }));
  expect(screen.getByRole("status")).toBeEmptyDOMElement();
});

it.each(["mint", "lock-funds"] as const)("hides the banner on unblocked action %s", action => {
  renderBanner(action);
  expect(screen.getByRole("status")).toBeEmptyDOMElement();
});

it("shows the transaction on a blocked action without a retry control", () => {
  renderBanner("use");
  expect(screen.getByRole("status")).toHaveTextContent("This action unlocks when it confirms.");
  const link = screen.getByRole("link", { name: `View transaction ${TX_HASH} on Cardanoscan` });
  expect(link.querySelector("span")).toHaveClass("truncate");
  expect(link).toHaveTextContent("9f8b60d1...3aaf01");
  expect(screen.queryByRole("button", { name: "Retry chain check" })).toBeNull();
});

it("shows failed check details on a blocked action without a retry control", () => {
  const { store } = renderBanner("use");
  act(() => store.set(walletStateChecksAtom, { [UNIT]: { txHash: TX_HASH, phase: "unavailable", checkedAt: 1_800_000, lastSuccessfulAt: 900_000 } }));
  expect(screen.getByRole("alert")).toHaveTextContent("Actions that spend this wallet's State wait until the input is verified.");
  expect(screen.getByText(/Last check attempt:/)).toHaveTextContent("UTC");
  expect(screen.getByText(/Last successful chain check:/)).toHaveTextContent("UTC");
  expect(screen.queryByRole("button", { name: "Retry chain check" })).toBeNull();
});
