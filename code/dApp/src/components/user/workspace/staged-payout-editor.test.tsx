import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TransferFormState } from "./types";
import { DEFAULT_OPTIONAL_CONSTR_PRESET } from "./constants";
import { StagedPayoutEditor } from "./staged-payout-editor";

const TOKEN = "ab".repeat(28) + "01";
const value = { inlineDatum: DEFAULT_OPTIONAL_CONSTR_PRESET, address: "addr_test1original", amount: [{ unit: "lovelace", quantity: "1000000" }, { unit: TOKEN, quantity: "7" }] };
describe("editing staged payouts in place", () => {
  it("keeps manual amounts and removes unsafe Max when allowance or another payout applies", () => {
    render(<StagedPayoutEditor value={value} onChange={vi.fn()} availableAssets={value.amount} allowMax={false} />);
    expect(screen.queryByRole("button", { name: "Max" })).toBeNull();
    expect(screen.getByDisplayValue("7")).toBeInTheDocument();
    expect(screen.getByText(/Max is unavailable for allowance spending or while another payout draft exists/)).toBeInTheDocument();
  });
  it("makes the current reservation available to its own Max control", () => {
    const onChange = vi.fn();
    render(<StagedPayoutEditor value={value} onChange={onChange} availableAssets={[]} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Max" })[1]);
    expect((onChange.mock.lastCall![0] as TransferFormState).amount[1].quantity).toBe("7");
  });
  it("preserves every asset when the recipient changes", () => {
    const onChange = vi.fn();
    render(<StagedPayoutEditor value={value} onChange={onChange} availableAssets={value.amount} />);
    fireEvent.change(screen.getByLabelText("Payout recipient address"), { target: { value: "addr_test1new" } });
    expect(onChange).toHaveBeenCalledWith({ ...value, address: "addr_test1new" });
  });
  it("preserves the recipient and other assets when one amount changes", () => {
    const onChange = vi.fn();
    render(<StagedPayoutEditor value={value} onChange={onChange} availableAssets={value.amount} />);
    fireEvent.change(screen.getByDisplayValue("7"), { target: { value: "9" } });
    expect(onChange).toHaveBeenCalledWith({ ...value, amount: [{ unit: "lovelace", quantity: "1000000" }, { unit: TOKEN, quantity: "9" }] });
  });
});


it("includes a valid pasted quantity in that payout's own Max", () => {
  const onChange = vi.fn();
  const pasted = { ...value, amount: [{ unit: TOKEN, quantity: " 7 " }] };
  render(<StagedPayoutEditor value={pasted} onChange={onChange} availableAssets={[]} />);
  fireEvent.click(screen.getByRole("button", { name: "Max" }));
  expect((onChange.mock.lastCall![0] as TransferFormState).amount[0].quantity).toBe("7");
});
