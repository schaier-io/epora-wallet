import { StrictMode, type PropsWithChildren } from "react";
import { fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DetectedSttToken } from "@/lib/mesh/detection";

const chain = vi.hoisted(() => ({
  detectSharedSttReferenceStore: vi.fn(),
  detectSttInfo: vi.fn(),
  fetchScriptUtxos: vi.fn()
}));

const actions = vi.hoisted(() => ({
  refreshDetectedTokens: vi.fn(),
  refreshPermissionWalletSummaries: vi.fn()
}));

vi.mock("@/lib/mesh/detection", () => ({
  detectSharedSttReferenceStore: chain.detectSharedSttReferenceStore,
  detectSttInfo: chain.detectSttInfo
}));

vi.mock("@/lib/contracts/blueprint", () => ({
  getSttMintPolicyId: () => "aa".repeat(28),
  resolveWalletSpendAddress: () => "addr_test1smartwallet"
}));

vi.mock("@/components/user/workspace/helpers", () => ({
  fetchScriptUtxos: chain.fetchScriptUtxos,
  isAsset: () => true,
  mergeAmountLists: (amounts: unknown[][]) => amounts.flat()
}));

vi.mock("@/lib/mesh/transactions", () => ({
  buildDeploySharedSttReferenceTx: vi.fn(),
  signAndSubmitTx: vi.fn()
}));

vi.mock("@/components/user/workspace/workspace-actions-context", () => ({
  useWorkspaceActions: () => actions
}));

vi.mock("@/components/react-bits/primitives", () => ({
  AnimatedContent: ({ children }: PropsWithChildren) => <>{children}</>
}));

vi.mock("@/components/user/product-faq-list", () => ({
  ProductFaqList: () => null
}));

import {
  detectedSttTokensAtom,
  detectedSttTokensLoadingAtom,
  sharedSttReferenceStoreLoadingAtom
} from "@/components/user/workspace/atoms/workspace-data.atoms";
import { walletConnectionDialogOpenAtom } from "@/components/user/workspace/atoms/workspace-ui.atoms";
import { useDetectedSttTokens } from "@/components/user/workspace/use-detected-stt-tokens";
import { useSharedSttReference } from "@/components/user/workspace/use-shared-stt-reference";
import { WorkspaceOnboardingView } from "@/components/user/workspace/workspace-onboarding-view";

const EMPTY_DETECTION = {
  policyId: "aa".repeat(28),
  assetNameHex: "",
  scriptAddress: "addr_test1stt",
  sttUtxos: [],
  tokens: []
};

const MISSING_SHARED_REFERENCE = {
  policyId: "aa".repeat(28),
  sttScriptHash: "bb".repeat(28),
  storeAddress: "addr_test1reference",
  status: "missing" as const,
  activeReference: null,
  matchingReferences: [],
  matchingCount: 0,
  staleReferenceCount: 0,
  storeUtxoCount: 0
};

const STALE_TOKEN = {
  policyId: "aa".repeat(28),
  assetNameHex: "01",
  unit: `${"aa".repeat(28)}01`,
  scriptAddress: "addr_test1stt",
  utxo: {
    input: { txHash: "cc".repeat(32), outputIndex: 0 },
    output: { address: "addr_test1stt", amount: [] }
  } as DetectedSttToken["utxo"],
  datum: null
} satisfies DetectedSttToken;

function strictStoreWrapper(store: ReturnType<typeof createStore>) {
  return function StrictStoreWrapper({ children }: PropsWithChildren) {
    return (
      <StrictMode>
        <Provider store={store}>{children}</Provider>
      </StrictMode>
    );
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  chain.detectSttInfo.mockResolvedValue(EMPTY_DETECTION);
  chain.detectSharedSttReferenceStore.mockResolvedValue(MISSING_SHARED_REFERENCE);
  chain.fetchScriptUtxos.mockResolvedValue([]);
});

describe("workspace chain-read gating", () => {
  it("does no token detection or stale-token summary reads before connection starts", async () => {
    const store = createStore();
    store.set(detectedSttTokensAtom, [STALE_TOKEN]);
    const { rerender } = renderHook(
      ({ enabled }) =>
        useDetectedSttTokens({
          enabled,
          selectedDetectedTokenUnit: "",
          setSelectedDetectedTokenUnit: vi.fn()
        }),
      {
        initialProps: { enabled: false },
        wrapper: strictStoreWrapper(store)
      }
    );

    expect(chain.detectSttInfo).not.toHaveBeenCalled();
    expect(chain.fetchScriptUtxos).not.toHaveBeenCalled();
    expect(store.get(detectedSttTokensLoadingAtom)).toBe(true);

    rerender({ enabled: true });

    await waitFor(() => expect(chain.detectSttInfo).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(store.get(detectedSttTokensLoadingAtom)).toBe(false));
    expect(chain.fetchScriptUtxos).not.toHaveBeenCalled();
  });

  it("does not inspect the shared reference store until connection starts", async () => {
    const store = createStore();
    const { rerender } = renderHook(
      ({ enabled }) =>
        useSharedSttReference({
          activeWallet: null,
          enabled,
          isDemoWallet: false
        }),
      {
        initialProps: { enabled: false },
        wrapper: strictStoreWrapper(store)
      }
    );

    expect(chain.detectSharedSttReferenceStore).not.toHaveBeenCalled();
    expect(store.get(sharedSttReferenceStoreLoadingAtom)).toBe(true);

    rerender({ enabled: true });

    await waitFor(() => expect(chain.detectSharedSttReferenceStore).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(store.get(sharedSttReferenceStoreLoadingAtom)).toBe(false));
  });

  it("opens the connection dialog without refreshing chain data", () => {
    const store = createStore();
    render(
      <Provider store={store}>
        <WorkspaceOnboardingView />
      </Provider>
    );

    fireEvent.click(screen.getByRole("button", { name: /connect cardano wallet/i }));

    expect(store.get(walletConnectionDialogOpenAtom)).toBe(true);
    expect(actions.refreshDetectedTokens).not.toHaveBeenCalled();
    expect(actions.refreshPermissionWalletSummaries).not.toHaveBeenCalled();
  });
});
