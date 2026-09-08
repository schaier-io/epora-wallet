import "@/test/mock-workspace-queries";
import type { PrimitiveAtom } from "jotai";
// Render-only fixtures; query ownership is covered by use-wallet-balance.query.test.tsx.
vi.mock("@/components/user/workspace/queries/signer-balance", async () => {
  const { atom } = await import("jotai");
  return { walletBalanceSummaryAtom: atom({ assets: [], loading: false, error: null }) };
});
import { act, renderHook } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import type { PropsWithChildren } from "react";
import { expect, it, vi } from "vitest";
import type * as PayoutAddress from "@/lib/contracts/payout-address";
import type * as DefaultTranslator from "@/i18n/default-translator";

vi.mock("@/i18n/default-translator", async (importOriginal) => {
  const actual = await importOriginal<typeof DefaultTranslator>();
  return {
    ...actual,
    createDefaultTranslator: (namespace: string, messages: Record<string, string>) =>
      actual.createDefaultTranslator(namespace, namespace === "ComponentsUserWorkspaceActionValidation"
        ? { ...messages, walletRules: "Pravidla peněženky" }
        : messages)
  };
});

vi.mock("@/lib/contracts/blueprint", () => ({
  getSttMintPolicyId: () => "aa".repeat(28)
}));

// Mesh address serialization crosses jsdom's Uint8Array realm. Asset validation
// uses a fixed valid address; address round trips have separate node tests.
vi.mock("@/lib/contracts/payout-address", async (importOriginal) => ({
  ...await importOriginal<typeof PayoutAddress>(),
  decodePayoutAddressFromData: () => "addr_test1vqg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygxrcya6"
}));

import { mintStateFormAtom } from "@/components/user/workspace/atoms/forms/mint-form.atoms";
import { sttInputOutputIndexAtom, sttInputTxHashAtom, sttStateFormAtom } from "@/components/user/workspace/atoms/forms/stt-spend-form.atoms";
import { lockedContractUtxosAtom, lockedContractUtxosErrorAtom, lockedContractUtxosLoadingAtom } from "@/test/workspace-query-fixtures";
import { walletBalanceSummaryAtom } from "./atoms/workspace-data.atoms";
import { hasFieldErrors } from "@/components/user/workspace/helpers";
import { useWorkspaceActionFieldErrors } from "@/components/user/workspace/use-workspace-action-field-errors";
import {
  createDefaultStateForm,
  createDefaultUserFormState,
  stateFormToDatum
} from "@/lib/contracts/state-form";
import type { UTxO } from "@meshsdk/core";
import type { WalletBalanceSummary } from "@/components/user/workspace/types";

const STREAM_POLICY = "dd".repeat(28);
const STREAM_NAME = "deadbeef";
const STREAM_UNIT = STREAM_POLICY + STREAM_NAME;
const STATE_TX_HASH = "ef".repeat(32);
const PAYOUT_ADDRESS = "addr_test1vqg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygxrcya6";

function streamState() {
  const state = createDefaultStateForm();
  state.walletName = "Stream wallet";
  state.streamingPayments = [{ id: "1", payoutAddress: PAYOUT_ADDRESS, paidOutAmount: "0", policyId: STREAM_POLICY,
    assetName: STREAM_NAME, amountPerDay: "1", startDate: "0", endDate: "1000" }];
  return state;
}

function proofUtxo(unit = STREAM_UNIT): UTxO {
  return { input: { txHash: "bc".repeat(32), outputIndex: 0 },
    output: { address: PAYOUT_ADDRESS, amount: [{ unit, quantity: "1" }], scriptRef: "8200" } };
}

