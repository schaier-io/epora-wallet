import { renderHook } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import type { PropsWithChildren } from "react";
import { expect, it, vi } from "vitest";

vi.mock("@/lib/contracts/blueprint", () => ({
  getSttMintPolicyId: () => "aa".repeat(28)
}));

import { mintStateFormAtom } from "@/components/user/workspace/atoms/forms/mint-form.atoms";
import { sttStateFormAtom } from "@/components/user/workspace/atoms/forms/stt-spend-form.atoms";
import { hasFieldErrors } from "@/components/user/workspace/helpers";
import { useWorkspaceActionFieldErrors } from "@/components/user/workspace/use-workspace-action-field-errors";
import {
  createDefaultStateForm,
  createDefaultUserFormState
} from "@/lib/contracts/state-form";

it("blocks wallet setup and user updates that reuse a positive-power credential", () => {
  const sharedCredential = "ab".repeat(28);
  const state = createDefaultStateForm();
  state.walletName = "Shared wallet";
  state.users = ["1", "2"].map((power, index) => ({
    ...createDefaultUserFormState(String(index)),
    wallets: [sharedCredential],
    multiSigPowerMode: "some" as const,
    multiSigPower: power,
    preset: "custom" as const
  }));
  state.multiSigThresholdMode = "some";
  state.multiSigThreshold = "3";

  const store = createStore();
  store.set(mintStateFormAtom, state);
  store.set(sttStateFormAtom, state);
  const wrapper = ({ children }: PropsWithChildren) => (
    <Provider store={store}>{children}</Provider>
  );
  const { result } = renderHook(
    () =>
      useWorkspaceActionFieldErrors({
        activeInferredSttStateForm: state,
        activePaymentKeyHash: null,
        existingWalletNames: [],
        selectedDetectedToken: null,
        selectedDetectedTokenStateForm: null,
        streamingPaymentPayoutRows: [],
        streamingPaymentPayoutTransfers: [],
        useAllowancePreview: { error: null }
      }),
    { wrapper }
  );

  const duplicateCredentialError = /positive-power co-signer must use a distinct wallet ID/i;
  expect(result.current.mint["Wallet rules"]).toEqual(
    expect.arrayContaining([expect.stringMatching(duplicateCredentialError)])
  );
  expect(result.current["update-state"]["Output state"]).toEqual(
    expect.arrayContaining([expect.stringMatching(duplicateCredentialError)])
  );
  expect(hasFieldErrors(result.current.mint)).toBe(true);
  expect(hasFieldErrors(result.current["update-state"])).toBe(true);
});
