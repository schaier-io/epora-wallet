// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserWallet } from "@meshsdk/core";

import type { PayeeStreamingPayment } from "@/components/payee/collect-payee-streaming-payments";
import type { ConstrData } from "@/lib/types/contracts";

const mocks = vi.hoisted(() => ({
  buildSttSpendTx: vi.fn(),
  signAndSubmitTx: vi.fn(),
  walletInputs: [
    { txHash: "66".repeat(32), outputIndex: 0 },
    { txHash: "77".repeat(32), outputIndex: 1 }
  ]
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
    walletInputs: mocks.walletInputs
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

const NONE: ConstrData = { alternative: 1, fields: [] };
const FALSE: ConstrData = { alternative: 0, fields: [] };
const TRUE: ConstrData = { alternative: 1, fields: [] };
const PAYEE_KEY_HASH = "44".repeat(28);
const PAYEE_ADDRESS: ConstrData = {
  alternative: 0,
  fields: [{ alternative: 0, fields: [PAYEE_KEY_HASH] }, NONE]
};
const ordinaryStateDatum: ConstrData = {
  alternative: 0,
  fields: [
    { alternative: 0, fields: [[], NONE, []] },
    { alternative: 0, fields: [NONE, NONE] },
    [
      {
        alternative: 0,
        fields: [7, PAYEE_ADDRESS, 0, "", "", 1, 0, 2]
      }
    ],
    "",
    NONE,
    NONE
  ]
};

function finalRecoveryStateDatum(beneficiaryKeyHash: string): ConstrData {
  return {
    ...ordinaryStateDatum,
    fields: [
      {
        alternative: 0,
        fields: [
          [],
          NONE,
          [
            {
              alternative: 0,
              fields: [7, [beneficiaryKeyHash], { alternative: 0, fields: [1] }, 1]
            }
          ]
        ]
      },
      {
        alternative: 0,
        fields: [
          { alternative: 0, fields: [1] },
          { alternative: 0, fields: [1] }
        ]
      },
      ...ordinaryStateDatum.fields.slice(2)
    ]
  };
}

function finalRecoveryAdminStateDatum(adminKeyHash: string): ConstrData {
  const datum = finalRecoveryStateDatum("55".repeat(28));
  const access = datum.fields[0] as ConstrData;
  return {
    ...datum,
    fields: [
      {
        ...access,
        fields: [
          [
            {
              alternative: 0,
              fields: [0, [adminKeyHash], [], [], 0, FALSE, NONE, TRUE]
            }
          ],
          ...access.fields.slice(1)
        ]
      },
      ...datum.fields.slice(1)
    ]
  };
}

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

  it("refuses a payout top-up before asking the wallet to sign", async () => {
    mocks.buildSttSpendTx.mockResolvedValue({
      txHex: "00",
      warnings: ["ADA payout top-up: extra sent to the payee 1.2 ADA."]
    });

    await expect(
      runPayeeCollect({
        wallet: {} as BrowserWallet,
        payment,
        stateDatum: ordinaryStateDatum,
        payeePaymentKeyHash: PAYEE_KEY_HASH,
        nowMs: 1
      })
    ).rejects.toThrow(/requires review before signing.*extra sent to the payee/);
    expect(mocks.signAndSubmitTx).not.toHaveBeenCalled();
  });

  it("refuses a native-token payout min-UTxO top-up before signing", async () => {
    mocks.buildSttSpendTx.mockResolvedValue({
      txHex: "00",
      warnings: ["ADA payout top-up: extra sent to the payee 1.5 ADA."]
    });

    await expect(
      runPayeeCollect({
        wallet: {} as BrowserWallet,
        payment: { ...payment, policyId: "55".repeat(28), assetName: "01" },
        stateDatum: ordinaryStateDatum,
        payeePaymentKeyHash: PAYEE_KEY_HASH,
        nowMs: 1
      })
    ).rejects.toThrow(/requires review before signing.*extra sent to the payee/);
    expect(mocks.signAndSubmitTx).not.toHaveBeenCalled();
  });

  it("submits a warned payout only after explicit approval", async () => {
    const confirmWarnings = vi.fn(() => true);
    mocks.buildSttSpendTx.mockResolvedValue({
      txHex: "00",
      warnings: ["ADA payout top-up: extra sent to the payee 7 ADA."]
    });
    mocks.signAndSubmitTx.mockResolvedValue("88".repeat(32));

    await expect(
      runPayeeCollect({
        wallet: {} as BrowserWallet,
        payment,
        stateDatum: ordinaryStateDatum,
        payeePaymentKeyHash: PAYEE_KEY_HASH,
        nowMs: 1,
        confirmWarnings
      })
    ).resolves.toBe("88".repeat(32));

    expect(confirmWarnings).toHaveBeenCalledWith([
      "ADA payout top-up: extra sent to the payee 7 ADA."
    ]);
    expect(mocks.signAndSubmitTx).toHaveBeenCalledWith(
      expect.anything(),
      "00"
    );
  });

  it("blocks payee collection when final recovery requires beneficiary consent", async () => {
    await expect(
      runPayeeCollect({
        wallet: {} as BrowserWallet,
        payment,
        stateDatum: finalRecoveryStateDatum("55".repeat(28)),
        payeePaymentKeyHash: PAYEE_KEY_HASH,
        nowMs: 1
      })
    ).rejects.toThrow(/final backup person must approve payments/);
    expect(mocks.buildSttSpendTx).not.toHaveBeenCalled();
    expect(mocks.signAndSubmitTx).not.toHaveBeenCalled();
  });

  it("lets an admin payee collect after final recovery opens during cooldown", async () => {
    mocks.buildSttSpendTx.mockResolvedValue({ txHex: "00" });
    mocks.signAndSubmitTx.mockResolvedValue("88".repeat(32));

    await expect(
      runPayeeCollect({
        wallet: {} as BrowserWallet,
        payment: { ...payment, lastNonAdminPayoutAt: 1 },
        stateDatum: finalRecoveryAdminStateDatum(PAYEE_KEY_HASH),
        payeePaymentKeyHash: PAYEE_KEY_HASH,
        nowMs: 1
      })
    ).resolves.toBe("88".repeat(32));
  });

  it("forwards every selected fund pool to the payout builder", async () => {
    mocks.buildSttSpendTx.mockResolvedValue({ txHex: "00" });
    mocks.signAndSubmitTx.mockResolvedValue("88".repeat(32));

    await expect(
      runPayeeCollect({
        wallet: {} as BrowserWallet,
        payment,
        stateDatum: ordinaryStateDatum,
        payeePaymentKeyHash: PAYEE_KEY_HASH,
        nowMs: 1
      })
    ).resolves.toBe("88".repeat(32));

    expect(mocks.buildSttSpendTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "payout-streaming-payment",
      expect.objectContaining({ walletInputs: mocks.walletInputs })
    );
  });
});
