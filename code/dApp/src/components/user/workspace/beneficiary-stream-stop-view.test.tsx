import type * as PayoutAddress from "@/lib/contracts/payout-address";
import { fireEvent, render, screen } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { expect, it, vi } from "vitest";
import { activePaymentKeyHashAtom } from "@/providers/wallet.atoms";
import { createDefaultStateForm, createDefaultBeneficiaryFormState } from "@/lib/contracts/state-form";
import { sttStateFormAtom, beneficiaryStreamStopIdAtom } from "./atoms/forms/stt-spend-form.atoms";
import { renderNowMsAtom } from "./atoms/workspace-ui.atoms";
import { routeStateAtom } from "./atoms/workspace-route.atoms";
import { parseWorkspaceRouteState } from "@/components/user/workspace-controller";
import { WorkspaceActionsProvider } from "./workspace-actions-context";
import type { PermissionWalletWorkspaceState } from "./use-permission-wallet-workspace-state";
import { BeneficiaryStreamStopView } from "./beneficiary-stream-stop-view";
// jsdom's Uint8Array realm prevents Mesh's bech32 encoder from reading Node
// Buffers. Only address display is stubbed here. Node model tests use the real codec.
vi.mock("@/lib/contracts/payout-address", async (importOriginal) => ({
  ...await importOriginal<typeof PayoutAddress>(),
  decodePayoutAddressFromData: () => "addr_test1qra89xrexu3vq28g5glatk44s96mysv345rvxsve4x5uh9vvmn2lu5e2ma4eavm9sx3jk5unu0n8vl93k0h3lcqkauwqpcpttu"
}));
const NOW = 1_750_000_000_000;
const KEY = "11".repeat(28);
const ADDRESS = "addr_test1qra89xrexu3vq28g5glatk44s96mysv345rvxsve4x5uh9vvmn2lu5e2ma4eavm9sx3jk5unu0n8vl93k0h3lcqkauwqpcpttu";
function renderStops(locked = false) {
  const store = createStore();
  const form = createDefaultStateForm();
  form.proofOfLifeUnlockTimeMode = "some";
  form.proofOfLifeUnlockTime = locked ? String(NOW + 86400000) : "1000";
  form.proofOfLifeIncrementMode = "some";
  form.proofOfLifeIncrement = "1000";
  form.beneficiaries = [{ ...createDefaultBeneficiaryFormState("1"), wallets: [KEY], payoutAddress: ADDRESS }];
  form.streamingPayments = ["7", "8"].map((id) => ({ id, payoutAddress: ADDRESS, policyId: "", assetName: "", amountPerDay: "86400", paidOutAmount: "0", startDate: String(NOW - 86400000), endDate: String(NOW + 86400000) }));
  store.set(sttStateFormAtom, form);
  store.set(activePaymentKeyHashAtom, KEY);
  store.set(renderNowMsAtom, NOW);
  store.set(routeStateAtom, parseWorkspaceRouteState(new URLSearchParams("mode=existing-wallet&action=stop-beneficiary-stream")));
  const select = vi.fn((id: string) => store.set(beneficiaryStreamStopIdAtom, id));
  const navigate = vi.fn();
  render(<Provider store={store}><WorkspaceActionsProvider value={{ handleBeneficiaryStreamStopSelect: select, openWorkspaceIntent: navigate } as unknown as PermissionWalletWorkspaceState}><BeneficiaryStreamStopView /></WorkspaceActionsProvider></Provider>);
  return { store, select, navigate };
}
it("shows retained debt and routes exactly the selected stream without editable payment fields", () => {
  const { select, navigate } = renderStops();
  expect(screen.getAllByText(/Estimated amount owed after stopping/)).toHaveLength(2);
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  const buttons = screen.getAllByRole("button", { name: "Select payment to stop" });
  fireEvent.click(buttons[1]!);
  expect(select).toHaveBeenCalledWith("8");
  expect(screen.getByRole("button", { name: "Selected for stopping" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "Settle scheduled payments" }));
  expect(navigate).toHaveBeenCalledWith("pay-streaming-payments", "payout-streaming-payment", "streaming-payments-pay-due");
});
it("shows the unlock reason and disables every stop for a locked beneficiary", () => {
  renderStops(true);
  expect(screen.getAllByText(/requires an unlocked beneficiary/)).toHaveLength(2);
  for (const button of screen.getAllByRole("button", { name: "Select payment to stop" })) expect(button).toBeDisabled();
});
it("refreshes the clock so a cooldown or unlock can be checked again", () => {
  const { store } = renderStops();
  const clock = vi.spyOn(Date, "now").mockReturnValue(NOW + 3600000);
  fireEvent.click(screen.getByRole("button", { name: "Check availability again" }));
  expect(store.get(renderNowMsAtom)).toBe(NOW + 3600000);
  clock.mockRestore();
});
