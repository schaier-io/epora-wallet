import { renderHook, waitFor } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { PropsWithChildren } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import type * as WorkspaceHelpers from "@/components/user/workspace/helpers";
import type * as Blueprint from "@/lib/contracts/blueprint";

const chain = vi.hoisted(() => ({
  fetchAddressTransactions: vi.fn(),
  fetchTransactionsByHash: vi.fn()
}));

vi.mock("@/components/user/workspace/helpers", async (importOriginal) => ({
  ...(await importOriginal<typeof WorkspaceHelpers>()),
  fetchAddressTransactions: chain.fetchAddressTransactions,
  fetchTransactionsByHash: chain.fetchTransactionsByHash
}));

vi.mock("@/lib/contracts/blueprint", async (importOriginal) => ({
  ...(await importOriginal<typeof Blueprint>()),
  resolveWalletContinuingOutputAddress: () => "addr_test1wallet"
}));

import { parseWorkspaceRouteState } from "@/components/user/workspace-controller";
import { configAtom } from "@/components/user/workspace/atoms/workspace-config.atoms";
import { detectedSttTokensAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";
import { walletTransactionsAtom } from "@/components/user/workspace/atoms/workspace-activity.atoms";
import { routeStateAtom } from "@/components/user/workspace/atoms/workspace-route.atoms";
import { useWalletActivity } from "@/components/user/workspace/use-wallet-activity";

const HASH = "cd".repeat(32);
const UNIT = `${"aa".repeat(28)}01`;
const transaction = {
  hash: HASH,
  inputs: [],
  outputs: [],
  blockTime: 1,
  slot: "1"
};

function wrapper(store: ReturnType<typeof createStore>) {
  return function StoreWrapper({ children }: PropsWithChildren) {
    return <Provider store={store}>{children}</Provider>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  chain.fetchTransactionsByHash.mockResolvedValue([transaction]);
});

it("loads the creation transaction when a new wallet address has empty history", async () => {
  chain.fetchAddressTransactions
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([transaction]);
  const store = createStore();
  store.set(configAtom, {
    ...store.get(configAtom),
    walletPolicyId: "aa".repeat(28),
    walletAssetNameHex: "01",
    sttAssetNameHex: "01"
  });
  store.set(detectedSttTokensAtom, [{
    policyId: "aa".repeat(28),
    assetNameHex: "01",
    unit: UNIT,
    scriptAddress: "addr_test1stt",
    utxo: {
      input: { txHash: HASH, outputIndex: 0 },
      output: { address: "addr_test1stt", amount: [] }
    },
    datum: null
  }]);
  store.set(
    routeStateAtom,
    parseWorkspaceRouteState(new URLSearchParams(`wallet=${UNIT}`))
  );

  renderHook(() => useWalletActivity(), { wrapper: wrapper(store) });

  await waitFor(() => expect(store.get(walletTransactionsAtom).loading).toBe(false));
  expect(store.get(walletTransactionsAtom)).toMatchObject({
    items: [transaction],
    error: null
  });
});
