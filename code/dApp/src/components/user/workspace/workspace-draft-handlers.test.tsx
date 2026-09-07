import { act, renderHook } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { createDefaultStateForm, stateFormToDatum } from "@/lib/contracts/state-form";
import type { DetectedSttToken } from "@/lib/mesh/detection";
import {
  beneficiaryStreamStopIdAtom,
  sttInputOutputIndexAtom,
  sttInputTxHashAtom,
  sttStateFormAtom,
  sttWalletInputsAtom
} from "./atoms/forms/stt-spend-form.atoms";
import { useWorkspaceDraftHandlers } from "./workspace-draft-handlers";

describe("beneficiary stream stop draft", () => {
  it.each(["resetActionDraft", "clearActionDraft"] as const)(
    "%s reloads the detected STT after a previous spend",
    (method) => {
      const store = createStore();
      store.set(sttInputTxHashAtom, "11".repeat(32));
      store.set(sttInputOutputIndexAtom, "0");
      store.set(beneficiaryStreamStopIdAtom, "7");
      store.set(sttWalletInputsAtom, [{ txHash: "33".repeat(32), outputIndex: 0 }]);
      const currentForm = { ...createDefaultStateForm(), walletName: "Current wallet" };
      const selectedDetectedToken: DetectedSttToken = {
        policyId: "44".repeat(28), assetNameHex: "01", unit: `${"44".repeat(28)}01`,
        scriptAddress: "unused-script-address",
        utxo: {
          input: { txHash: "22".repeat(32), outputIndex: 2 },
          output: { address: "unused-script-address", amount: [] }
        },
        datum: stateFormToDatum(currentForm)
      };
      const clearPreviewResult = vi.fn();
      const clearBuildMessages = vi.fn();
      const { result } = renderHook(() => useWorkspaceDraftHandlers({
        autoMintStateForm: createDefaultStateForm(),
        selectedDetectedToken,
        clearPreviewResult,
        clearBuildMessages,
        pendingOrphanWalletInputsRef: { current: null }
      }), {
        wrapper: ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
      });

      act(() => result.current[method]("stop-beneficiary-stream"));

      expect(store.get(sttInputTxHashAtom)).toBe(selectedDetectedToken.utxo.input.txHash);
      expect(store.get(sttInputOutputIndexAtom)).toBe("2");
      expect(store.get(sttStateFormAtom)).toEqual(currentForm);
      expect(store.get(beneficiaryStreamStopIdAtom)).toBe("");
      expect(store.get(sttWalletInputsAtom)).toEqual([]);
      expect(clearPreviewResult).toHaveBeenCalledOnce();
      expect(clearBuildMessages).toHaveBeenCalledOnce();
    }
  );
});
