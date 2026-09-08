import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useAtomValue } from "jotai";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DetectedSttInfo, DetectedSttToken } from "@/lib/mesh/detection";
import { createQueryTestWrapper } from "@/test/query-client";
import { isConnectingAtom } from "@/providers/wallet.atoms";
import { queryKeys } from "@/lib/query/keys";
import { sttWalletQueryOptions, type SttInventorySnapshot } from "@/lib/query/stt-inventory";
import { routeStateAtom } from "@/components/user/workspace/atoms/workspace-route.atoms";
import { selectedDetectedTokenUnitAtom } from "@/components/user/workspace/atoms/workspace-selection.atoms";
import type { PayeeScanResult } from "./collect-payee-streaming-payments";

const chain = vi.hoisted(() => ({ detect: vi.fn(), funds: vi.fn() }));
const policyId = "aa".repeat(28);
const selectWallet = vi.fn();
const refreshErrors = vi.fn();
let context: ReturnType<typeof createQueryTestWrapper>;

vi.mock("@/lib/mesh/detection", () => ({ detectSttInfo: chain.detect }));
vi.mock("@/lib/mesh/server-fetcher", () => ({ ServerFetcher: class { fetchAddressUTxOs = chain.funds; } }));
vi.mock("@/lib/contracts/blueprint", () => ({
  getSttMintPolicyId: () => "aa".repeat(28),
  resolveWalletContinuingOutputAddressFromState: ({ sttAssetNameHex }: { sttAssetNameHex: string }) =>
    `addr_test1${sttAssetNameHex}`
}));
vi.mock("@/providers/wallet-provider", () => ({
  useWalletContext: () => ({
    activeWallet: {}, activeAddress: "addr_test1payee", activePaymentKeyHash: "bb".repeat(28),
    isDemoWallet: false, networkId: 0
  })
}));
vi.mock("@/lib/mesh/transactions", () => ({
  buildSttSpendTx: vi.fn(), signAndSubmitTx: vi.fn(),
  getValidityWindow: (nowMs: number) => ({ earliestTimeMs: nowMs, latestTimeMs: nowMs + 60_000 })
}));
vi.mock("./payee-collect-tx", () => ({
  PayeeCollectBlockedError: class extends Error {}, runPayeeCollect: vi.fn()
}));
vi.mock("./collect-payee-streaming-payments", () => ({
  collectPayeeStreamingPayments: (tokens: DetectedSttToken[]): PayeeScanResult => ({
    payments: [], walletsScanned: tokens.length, walletsUnreadable: 0, entriesSkipped: 0
  })
}));

import { useDetectedSttTokens } from "@/components/user/workspace/use-detected-stt-tokens";
import {
  detectedSttTokensAtom,
  detectedSttTokensLoadingAtom
} from "@/components/user/workspace/queries/stt-queries.atoms";
import { PayeeView } from "./payee-view";
import {
  beginPayeeInputActionAtom, markPayeeInputSubmittedAtom,
  payeePendingInputKey, pendingPayeeInputActionsAtom
} from "./payee-pending-inputs.atoms";

function token(assetNameHex: string): DetectedSttToken {
  return {
    policyId, assetNameHex, unit: `${policyId}${assetNameHex}`, scriptAddress: "script-address", datum: null,
    utxo: {
      input: { txHash: assetNameHex.repeat(32), outputIndex: 0 },
      output: { address: "script-address", amount: [] }
    }
  };
}

function detected(tokens: DetectedSttToken[]): DetectedSttInfo {
  return {
    policyId, assetNameHex: tokens[0]?.assetNameHex ?? "", scriptAddress: "script-address",
    tokens, sttUtxos: tokens.map((value) => value.utxo)
  };
}

function deferredRead() {
  let resolve!: (value: DetectedSttInfo) => void;
  let signal: AbortSignal | undefined;
  let active = false;
  const read = (_unit?: string, abortSignal?: AbortSignal) => {
    signal = abortSignal;
    active = true;
    return new Promise<DetectedSttInfo>((done, reject) => {
      resolve = (value) => { active = false; done(value); };
      const abort = () => {
        active = false;
        reject(abortSignal?.reason ?? new DOMException("Aborted", "AbortError"));
      };
      if (abortSignal?.aborted) abort();
      else abortSignal?.addEventListener("abort", abort, { once: true });
    });
  };
  return { read, resolve: (value: DetectedSttInfo) => resolve(value), get signal() { return signal; }, get active() { return active; } };
}

