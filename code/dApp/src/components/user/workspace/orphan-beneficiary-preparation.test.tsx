import "@/test/mock-workspace-queries";
import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DEFAULT_PROTOCOL_PARAMETERS } from "@meshsdk/common";
import { createQueryTestWrapper } from "@/test/query-client";
import { lockedContractUtxosAtom } from "@/test/workspace-query-fixtures";
import { activeAddressAtom } from "@/providers/wallet.atoms";
import type { UserActionKind, UserWorkspaceIntent } from "@/components/user/flow-types";
import { routeStateAtom } from "./atoms/workspace-route.atoms";
import { selectedOrphanInputsAtom } from "./atoms/forms/orphan-inputs.atoms";
import { sttWalletInputsAtom } from "./atoms/forms/stt-spend-form.atoms";
import { consolidateWalletInputsAtom } from "./atoms/forms/consolidate-form.atoms";
import { useBeneficiaryPreparationNavigation } from "./use-beneficiary-preparation-navigation";
import { useBeneficiaryPreparation } from "./use-beneficiary-preparation";

const actions = vi.hoisted(() => ({ openWorkspaceIntent: vi.fn(), refreshLockedContractUtxos: vi.fn(), derive: vi.fn() }));
vi.mock("./workspace-actions-context", () => ({ useWorkspaceActions: () => actions }));
// The real planner has Node coverage; this test checks which outputs reach it from React.
vi.mock("./beneficiary-preparation-model", () => ({ deriveBeneficiaryPreparationPreview: actions.derive }));
vi.mock("@/lib/mesh/server-fetcher", () => ({ ServerFetcher: class { async fetchProtocolParameters() { return DEFAULT_PROTOCOL_PARAMETERS; } } }));
vi.mock("./atoms/workspace-wallet-derivations.atoms", async () => {
  const { atom } = await import("jotai");
  const { createDefaultStateForm } = await import("@/lib/contracts/state-form");
  return {
    lockingContractAtom: atom({ address: "addr_test1qra89xrexu3vq28g5glatk44s96mysv345rvxsve4x5uh9vvmn2lu5e2ma4eavm9sx3jk5unu0n8vl93k0h3lcqkauwqpcpttu" }),
    activeInferredSttStateFormAtom: atom(createDefaultStateForm())
  };
});

const ADDRESS = "addr_test1qra89xrexu3vq28g5glatk44s96mysv345rvxsve4x5uh9vvmn2lu5e2ma4eavm9sx3jk5unu0n8vl93k0h3lcqkauwqpcpttu";
const ORPHAN = { txHash: "ab".repeat(32), outputIndex: 0, address: "old-stake-address", lovelace: "6000000", assets: [] };
const REF = { txHash: ORPHAN.txHash, outputIndex: ORPHAN.outputIndex };

async function fixture() {
  const context = createQueryTestWrapper();
  context.store.set(activeAddressAtom, ADDRESS);
  context.store.set(routeStateAtom, { ...context.store.get(routeStateAtom), selectedWalletUnit: "wallet-a", selectedAction: "use-beneficiary" });
  context.store.set(selectedOrphanInputsAtom, { walletUnit: "wallet-a", signerAddress: ADDRESS, outputs: [ORPHAN] });
  context.store.set(sttWalletInputsAtom, [REF]);
  actions.refreshLockedContractUtxos.mockReset();
  actions.derive.mockReset().mockReturnValue({ plan: null, selectedAmount: [], error: null });
  actions.openWorkspaceIntent.mockImplementation((_intent: UserWorkspaceIntent, action: UserActionKind) => context.store.set(routeStateAtom, { ...context.store.get(routeStateAtom), selectedAction: action }));
  const view = renderHook(() => ({ prepare: useBeneficiaryPreparationNavigation(), model: useBeneficiaryPreparation() }), { wrapper: context.wrapper });
  act(() => view.result.current.prepare());
  await waitFor(() => expect(view.result.current.model.loading).toBe(false));
  return { ...context, ...view };
}

it("carries orphan outputs from recovery into the preparation selector and preview", async () => {
  const view = await fixture();
  expect(view.store.get(consolidateWalletInputsAtom)).toEqual([REF]);
  expect(view.result.current.model.utxos.map(utxo => utxo.input)).toEqual([REF]);
  expect(actions.derive).toHaveBeenLastCalledWith(expect.objectContaining({
    selectedRefs: [REF],
    utxos: [{ input: REF, output: { address: ORPHAN.address, amount: [{ unit: "lovelace", quantity: "6000000" }] } }]
  }));
  expect(view.store.get(lockedContractUtxosAtom)).toEqual([]);
  view.unmount();
  view.queryClient.clear();
});

it("preserves loaded recovery outputs when preparation refreshes canonical funds", async () => {
  const view = await fixture();
  act(() => view.result.current.model.refresh());
  expect(actions.refreshLockedContractUtxos).toHaveBeenCalledWith(ADDRESS, { preserveRecovery: true });
  view.unmount();
  view.queryClient.clear();
});
