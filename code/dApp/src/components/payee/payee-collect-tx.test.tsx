// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserWallet } from "@meshsdk/core";

import type { PayeeStreamingPayment } from "@/components/payee/collect-payee-streaming-payments";

const mocks = vi.hoisted(() => ({
  buildSttSpendTx: vi.fn(),
  signAndSubmitTx: vi.fn()
}));

vi.mock("@/components/payee/payee-collect", () => ({
  planPayeeCollect: () => ({
    status: "ready",
    quantity: "300000",
    unit: "lovelace",
    transfers: [{
      address: "addr_test1qpayee",
      amount: [{ unit: "lovelace", quantity: "300000" }]
    }],
    walletInputs: []
  })
}));
vi.mock("@/components/user/workspace/helpers", () => ({
  fetchScriptUtxos: vi.fn(async () => [])
}));
vi.mock("@/lib/contracts/blueprint", () => ({
  resolveWalletContinuingOutputAddressFromState: () => "addr_test1qwallet"
}));
vi.mock("@/lib/mesh/transactions", () => ({
  buildSttSpendTx: mocks.buildSttSpendTx,
  getValidityWindow: () => ({ earliestTimeMs: 1, latestTimeMs: 2 }),
  signAndSubmitTx: mocks.signAndSubmitTx
}));

const { runPayeeCollect } = await import("@/components/payee/payee-collect-tx");

const payment: PayeeStreamingPayment = {
  streamingPaymentId: 7,
  policyId: "",
  assetName: "",
  amountPerDay: 1,
  startDate: 0,
  endDate: 2,
  paidOutAmount: 0,
  payerWalletName: "Wallet",
  payoutAddress: "addr_test1qpayee",
  lastNonAdminPayoutAt: null,
  sttInputTxHash: "11".repeat(32),
  sttInputOutputIndex: 0,
  sttPolicyId: "22".repeat(28),
  sttAssetNameHex: "33"
};

describe("runPayeeCollect", () => {
  beforeEach(() => {
    mocks.buildSttSpendTx.mockReset();
    mocks.signAndSubmitTx.mockReset();
  });

  it("refuses a spender-funded top-up before asking the wallet to sign", async () => {
    mocks.buildSttSpendTx.mockResolvedValue({
      txHex: "00",
      warnings: ["ADA payout top-up: spender-funded extra 1200000 lovelace."]
    });

    await expect(
      runPayeeCollect({
        wallet: {} as BrowserWallet,
        payment,
        stateDatum: { alternative: 0, fields: [] },
        payeePaymentKeyHash: "44".repeat(28),
        nowMs: 1
      })
    ).rejects.toThrow(/requires review before signing.*spender-funded extra/);
    expect(mocks.signAndSubmitTx).not.toHaveBeenCalled();
  });

  it("refuses a native-token payout min-UTxO top-up before signing", async () => {
    mocks.buildSttSpendTx.mockResolvedValue({
      txHex: "00",
      warnings: ["ADA payout top-up: spender-funded extra 1500000 lovelace."]
    });

    await expect(
      runPayeeCollect({
        wallet: {} as BrowserWallet,
        payment: { ...payment, policyId: "55".repeat(28), assetName: "01" },
        stateDatum: { alternative: 0, fields: [] },
        payeePaymentKeyHash: "44".repeat(28),
        nowMs: 1
      })
    ).rejects.toThrow(/requires review before signing.*spender-funded extra/);
    expect(mocks.signAndSubmitTx).not.toHaveBeenCalled();
  });
});