function reserveSubmittedInput(assetNameHex = "00") {
  const stateInput = `${token(assetNameHex).utxo.input.txHash}#0`;
  const key = payeePendingInputKey(policyId, stateInput);
  context.store.set(beginPayeeInputActionAtom, { policyId, stateInput, streamKey: "stream-1", action: "collect" });
  context.store.set(markPayeeInputSubmittedAtom, { key, txHash: "submitted-tx" });
  return key;
}

function Workspace() {
  const selectedUnit = useAtomValue(selectedDetectedTokenUnitAtom);
  const { refreshDetectedTokens } = useDetectedSttTokens({
    selectedDetectedTokenUnit: selectedUnit, setSelectedDetectedTokenUnit: selectWallet
  });
  const tokens = useAtomValue(detectedSttTokensAtom);
  const loading = useAtomValue(detectedSttTokensLoadingAtom);
  return <>
    <output data-testid="workspace-units" data-loading={loading}>
      {tokens.map((value) => value.assetNameHex).join(",")}
    </output>
    <button onClick={() => void refreshDetectedTokens({ knownUnit: selectedUnit || undefined }).catch(refreshErrors)}>
      Refresh workspace
    </button>
  </>;
}

type PagesProps = { workspace?: boolean; payee?: boolean; selectedUnit?: string };
function Pages({ workspace, payee }: PagesProps) {
  return <>{workspace && <Workspace />}{payee && <PayeeView />}</>;
}

function renderPages(props: PagesProps) {
  const setRoute = (selectedUnit?: string) => context.store.set(routeStateAtom, {
    ...context.store.get(routeStateAtom), selectedWalletUnit: selectedUnit || null
  });
  setRoute(props.selectedUnit);
  const view = render(<Pages {...props} />, { wrapper: context.wrapper });
  return {
    ...view,
    navigate: (next: PagesProps) => act(() => {
      setRoute(next.selectedUnit);
      view.rerender(<Pages {...next} />);
    })
  };
}

async function workspaceShows(units: string) {
  await waitFor(() => {
    expect(screen.getByTestId("workspace-units")).toHaveTextContent(units);
    expect(screen.getByTestId("workspace-units")).toHaveAttribute("data-loading", "false");
  });
}

async function payeeReady() {
  await waitFor(() => expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled());
}

beforeEach(() => {
  context = createQueryTestWrapper();
  context.store.set(isConnectingAtom, true);
  chain.detect.mockReset();
  chain.funds.mockReset().mockResolvedValue([]);
  selectWallet.mockReset();
  refreshErrors.mockReset();
});

afterEach(() => {
  cleanup();
  context.queryClient.clear();
});

it("reuses the workspace full scan when navigating to Payee", async () => {
  chain.detect.mockResolvedValue(detected([token("01"), token("02")]));
  const pages = renderPages({ workspace: true });
  await workspaceShows("01,02");

  pages.navigate({ payee: true });
  await payeeReady();

  expect(chain.detect).toHaveBeenCalledTimes(1);
});

it("joins Payee's pending full scan on a selected workspace route without concurrent duplicate scans", async () => {
  const reads: ReturnType<typeof deferredRead>[] = [];
  let maximumActiveReads = 0;
  chain.detect.mockImplementation((unit?: string, signal?: AbortSignal) => {
    const read = deferredRead();
    reads.push(read);
    const pending = read.read(unit, signal);
    maximumActiveReads = Math.max(maximumActiveReads, reads.filter(value => value.active).length);
    return pending;
  });
  const pages = renderPages({ payee: true });
  await waitFor(() => expect(reads).toHaveLength(1));
  expect(reads[0].signal).toBeInstanceOf(AbortSignal);

  pages.navigate({ workspace: true, selectedUnit: token("01").unit });
  await act(async () => { reads.filter(read => read.active).forEach(read => read.resolve(detected([token("01"), token("02")]))); });

  await workspaceShows("01,02");
  expect(maximumActiveReads).toBe(1);
  expect(chain.detect.mock.calls.every(([unit]) => unit === undefined)).toBe(true);
  expect(reads.filter(read => read.active)).toHaveLength(0);
});

