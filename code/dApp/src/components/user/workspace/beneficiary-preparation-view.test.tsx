import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { BeneficiaryPreparationView } from "./beneficiary-preparation-view";
const mocks = vi.hoisted(() => ({ model: vi.fn() }));
vi.mock("./use-beneficiary-preparation", () => ({ useBeneficiaryPreparation: mocks.model }));
const UNIT = "cc".repeat(28) + "01";
function fixture(depositShortfall = 0n) {
  return {
    poolAssets: [{ unit: UNIT, quantity: "3" }], setPoolAssets: vi.fn(), selectedRefs: [], setSelectedRefs: vi.fn(), selectedAmount: [{ unit: UNIT, quantity: "9" }], utxos: [], loading: false, discoveryError: null, error: null, walletAddress: "full-wallet-address", refresh: vi.fn(), correctAda: vi.fn(), addFunds: vi.fn(), distribute: vi.fn(), finish: vi.fn(),
    plan: { pool: [{ unit: UNIT, quantity: "3" }], remainder: [{ unit: "lovelace", quantity: "6000000" }, { unit: UNIT, quantity: "6" }], isReady: false, depositShortfall, minimumPoolLovelace: 1500000n, minimumRemainderLovelace: 1400000n, suggestedPoolLovelace: depositShortfall ? null : 1500000n }
  };
}
it("shows immutable remainder and an ADA correction when selected funds suffice", () => {
  const model = fixture(); mocks.model.mockReturnValue(model); render(<BeneficiaryPreparationView />);
  expect(screen.getByText("Funds that stay in the other pool")).toBeInTheDocument();
  expect(screen.getAllByText(UNIT).length).toBeGreaterThanOrEqual(2);
  expect(screen.getByText("full-wallet-address")).toBeInTheDocument();
  expect(screen.getByText(/selected funds contain enough ADA/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Add funds to this wallet" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Set the divisible pool to 1.5 ADA" }));
  expect(model.correctAda).toHaveBeenCalledOnce();
});
it("shows exact additional funding only for a real deposit deficit", () => {
  const model = fixture(1234567n); mocks.model.mockReturnValue(model); render(<BeneficiaryPreparationView />);
  expect(screen.getByText(/add at least 1.234567 ADA/)).toBeInTheDocument();
  expect(screen.queryByText(/selected funds contain enough ADA/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Add funds to this wallet" }));
  expect(model.addFunds).toHaveBeenCalledOnce();
});
it("uses the planner's full ADA allocation to remove an otherwise tiny remainder", () => {
  const model = fixture(); model.plan.suggestedPoolLovelace = 6000000n;
  mocks.model.mockReturnValue(model); render(<BeneficiaryPreparationView />);
  fireEvent.click(screen.getByRole("button", { name: "Set the divisible pool to 6 ADA" }));
  expect(model.correctAda).toHaveBeenCalledOnce();
});
