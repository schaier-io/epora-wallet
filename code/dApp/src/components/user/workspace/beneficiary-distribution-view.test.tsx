import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi, beforeEach } from "vitest";
import { BeneficiaryDistributionView } from "./beneficiary-distribution-view";
const mocks = vi.hoisted(() => ({ useModel: vi.fn() }));
vi.mock("./use-beneficiary-distribution", () => ({ useBeneficiaryDistribution: mocks.useModel }));
const UNIT = "cc".repeat(28) + "01";
const ADDRESS = "addr_test1qra89xrexu3vq28g5glatk44s96mysv345rvxsve4x5uh9vvmn2lu5e2ma4eavm9sx3jk5unu0n8vl93k0h3lcqkauwqpcpttu";
function model() {
  return { details: { totalWeight: 3n, payouts: [{ beneficiaryId: 1, weight: 1n, address: ADDRESS, amount: [{ unit: "lovelace", quantity: "2000001" }, { unit: UNIT, quantity: "9007199254740993" }] }] }, error: null, selectedRefs: [], setSelectedRefs: vi.fn(), utxos: [], loading: false, discoveryError: null, hasStreams: false, refreshTime: vi.fn(), refreshFunds: vi.fn(), stopStreams: vi.fn(), settle: vi.fn() };
}
beforeEach(() => mocks.useModel.mockReset());
it("shows fixed exact quantities, full asset identities and full destinations", () => {
  mocks.useModel.mockReturnValue(model());
  render(<BeneficiaryDistributionView />);
  expect(screen.getByText(ADDRESS)).toBeInTheDocument();
  expect(screen.getByText(UNIT)).toBeInTheDocument();
  expect(screen.getByText(/9007199254740993/)).toBeInTheDocument();
  expect(screen.getByText("2.000001 ₳")).toBeInTheDocument();
  expect(screen.getByText("Share: 1 of 3")).toBeInTheDocument();
  expect(screen.getByText(/keep their recovery rights/)).toBeInTheDocument();
  expect(screen.getByText(/existing payout datum/)).toBeInTheDocument();
  expect(screen.getByText(/funds transaction fees/)).toBeInTheDocument();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Select all" })).not.toBeInTheDocument();
});
it("offers stream resolution and refreshing without building or changing payouts", () => {
  const value = { ...model(), details: null, error: "Streams must be settled", hasStreams: true };
  mocks.useModel.mockReturnValue(value);
  render(<BeneficiaryDistributionView />);
  expect(screen.getByRole("status")).toHaveTextContent("Streams must be settled");
  fireEvent.click(screen.getByRole("button", { name: "Stop scheduled payments" }));
  fireEvent.click(screen.getByRole("button", { name: "Settle scheduled payments" }));
  fireEvent.click(screen.getByRole("button", { name: "Check availability again" }));
  fireEvent.click(screen.getByRole("button", { name: "Refresh funds" }));
  for (const action of [value.stopStreams, value.settle, value.refreshTime, value.refreshFunds]) expect(action).toHaveBeenCalledOnce();
});