it("runs Payee's full scan after a targeted-only read and retains reservations until that scan succeeds", async () => {
  chain.detect.mockResolvedValueOnce(detected([token("01")]));
  await context.queryClient.fetchQuery(sttWalletQueryOptions(policyId, token("01").unit, context.queryClient));
  const fullKey = queryKeys.sttInventory(policyId);
  expect(context.queryClient.getQueryData<SttInventorySnapshot>(fullKey)?.fullScanAt).toBeNull();
  const key = reserveSubmittedInput();
  const full = deferredRead();
  chain.detect.mockImplementationOnce(full.read);

  renderPages({ payee: true });
  await waitFor(() => expect(chain.detect).toHaveBeenCalledTimes(2));
  expect(context.store.get(pendingPayeeInputActionsAtom)[key]?.phase).toBe("submitted");
  expect(chain.detect.mock.calls[0]?.[0]).toBe(token("01").unit);
  expect(chain.detect.mock.calls[1]?.[0]).toBeUndefined();

  await act(async () => full.resolve(detected([token("01"), token("02")])));
  await payeeReady();
  expect(context.queryClient.getQueryData<SttInventorySnapshot>(fullKey)?.tokens.map(value => value.assetNameHex)).toEqual(["01", "02"]);
  await waitFor(() => expect(context.store.get(pendingPayeeInputActionsAtom)[key]).toBeUndefined());
});

it("forces a new Payee scan and updates the mounted workspace's token projection", async () => {
  chain.detect.mockResolvedValue(detected([token("01")]));
  renderPages({ workspace: true, payee: true });
  await workspaceShows("01");
  await payeeReady();
  expect(chain.detect).toHaveBeenCalledTimes(1);
  chain.detect.mockResolvedValueOnce(detected([token("02")]));

  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

  await workspaceShows("02");
  expect(chain.detect).toHaveBeenCalledTimes(2);
});

it("retains a submitted input when Payee adopts cached full data or a later full read fails", async () => {
  chain.detect.mockResolvedValue(detected([token("02")]));
  const pages = renderPages({ workspace: true });
  await workspaceShows("02");
  const key = reserveSubmittedInput("01");

  pages.navigate({ payee: true });
  await payeeReady();
  expect(chain.detect).toHaveBeenCalledTimes(1);
  expect(context.store.get(pendingPayeeInputActionsAtom)[key]?.phase).toBe("submitted");

  chain.detect.mockRejectedValueOnce(new Error("indexer unavailable"));
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await waitFor(() => expect(chain.detect).toHaveBeenCalledTimes(2));
  await payeeReady();
  expect(context.store.get(pendingPayeeInputActionsAtom)[key]?.phase).toBe("submitted");
});

it("does not release submitted inputs from a targeted update or its superseded full scan", async () => {
  const staleFull = deferredRead();
  chain.detect.mockImplementationOnce(staleFull.read).mockResolvedValueOnce(detected([token("01")]));
  const key = reserveSubmittedInput();
  const pages = renderPages({ payee: true });
  await waitFor(() => expect(chain.detect).toHaveBeenCalledTimes(1));
  pages.navigate({ workspace: true, payee: true, selectedUnit: token("01").unit });

  fireEvent.click(screen.getByRole("button", { name: "Refresh workspace" }));
  await workspaceShows("01");
  expect(staleFull.signal?.aborted).toBe(true);
  expect(context.store.get(pendingPayeeInputActionsAtom)[key]?.phase).toBe("submitted");

  await act(async () => staleFull.resolve(detected([])));
  await payeeReady();
  expect(context.store.get(pendingPayeeInputActionsAtom)[key]?.phase).toBe("submitted");
  expect(context.store.get(detectedSttTokensAtom).map(value => value.assetNameHex)).toEqual(["01"]);
  expect(refreshErrors).not.toHaveBeenCalled();
});