function renderStreamValidation({
  existing = false,
  advanced = false,
  extended = false,
  selectedOutputIndex = 0,
  requestedOutputIndex = String(selectedOutputIndex),
  requestedTxHash = STATE_TX_HASH,
  inputStartDate,
  inputEndDate,
  outputEndDate,
  balance = { assets: [], loading: false, error: null },
  locked = []
}: { existing?: boolean; advanced?: boolean; extended?: boolean; selectedOutputIndex?: number;
  requestedOutputIndex?: string; requestedTxHash?: string; inputStartDate?: string;
  inputEndDate?: string; outputEndDate?: string; balance?: WalletBalanceSummary; locked?: UTxO[] } = {}) {
  const output = streamState();
  if (extended) output.streamingPayments[0]!.endDate = "2000";
  const source = existing ? streamState() : createDefaultStateForm();
  if (existing && inputStartDate) {
    source.streamingPayments[0]!.startDate = inputStartDate;
    output.streamingPayments[0]!.startDate = inputStartDate;
  }
  if (existing && inputEndDate) source.streamingPayments[0]!.endDate = inputEndDate;
  if (outputEndDate) output.streamingPayments[0]!.endDate = outputEndDate;
  const stateUtxo = { input: { txHash: STATE_TX_HASH, outputIndex: selectedOutputIndex },
    output: { address: PAYOUT_ADDRESS, amount: [{ unit: "lovelace", quantity: "2000000" }] } };
  const store = createStore();
  store.set(mintStateFormAtom, output);
  store.set(sttStateFormAtom, output);
  store.set(sttInputTxHashAtom, requestedTxHash);
  store.set(sttInputOutputIndexAtom, requestedOutputIndex);
  store.set(walletBalanceSummaryAtom as PrimitiveAtom<WalletBalanceSummary>, balance);
  store.set(lockedContractUtxosAtom, locked);
  const wrapper = ({ children }: PropsWithChildren) => <Provider store={store}>{children}</Provider>;
  const hook = renderHook(() => useWorkspaceActionFieldErrors({
    activeInferredSttStateForm: advanced ? output : source,
    activePaymentKeyHash: null,
    existingWalletNames: [],
    selectedDetectedToken: advanced ? null : { policyId: "aa".repeat(28), assetNameHex: "", unit: "aa".repeat(28),
      scriptAddress: PAYOUT_ADDRESS, utxo: stateUtxo, datum: stateFormToDatum(source) },
    selectedDetectedTokenStateForm: advanced ? null : source,
    streamingPaymentPayoutRows: [],
    streamingPaymentPayoutTransfers: [],
    useAllowancePreview: { error: null }
  }), { wrapper });
  return { ...hook, store };
}

function assetProofErrors(errors: Record<string, string[]>) {
  return Object.values(errors).flat().filter((error) => /scheduled payment asset|No loaded wallet holds asset/.test(error));
}

it("blocks missing asset proof at mint and manage before Build", () => {
  const { result } = renderStreamValidation();
  expect(assetProofErrors(result.current.mint)).toEqual([expect.stringContaining(STREAM_UNIT)]);
  expect(assetProofErrors(result.current["manage-streaming-payments"])).toEqual([expect.stringContaining(STREAM_UNIT)]);
});

it("groups mint asset-proof errors under the translated wallet-rules field", () => {
  const { result } = renderStreamValidation();
  expect(result.current.mint["Pravidla peněženky"]).toContainEqual(expect.stringContaining(STREAM_UNIT));
  expect(result.current.mint["Wallet rules"]).toBeUndefined();
});

it("refreshing to one exact token clears both draft guards", () => {
  const { result, store } = renderStreamValidation();
  expect(assetProofErrors(result.current.mint)).toHaveLength(1);
  act(() => store.set(walletBalanceSummaryAtom as PrimitiveAtom<WalletBalanceSummary>, { assets: [{ unit: STREAM_UNIT, quantity: "1" }], loading: false, error: null }));
  expect(assetProofErrors(result.current.mint)).toEqual([]);
  expect(assetProofErrors(result.current["manage-streaming-payments"])).toEqual([]);
});

it("a smart-wallet reference-script output proves managed additions but not mint", () => {
  const { result } = renderStreamValidation({ locked: [proofUtxo()] });
  expect(assetProofErrors(result.current.mint)).toHaveLength(1);
  expect(assetProofErrors(result.current["manage-streaming-payments"])).toEqual([]);
});

