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
  sttProofOfLifeOverrideModeAtom,
  sttProofOfLifeSpecificDateTimeAtom,
  sttWalletInputsAtom
} from "./atoms/forms/stt-spend-form.atoms";
import { useWorkspaceDraftHandlers } from "./workspace-draft-handlers";
import { withdrawAmountAtom, withdrawRewardAddressAtom } from "./atoms/forms/withdraw-form.atoms";

describe.each(["stop-beneficiary-stream", "renew-proof-of-life"] as const)("%s draft", action => {
  it.each(["resetActionDraft", "clearActionDraft"] as const)(
    "%s reloads the detected STT after a previous spend",
    (method) => {
      const store = createStore();
      store.set(sttInputTxHashAtom, "11".repeat(32));
      store.set(sttInputOutputIndexAtom, "0");
      store.set(beneficiaryStreamStopIdAtom, "7");
      store.set(sttWalletInputsAtom, [{ txHash: "33".repeat(32), outputIndex: 0 }]);
      store.set(sttProofOfLifeOverrideModeAtom, "specific");
      store.set(sttProofOfLifeSpecificDateTimeAtom, "2030-01-01T00:00");
      store.set(withdrawAmountAtom, "12345");
      store.set(withdrawRewardAddressAtom, "stake_test_saved");
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

      act(() => result.current[method](action));

      expect(store.get(sttInputTxHashAtom)).toBe(selectedDetectedToken.utxo.input.txHash);
      expect(store.get(sttInputOutputIndexAtom)).toBe("2");
      expect(store.get(sttStateFormAtom)).toEqual(currentForm);
      if (action === "stop-beneficiary-stream") expect(store.get(beneficiaryStreamStopIdAtom)).toBe("");
      expect(store.get(sttProofOfLifeOverrideModeAtom)).toBe(action === "renew-proof-of-life" ? "auto" : "specific");
      expect(store.get(sttProofOfLifeSpecificDateTimeAtom)).toBe(action === "renew-proof-of-life" ? "" : "2030-01-01T00:00");
      expect(store.get(withdrawAmountAtom)).toBe("12345");
      expect(store.get(withdrawRewardAddressAtom)).toBe("stake_test_saved");
      // These pools belong to the sibling Send draft.
      expect(store.get(sttWalletInputsAtom)).toEqual([{ txHash: "33".repeat(32), outputIndex: 0 }]);
      expect(clearPreviewResult).toHaveBeenCalledOnce();
      expect(clearBuildMessages).toHaveBeenCalledOnce();
    }
  );
});
