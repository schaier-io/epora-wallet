import { createStore } from "jotai";
import { beforeEach, expect, it, vi } from "vitest";

import {
  submitConfirmationAtom,
  submitHashAtom
} from "@/components/user/workspace/atoms/transaction-flow.atoms";
import { SUBMIT_CONFIRMATION_MAX_ATTEMPTS } from "@/components/user/workspace/constants";
import type * as workspaceHelpers from "@/components/user/workspace/helpers";
import type { BuildResult } from "@/lib/types/contracts";

const mocks = vi.hoisted(() => ({
  signAndSubmitTx: vi.fn(),
  fetchTransactionsByHash: vi.fn()
}));

vi.mock("@/lib/mesh/transactions", () => ({ signAndSubmitTx: mocks.signAndSubmitTx }));
vi.mock("@/components/user/workspace/workspace-transaction-refresh", () => ({
  schedulePostSubmitRefresh: vi.fn()
}));
// The poll waits 10s, then 15s between attempts. Only the loop's own arithmetic is
// under test, so the clock is taken out of it rather than faked around it.
vi.mock("@/components/user/workspace/helpers", async (importOriginal) => ({
  ...(await importOriginal<typeof workspaceHelpers>()),
  waitFor: () => Promise.resolve(),
  fetchTransactionsByHash: mocks.fetchTransactionsByHash
}));

import { createWorkspaceTransactionSubmit } from "./workspace-transaction-submit";

const TX_HASH = "ff".repeat(32);
const PREVIEW = { txHex: "84a1", preview: { action: "lock-funds", summary: "" } } as BuildResult;

function submitFor(store: ReturnType<typeof createStore>) {
  const deps = {
    activeWallet: {},
    activeWalletName: "lace",
    isDemoWallet: false,
    networkId: 0,
    jotaiStore: store,
    selectedAction: "lock-funds",
    preview: PREVIEW,
    previewMatchesSelectedAction: true,
    submitHash: null,
    submitInFlightRef: { current: false },
    setActiveSubmit: vi.fn(),
    setBuildError: vi.fn(),
    setBuildErrorExpected: vi.fn(),
    // The watch loop reads the hash back out of the store to spot a stale run, so the
    // test setter has to write it the way the controller's does.
    setSubmitHash: (hash: string) => store.set(submitHashAtom, hash),
    setMintConfirmation: vi.fn(),
    setMintedWalletName: vi.fn(),
    addSubmittedTransactionToActivity: vi.fn().mockResolvedValue(undefined),
    rememberRecipients: vi.fn(),
    refreshDetectedTokens: vi.fn().mockResolvedValue(undefined),
    refreshLockedContractUtxos: vi.fn().mockResolvedValue(undefined),
    refreshPermissionWalletSummaries: vi.fn().mockResolvedValue(undefined),
    refreshWalletBalance: vi.fn().mockResolvedValue(undefined),
    lockingContract: { address: "addr_test1lock" },
    postSubmitRefreshTimersRef: { current: [] },
    watchMintCreationConfirmation: vi.fn(),
    mintStateForm: {},
    sttExtraTransfers: []
  } as unknown as Parameters<typeof createWorkspaceTransactionSubmit>[0];
  return createWorkspaceTransactionSubmit(deps);
}

beforeEach(() => {
  mocks.signAndSubmitTx.mockReset().mockResolvedValue(TX_HASH);
  mocks.fetchTransactionsByHash.mockReset();
});

/** The watch runs detached (`void watchTransactionConfirmation(...)`), and every wait
 * inside it is mocked to an immediate microtask, so draining the microtask queue runs
 * the loop to completion without a timer or a polling assertion. */
async function drainWatch() {
  for (let tick = 0; tick < 500; tick += 1) {
    await Promise.resolve();
  }
}

/**
 * The poll is bounded. Falling out of the loop used to leave the status on
 * "pending", so the review rail spun its confirming spinner for the rest of the
 * session over a transaction nobody was watching any more.
 */
it("records a timed-out confirmation once the bounded poll is exhausted", async () => {
  mocks.fetchTransactionsByHash.mockResolvedValue([]);
  const store = createStore();

  await submitFor(store).submitTransactionPreview(PREVIEW);
  await drainWatch();

  expect(mocks.fetchTransactionsByHash).toHaveBeenCalledTimes(SUBMIT_CONFIRMATION_MAX_ATTEMPTS);
  expect(store.get(submitConfirmationAtom)).toBe("timed-out");
  // Kept, so the rail can still link the reader to Cardanoscan.
  expect(store.get(submitHashAtom)).toBe(TX_HASH);
});

it("records a confirmed transaction as soon as an indexer sees the hash", async () => {
  mocks.fetchTransactionsByHash.mockResolvedValue([{ hash: TX_HASH }]);
  const store = createStore();

  await submitFor(store).submitTransactionPreview(PREVIEW);
  await drainWatch();

  expect(mocks.fetchTransactionsByHash).toHaveBeenCalledTimes(1);
  expect(store.get(submitConfirmationAtom)).toBe("confirmed");
});

/**
 * A newer submit can replace the hash while the old run is on its last attempt. The
 * exhausted run must not stamp its own timeout over the new transaction's status.
 */
it("leaves the status alone when a newer submit replaced the hash mid-poll", async () => {
  const store = createStore();
  mocks.fetchTransactionsByHash.mockImplementation(() => {
    if (mocks.fetchTransactionsByHash.mock.calls.length === SUBMIT_CONFIRMATION_MAX_ATTEMPTS) {
      store.set(submitHashAtom, "ab".repeat(32));
    }
    return Promise.resolve([]);
  });

  await submitFor(store).submitTransactionPreview(PREVIEW);
  await drainWatch();

  expect(mocks.fetchTransactionsByHash).toHaveBeenCalledTimes(SUBMIT_CONFIRMATION_MAX_ATTEMPTS);
  expect(store.get(submitConfirmationAtom)).toBe("pending");
});
