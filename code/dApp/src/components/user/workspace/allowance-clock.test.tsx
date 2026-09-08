import { act, renderHook } from "@testing-library/react";
import { atom, useAtomValue } from "jotai";
import { afterEach, expect, it, vi } from "vitest";
import { createQueryTestWrapper } from "@/test/query-client";
import { createDefaultStateForm } from "@/lib/contracts/state-form";
import { useAllowancePreviewAtom } from "./atoms/workspace-wallet-derivations.atoms";
import { allowanceNowMsAtom } from "./atoms/allowance-clock.atoms";
import { renderNowMsAtom } from "./atoms/workspace-ui.atoms";
import { routeStateAtom } from "./atoms/workspace-route.atoms";
import { activePaymentKeyHashAtom } from "@/providers/wallet.atoms";
import { sttExtraTransfersAtom, sttWalletInputsAtom, sttStateFormAtom } from "./atoms/forms/stt-spend-form.atoms";
import { lockedContractUtxosAtom } from "./atoms/workspace-data.atoms";
import type { UTxO } from "@meshsdk/common";
import type { PrimitiveAtom } from "jotai";

vi.mock("./atoms/workspace-data.atoms", async importOriginal => ({
  ...await importOriginal<object>(), lockedContractUtxosAtom: atom<UTxO[]>([])
}));
afterEach(() => vi.useRealTimers());
it("updates allowance eligibility across reset without changing the fixed streaming quote time", async () => {
  vi.useFakeTimers();
  const now = Date.parse("2026-09-08T12:00:00Z");
  vi.setSystemTime(now);
  const signer = "03c422c5d9b8e4e15bcd660ef7a47aed2234f8118bc6e730c5786aa9";
  const context = createQueryTestWrapper();
  const { store } = context;
  store.set(renderNowMsAtom, now);
  store.set(routeStateAtom, { ...store.get(routeStateAtom), selectedAction: "use-allowance" });
  store.set(activePaymentKeyHashAtom, signer);
  store.set(sttStateFormAtom, { ...createDefaultStateForm(), users: [{
    id: "1", wallets: [signer], perDayAllowance: [{ policyId: "", assetName: "", amount: "3" }],
    remainingAllowance: [], nextAllowanceReset: String(now + 60_000), canRenewProofOfLife: false,
    multiSigPowerMode: "none", multiSigPower: "", isAdmin: false, preset: "limited-withdrawal"
  }] });
  const pool = { input: { txHash: "99".repeat(32), outputIndex: 0 }, output: {
    address: "addr_test1wr8443x29yhdslnat0eywl9vncryc9jsydtl7p3fm9ws6mpq0npqrz7",
    amount: [{ unit: "lovelace", quantity: "9000000" }]
  } };
  store.set(lockedContractUtxosAtom as PrimitiveAtom<UTxO[]>, [pool]);
  store.set(sttWalletInputsAtom, [pool.input]);
  store.set(sttExtraTransfersAtom, [{
    address: "addr_test1qqpuggk9mxuwfc2me4nqaaay0tkjyd8czx9udeesc4ux42gy6nc6cptzv8dusc4d4ae2pt5ld9u4xgdh6vekt6k04huqtu9ru2",
    amount: [{ unit: "lovelace", quantity: "1000000" }], inlineDatum: { mode: "empty-alt-1", customAlternative: "" }
  }]);
  const view = renderHook(() => useAtomValue(useAllowancePreviewAtom), { wrapper: context.wrapper });
  expect(view.result.current.error).toMatch(/enough remaining allowance/);
  await act(() => vi.advanceTimersByTimeAsync(10 * 60_000));
  expect(view.result.current.error).toBeNull();
  expect(store.get(renderNowMsAtom)).toBe(now);
  view.unmount();
  const stoppedAt = store.get(allowanceNowMsAtom);
  await vi.advanceTimersByTimeAsync(5_000);
  expect(store.get(allowanceNowMsAtom)).toBe(stoppedAt);
  context.queryClient.clear();
});
