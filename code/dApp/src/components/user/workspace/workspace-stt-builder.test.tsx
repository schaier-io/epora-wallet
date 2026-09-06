import { createStore } from "jotai";
import { beforeEach, expect, it, vi } from "vitest";
import { validateBeneficiaryDistributionInput } from "@/lib/mesh/transactions/beneficiary-distribution";
import { createWorkspaceSttBuilder } from "./workspace-stt-builder";
import type { WorkspaceTransactionsCtx } from "./workspace-transactions-types";
import { beneficiaryStreamStopIdAtom, sttAuthorityPathAtom, sttExtraTransfersAtom, sttInputTxHashAtom, sttInputOutputIndexAtom, sttWalletInputsAtom } from "./atoms/forms/stt-spend-form.atoms";
import type { SttSpendFormInput } from "@/lib/types/contracts";
import { createDefaultStateForm } from "@/lib/contracts/state-form";
const mocks = vi.hoisted(() => ({ build: vi.fn() }));
vi.mock("@/lib/mesh/transactions", () => ({
  buildSttSpendTx: mocks.build,
  getValidityWindow: () => ({ earliestTimeMs: 1750000000000, latestTimeMs: 1750000240000 })
}));
beforeEach(() => mocks.build.mockReset().mockResolvedValue({ txHex: "abc" }));
function fixture() {
  const store = createStore();
  store.set(sttInputTxHashAtom, "a".repeat(64));
  store.set(sttInputOutputIndexAtom, "2");
  const ctx = {
    jotaiStore: store, activeWallet: {}, activePaymentKeyHash: "11".repeat(28),
    activeInferredSttStateForm: createDefaultStateForm(), lockingContract: { address: "addr_test1wallet" },
    proposalCaptureRef: { current: null },
    withBuildGuard: (_mode: string, run: () => Promise<unknown>) => run()
  } as unknown as WorkspaceTransactionsCtx;
  const capture = vi.fn();
  const requiredSigners = vi.fn().mockReturnValue(["22".repeat(28)]);
  return { store, ctx, capture, requiredSigners };
}
it("builds a single stop with no stale withdrawal data or operator override", async () => {
  const { store, ctx, capture, requiredSigners } = fixture();
  store.set(beneficiaryStreamStopIdAtom, "18446744073709551615");
  store.set(sttAuthorityPathAtom, "multisig");
  store.set(sttWalletInputsAtom, [{ txHash: "b".repeat(64), outputIndex: 0 }]);
  store.set(sttExtraTransfersAtom, [{ address: "stale", amount: [{ unit: "lovelace", quantity: "42" }], inlineDatum: { mode: "none", customAlternative: "" } }]);
  await createWorkspaceSttBuilder(ctx, capture, requiredSigners).buildSttTx("stop-beneficiary-stream", "admin");
  expect(mocks.build).toHaveBeenCalledWith(ctx.activeWallet, expect.any(Object), "stop-beneficiary-stream", {
    sttInputTxHash: "a".repeat(64), sttInputOutputIndex: 2,
    beneficiaryStreamStopId: 18446744073709551615n,
    beneficiarySignerKeyHash: "11".repeat(28), authorityPath: "beneficiary"
  });
  expect(capture).not.toHaveBeenCalled();
  expect(requiredSigners).not.toHaveBeenCalled();
});
it("builds exact distribution with no stale withdrawal data or operator override", async () => {
  const { store, ctx, capture, requiredSigners } = fixture();
  store.set(beneficiaryStreamStopIdAtom, "18446744073709551615");
  store.set(sttAuthorityPathAtom, "multisig");
  store.set(sttWalletInputsAtom, [{ txHash: "b".repeat(64), outputIndex: 0 }]);
  store.set(sttExtraTransfersAtom, [{ address: "stale", amount: [{ unit: "lovelace", quantity: "42" }], inlineDatum: { mode: "none", customAlternative: "" } }]);
  await createWorkspaceSttBuilder(ctx, capture, requiredSigners).buildSttTx("distribute-beneficiaries", "admin");
  expect(mocks.build).toHaveBeenCalledWith(ctx.activeWallet, expect.any(Object), "distribute-beneficiaries", {
    sttInputTxHash: "a".repeat(64), sttInputOutputIndex: 2,
    walletInputs: [{ txHash: "b".repeat(64), outputIndex: 0 }],
    beneficiarySignerKeyHash: "11".repeat(28)
  });
  expect(() => validateBeneficiaryDistributionInput(mocks.build.mock.calls[0]![3] as SttSpendFormInput)).not.toThrow();
  expect(capture).not.toHaveBeenCalled();
  expect(requiredSigners).not.toHaveBeenCalled();
});
it("keeps the extracted operator builder's approval capture and signer path", async () => {
  const { ctx, capture, requiredSigners } = fixture();
  await createWorkspaceSttBuilder(ctx, capture, requiredSigners).buildSttTx("use", "multisig");
  expect(capture).toHaveBeenCalledWith("use", "multisig", expect.objectContaining({ builder: "stt-spend", mode: "use" }));
  expect(mocks.build).toHaveBeenCalledWith(ctx.activeWallet, expect.any(Object), "use", expect.objectContaining({ authorityPath: "multisig", requiredSignerKeyHashes: ["22".repeat(28)] }));
});