it("an existing stream edit does not need asset proof again", () => {
  const { result } = renderStreamValidation({ existing: true });
  expect(assetProofErrors(result.current["manage-streaming-payments"])).toEqual([]);
});

it("blocks an existing stop below the current transaction floor before Build", () => {
  const now = 1_800_000_000_000;
  vi.useFakeTimers();
  vi.setSystemTime(now);

  try {
    const { result } = renderStreamValidation({
      existing: true,
      inputStartDate: String(now - 86_400_000),
      inputEndDate: String(now + 86_400_000),
      outputEndDate: String(now)
    });
    const errors = result.current["manage-streaming-payments"]["Output state"] ?? [];

    expect(errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/must stop at or after .* UTC.*Stop as soon as possible again/)
    ]));
  } finally {
    vi.useRealTimers();
  }
});

// Streaming asset existence invariant: only IDs absent from the input State
// require proof (streaming_payments/asset_presence.ak::new_assets_are_present).
it.each(["unchanged", "extended"] as const)("an %s stream at index 1 needs no proof when the requested index is omitted", (edit) => {
  const { result } = renderStreamValidation({ existing: true, extended: edit === "extended", selectedOutputIndex: 1, requestedOutputIndex: "" });
  expect(assetProofErrors(result.current["manage-streaming-payments"])).toEqual([]);
});

it("an explicit different index cannot establish existing stream IDs", () => {
  const { result } = renderStreamValidation({ existing: true, selectedOutputIndex: 1, requestedOutputIndex: "0" });
  expect(assetProofErrors(result.current["manage-streaming-payments"])).toHaveLength(1);
});

it("an omitted index still requires the selected transaction hash to match", () => {
  const { result } = renderStreamValidation({ existing: true, selectedOutputIndex: 1, requestedOutputIndex: "", requestedTxHash: "aa".repeat(32) });
  expect(assetProofErrors(result.current["manage-streaming-payments"])).toHaveLength(1);
});

it("an omitted index keeps proof required for a fresh stream", () => {
  const { result } = renderStreamValidation({ selectedOutputIndex: 1, requestedOutputIndex: "" });
  expect(assetProofErrors(result.current["manage-streaming-payments"])).toHaveLength(1);
});

it("advanced state without a detected source cannot skip the asset guard", () => {
  const { result } = renderStreamValidation({ advanced: true });
  expect(assetProofErrors(result.current["manage-streaming-payments"])).toHaveLength(1);
});

it.each(["loading", "error"] as const)("reports %s without claiming the asset is absent", (status) => {
  const { result } = renderStreamValidation({ balance: { assets: [], loading: status === "loading", error: status === "error" ? "offline" : null } });
  expect(assetProofErrors(result.current.mint)).toEqual([expect.stringContaining(status === "loading" ? "Checking wallet funds" : "Could not check")]);
  expect(assetProofErrors(result.current["manage-streaming-payments"])).toEqual([expect.stringContaining(status === "loading" ? "Checking wallet funds" : "Could not check")]);
});

it("stale smart-wallet balances do not satisfy the guard during refresh or failure", () => {
  const { result, store } = renderStreamValidation({ locked: [proofUtxo()] });
  act(() => store.set(lockedContractUtxosLoadingAtom, true));
  expect(assetProofErrors(result.current["manage-streaming-payments"])).toEqual([expect.stringContaining("Checking wallet funds")]);
  act(() => {
    store.set(lockedContractUtxosLoadingAtom, false);
    store.set(lockedContractUtxosErrorAtom, "offline");
  });
  expect(assetProofErrors(result.current["manage-streaming-payments"])).toEqual([expect.stringContaining("Could not check")]);
});

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
  expect(result.current.mint["Pravidla peněženky"]).toEqual(
    expect.arrayContaining([expect.stringMatching(duplicateCredentialError)])
  );
  expect(result.current["update-state"]["Output state"]).toEqual(
    expect.arrayContaining([expect.stringMatching(duplicateCredentialError)])
  );
  expect(hasFieldErrors(result.current.mint)).toBe(true);
  expect(hasFieldErrors(result.current["update-state"])).toBe(true);
});
