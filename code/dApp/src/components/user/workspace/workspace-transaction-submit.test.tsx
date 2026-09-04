import { createStore } from "jotai";
import { beforeEach, expect, it, vi } from "vitest";
import type { BuildResult } from "@/lib/types/contracts";

const mocks = vi.hoisted(() => ({ signAndSubmitTx: vi.fn() }));

vi.mock("@/lib/mesh/transactions", () => ({ signAndSubmitTx: mocks.signAndSubmitTx }));
vi.mock("@/components/user/workspace/workspace-transaction-refresh", () => ({
  schedulePostSubmitRefresh: vi.fn()
}));

import { createWorkspaceTransactionSubmit } from "./workspace-transaction-submit";
import { writeRecentRecipientsToStorage } from "./helpers/recent-recipients";

const TX_HASH = "ab".repeat(32);
const preview = {
  txHex: "84a1",
  preview: { action: "use", summary: "Send funds" }
} as unknown as BuildResult;

function makeDeps(overrides: Record<string, unknown> = {}) {
  const deps = {
    activeWallet: {},
    activeWalletName: "Lace",
    isDemoWallet: false,
    networkId: 0,
    jotaiStore: createStore(),
    selectedAction: "use",
    preview,
    previewMatchesSelectedAction: true,
    submitHash: null,
    submitInFlightRef: { current: false },
    setActiveSubmit: vi.fn(),
    setBuildError: vi.fn(),
    setBuildErrorExpected: vi.fn(),
    setSubmitHash: vi.fn(),
    setMintConfirmation: vi.fn(),
    setMintedWalletName: vi.fn(),
    addSubmittedTransactionToActivity: vi.fn().mockResolvedValue(undefined),
    rememberRecipients: vi.fn(),
    refreshDetectedTokens: vi.fn().mockResolvedValue({ tokens: [] }),
    refreshLockedContractUtxos: vi.fn().mockResolvedValue(undefined),
    refreshPermissionWalletSummaries: vi.fn().mockResolvedValue(undefined),
    refreshWalletBalance: vi.fn().mockResolvedValue(undefined),
    lockingContract: { address: "addr_test1lock" },
    postSubmitRefreshTimersRef: { current: [] },
    watchMintCreationConfirmation: vi.fn().mockResolvedValue(undefined),
    mintStateForm: { walletName: "Test wallet" },
    sttExtraTransfers: [{ address: "addr_test1recipient", amount: [] }],
    ...overrides
  } as unknown as Parameters<typeof createWorkspaceTransactionSubmit>[0];
  return deps;
}

beforeEach(() => {
  mocks.signAndSubmitTx.mockReset().mockResolvedValue(TX_HASH);
});

it("ignores unavailable local storage when saving recent recipients", () => {
  const browserWindow = window;
  vi.stubGlobal("window", {
    localStorage: {
      setItem: () => {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      }
    }
  });

  try {
    expect(() => writeRecentRecipientsToStorage(["addr_test1recipient"])).not.toThrow();
  } finally {
    vi.stubGlobal("window", browserWindow);
  }
});

it("keeps a submitted transaction successful when recipient bookkeeping throws", async () => {
  const deps = makeDeps({
    rememberRecipients: vi.fn(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    })
  });

  await createWorkspaceTransactionSubmit(deps).submitTransactionPreview(preview);

  expect(deps.setSubmitHash).toHaveBeenCalledWith(TX_HASH);
  expect(deps.setBuildError).toHaveBeenCalledTimes(1);
  expect(deps.setBuildError).toHaveBeenCalledWith(null);
  expect(deps.setActiveSubmit).toHaveBeenLastCalledWith(false);
  expect(deps.submitInFlightRef.current).toBe(false);
});

it("handles a rejected follow-up read separately from transaction submission", async () => {
  const readError = new Error("Indexer unavailable");
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  const deps = makeDeps({
    refreshPermissionWalletSummaries: vi.fn().mockRejectedValue(readError)
  });

  try {
    await createWorkspaceTransactionSubmit(deps).submitTransactionPreview(preview);
    await Promise.resolve();

    expect(deps.setSubmitHash).toHaveBeenCalledWith(TX_HASH);
    expect(deps.setBuildError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith("[post-submit:wallet-summaries]", readError);
  } finally {
    consoleError.mockRestore();
  }
});

it("represents a mint whose transaction hash is not known yet with null", async () => {
  let resolveSubmit!: (txHash: string) => void;
  mocks.signAndSubmitTx.mockImplementation(
    () => new Promise<string>((resolve) => { resolveSubmit = resolve; })
  );
  const deps = makeDeps({ selectedAction: "mint" });
  const submission = createWorkspaceTransactionSubmit(deps).submitTransactionPreview(preview);

  try {
    expect(deps.setMintConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({ txHash: null, phase: "submitting" })
    );
  } finally {
    resolveSubmit(TX_HASH);
    await submission;
  }
});
