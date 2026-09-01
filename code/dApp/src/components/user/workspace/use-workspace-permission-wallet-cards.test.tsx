import { renderHook } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";

import { detectedSttTokensAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";
import { useWorkspacePermissionWalletCards } from "@/components/user/workspace/use-workspace-permission-wallet-cards";
import { createDefaultStateForm, stateFormToDatum } from "@/lib/contracts/state-form";
import type { DetectedSttToken } from "@/lib/mesh/detection";

const MINE = "aa".repeat(28);
const SOMEONE_ELSE = "bb".repeat(28);

/**
 * `lib/mesh/detection.ts` scans the STT policy, not the connected account, so the detected
 * list is every smart wallet on the network. Whether one of them is the reader's is decided
 * here, from the wallet's own datum against the connected payment key hash.
 */
function detectedToken(id: string, ownerKeyHash: string): DetectedSttToken {
  const stateForm = createDefaultStateForm();
  stateForm.walletName = `Wallet ${id}`;
  stateForm.users = [
    {
      id: "1",
      wallets: [ownerKeyHash],
      perDayAllowance: [],
      remainingAllowance: [],
      nextAllowanceReset: "0",
      canRenewProofOfLife: false,
      multiSigPowerMode: "none",
      multiSigPower: "",
      isAdmin: true,
      preset: "admin"
    }
  ];

  return {
    policyId: "policy",
    assetNameHex: `asset-${id}`,
    unit: `unit-${id}`,
    scriptAddress: "script",
    datum: stateFormToDatum(stateForm),
    utxo: {
      input: { txHash: `tx-${id}`, outputIndex: 0 },
      output: { address: "script", amount: [] }
    }
  } as unknown as DetectedSttToken;
}

function renderCards(tokens: DetectedSttToken[], paymentKeyHash: string | null) {
  const store = createStore();
  store.set(detectedSttTokensAtom, tokens);

  return renderHook(
    () =>
      useWorkspacePermissionWalletCards({
        activePaymentKeyHash: paymentKeyHash,
        selectedDetectedTokenUnit: "",
        smartWalletDisplay: { publish: vi.fn(), reset: vi.fn() } as never
      }),
    {
      wrapper: ({ children }: PropsWithChildren) => (
        <Provider store={store}>{children}</Provider>
      )
    }
  );
}

describe("permission wallet cards", () => {
  it("lists only the wallets the connected key holds a role in", () => {
    const { result } = renderCards(
      [detectedToken("mine", MINE), detectedToken("theirs", SOMEONE_ELSE)],
      MINE
    );

    expect(result.current.permissionWalletCards.map((card) => card.token.unit)).toEqual([
      "unit-mine"
    ]);
    expect(result.current.filteredPermissionWalletCards).toHaveLength(1);
  });

  it("shows nothing to a key with no role anywhere, rather than a stranger's wallets", () => {
    const { result } = renderCards(
      [detectedToken("theirs", SOMEONE_ELSE), detectedToken("also-theirs", SOMEONE_ELSE)],
      MINE
    );

    expect(result.current.permissionWalletCards).toEqual([]);
    expect(result.current.defaultDetectedWalletUnit).toBeNull();
    expect(result.current.autoOpenDetectedWalletUnit).toBeNull();
  });

  it("auto-opens the single wallet a key does hold, ignoring the rest of the policy", () => {
    const { result } = renderCards(
      [detectedToken("theirs", SOMEONE_ELSE), detectedToken("mine", MINE)],
      MINE
    );

    expect(result.current.autoOpenDetectedWalletUnit).toBe("unit-mine");
    expect(result.current.defaultDetectedWalletUnit).toBe("unit-mine");
  });

  // A null key hash is not a verdict. The read-only demo wallet has no payment key by design
  // (`providers/wallet-provider.tsx`), and every role test is `wallets.includes(keyHash)`, so
  // scoping on a null key would answer "none of these is yours" for the whole network and
  // leave the demo tour with an empty picker.
  it("lists the policy when there is no key to scope by", () => {
    const { result } = renderCards(
      [detectedToken("mine", MINE), detectedToken("theirs", SOMEONE_ELSE)],
      null
    );

    expect(result.current.permissionWalletCards).toHaveLength(2);
  });

  // `detectSttInfo` keeps a token whose `plutusData` would not decode, and
  // `stateFormFromDatum(null)` answers with an EMPTY wallet, so an unreadable wallet claims
  // nobody is on it. It cannot be shown as the reader's, since nothing proves it is.
  it("does not claim a wallet whose datum could not be read", () => {
    const unreadable = { ...detectedToken("unreadable", MINE), datum: null };
    const { result } = renderCards([unreadable, detectedToken("mine", MINE)], MINE);

    expect(result.current.permissionWalletCards.map((card) => card.token.unit)).toEqual([
      "unit-mine"
    ]);
  });
});
