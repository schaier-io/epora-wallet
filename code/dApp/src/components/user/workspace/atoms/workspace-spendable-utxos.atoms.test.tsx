import "@/test/mock-workspace-queries";
import { createStore } from "jotai";
import { expect, it } from "vitest";
import { activeAddressAtom } from "@/providers/wallet.atoms";
import { lockedContractUtxosAtom } from "@/test/workspace-query-fixtures";
import { selectedOrphanInputsAtom } from "./forms/orphan-inputs.atoms";
import { sttWalletInputsAtom } from "./forms/stt-spend-form.atoms";
import { routeStateAtom } from "./workspace-route.atoms";
import { spendableWalletUtxosAtom } from "./workspace-spendable-utxos.atoms";
import { recoveryCapacitySignatureAtom } from "./recovery-capacity.atoms";
import { resetAllFlowAtom } from "./transaction-flow.atoms";

function setup() {
  const store = createStore();
  store.set(activeAddressAtom, "signer-a");
  store.set(routeStateAtom, { ...store.get(routeStateAtom), selectedWalletUnit: "wallet-a", selectedAction: "use-beneficiary" });
  store.set(lockedContractUtxosAtom, [{ input: { txHash: "canonical", outputIndex: 0 }, output: { address: "canonical", amount: [{ unit: "lovelace", quantity: "3000000" }] } }]);
  store.set(selectedOrphanInputsAtom, { walletUnit: "wallet-a", signerAddress: "signer-a", outputs: [{ txHash: "orphan", outputIndex: 1, address: "other-stake", lovelace: "5000000", assets: [] }] });
  return store;
}
it("includes selected orphan values in recovery without changing the canonical balance", () => {
  const store = setup();
  expect(store.get(spendableWalletUtxosAtom)).toHaveLength(2);
  expect(store.get(lockedContractUtxosAtom)).toHaveLength(1);
  store.set(sttWalletInputsAtom, [{ txHash: "orphan", outputIndex: 1 }]);
  const signature = store.get(recoveryCapacitySignatureAtom);
  store.set(selectedOrphanInputsAtom, { ...store.get(selectedOrphanInputsAtom)!, outputs: [] });
  expect(store.get(recoveryCapacitySignatureAtom)).not.toBe(signature);
});
it("limits orphan drafts to the selected wallet, signer, and recovery action", () => {
  for (const change of [
    (store: ReturnType<typeof createStore>) => store.set(activeAddressAtom, "signer-b"),
    (store: ReturnType<typeof createStore>) => store.set(routeStateAtom, { ...store.get(routeStateAtom), selectedWalletUnit: "wallet-b" }),
    (store: ReturnType<typeof createStore>) => store.set(routeStateAtom, { ...store.get(routeStateAtom), selectedAction: "use" })
  ]) {
    const store = setup();
    change(store);
    expect(store.get(spendableWalletUtxosAtom)).toEqual(store.get(lockedContractUtxosAtom));
  }
});
it("clears the selected orphan draft on workspace reset", () => {
  const store = setup();
  store.set(resetAllFlowAtom);
  expect(store.get(selectedOrphanInputsAtom)).toBeNull();
});
