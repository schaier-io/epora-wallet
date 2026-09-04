// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { BrowserWallet, UTxO } from "@meshsdk/core";
import type { CstTransactionOutput } from "@/lib/mesh/cst";

const chain = vi.hoisted(() => ({
  addressUtxos: new Map<string, UTxO[]>(),
  referencedUtxos: new Map<string, UTxO>()
}));

vi.mock("@/lib/mesh/server-fetcher", async () => {
  const {
    DEFAULT_PROTOCOL_PARAMETERS,
    DEFAULT_V1_COST_MODEL_LIST,
    DEFAULT_V2_COST_MODEL_LIST,
    DEFAULT_V3_COST_MODEL_LIST
  } = await import("@meshsdk/common");

  class ServerFetcher {
    async fetchProtocolParameters() {
      return DEFAULT_PROTOCOL_PARAMETERS;
    }
    async fetchCostModels() {
      return [DEFAULT_V1_COST_MODEL_LIST, DEFAULT_V2_COST_MODEL_LIST, DEFAULT_V3_COST_MODEL_LIST];
    }
    async fetchAddressUTxOs(address: string) {
      return chain.addressUtxos.get(address) ?? [];
    }
    async fetchUTxOs(txHash: string, outputIndex?: number) {
      const utxo = chain.referencedUtxos.get(`${txHash}#${outputIndex ?? 0}`);
      return utxo ? [utxo] : [];
    }
    async get(url: string) {
      if (url.includes("epochs/latest/parameters")) {
        return {
          cost_models_raw: {
            PlutusV1: DEFAULT_V1_COST_MODEL_LIST,
            PlutusV2: DEFAULT_V2_COST_MODEL_LIST,
            PlutusV3: DEFAULT_V3_COST_MODEL_LIST
          }
        };
      }
      return {};
    }
    async evaluateTx() {
      return [{ index: 0, tag: "SPEND", budget: { mem: 700_000, steps: 300_000_000 } }];
    }
    async submitTx() {
      return "00".repeat(32);
    }
  }

  return { ServerFetcher };
});

const { resolveScriptHash, serializeData } = await import("@meshsdk/core");
const { deserializeTx } = await import("@/lib/mesh/cst");
const { toScriptRef } = await import("@meshsdk/core-cst");
const {
  getSttMintPolicyId,
  getSttSpendScript,
  resolveScriptAddress
} = await import("@/lib/contracts/blueprint");
const {
  createDefaultStateForm,
  stateFormToDatum,
  withFallbackAdminUserInStateForm
} = await import("@/lib/contracts/state-form");
const { buildSttSpendRedeemerData } = await import("@/lib/contracts/action-data");
const { buildStreamingPaymentPayoutTransfer } = await import(
  "@/lib/user-flow/guided-helpers"
);
const { buildSttSpendTx } = await import("@/lib/mesh/transactions/stt-spend");

const PAYMENT_ADDRESS = "addr_test1vqg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygxrcya6";
const PAYOUT_ADDRESS =
  "addr_test1qra89xrexu3vq28g5glatk44s96mysv345rvxsve4x5uh9vvmn2lu5e2ma4eavm9sx3jk5unu0n8vl93k0h3lcqkauwqpcpttu";
const PAYMENT_KEY_HASH = "11".repeat(28);
const STATE_TX_HASH = "22".repeat(32);
const REFERENCE_TX_HASH = "44".repeat(32);
const ASSET_NAME = "deadbeef";
const SETTLEMENT_LOVELACE = 300_000n;
const REFERENCE_TIME_MS = 1_000_000;

function adaUtxo(txByte: string, lovelace: string): UTxO {
  return {
    input: { txHash: txByte.repeat(32), outputIndex: 0 },
    output: {
      address: PAYMENT_ADDRESS,
      amount: [{ unit: "lovelace", quantity: lovelace }]
    }
  } as UTxO;
}

function inlineDatumCbor(output: CstTransactionOutput) {
  const inlineDatum = output.datum()?.asInlineData?.() as
    | { toCbor(): string }
    | undefined;
  return inlineDatum?.toCbor();
}

describe("buildSttSpendTx ADA payout integration", () => {
  it("keeps settlement at 300k and absorbs only the smallest funding excess into the tagged payout", async () => {
    const script = getSttSpendScript();
    const policyId = getSttMintPolicyId();
    const stateAddress = resolveScriptAddress(script);
    const sttUnit = `${policyId}${ASSET_NAME}`;
    const stateForm = withFallbackAdminUserInStateForm(
      createDefaultStateForm(),
      PAYMENT_KEY_HASH
    );
    stateForm.streamingPayments = [{
      id: "7",
      payoutAddress: PAYOUT_ADDRESS,
      paidOutAmount: "0",
      policyId: "",
      assetName: "",
      amountPerDay: "86400000",
      startDate: "0",
      endDate: "10000000"
    }];
    const stateDatum = stateFormToDatum(stateForm);
    const stateAmount = [
      { unit: "lovelace", quantity: "2000000" },
      { unit: sttUnit, quantity: "1" }
    ];
    const stateUtxo = {
      input: { txHash: STATE_TX_HASH, outputIndex: 0 },
      output: {
        address: stateAddress,
        amount: stateAmount,
        plutusData: serializeData(stateDatum, "Mesh")
      }
    } as UTxO;
    const referenceUtxo = {
      input: { txHash: REFERENCE_TX_HASH, outputIndex: 0 },
      output: {
        address: PAYMENT_ADDRESS,
        amount: [{ unit: "lovelace", quantity: "2000000" }],
        scriptRef: String(toScriptRef(script).toCbor()),
        scriptHash: resolveScriptHash(script.code, script.version)
      }
    } as UTxO;
    chain.addressUtxos.set(stateAddress, [stateUtxo]);
    chain.referencedUtxos.set(`${STATE_TX_HASH}#0`, stateUtxo);
    chain.referencedUtxos.set(`${REFERENCE_TX_HASH}#0`, referenceUtxo);

    const fiveAda = adaUtxo("aa", "5000000");
    const collateral = adaUtxo("bb", "7000000");
    const thousandAda = adaUtxo("cc", "1000000000");
    const wallet = {
      getUtxos: async () => [thousandAda, collateral, fiveAda],
      getChangeAddress: async () => PAYMENT_ADDRESS,
      getUsedAddresses: async () => [PAYMENT_ADDRESS],
      getUnusedAddresses: async () => []
    } as unknown as BrowserWallet;
    const transfer = buildStreamingPaymentPayoutTransfer(
      stateForm.streamingPayments[0]!,
      SETTLEMENT_LOVELACE.toString(),
      "ff".repeat(32),
      9
    );

    const result = await buildSttSpendTx(
      wallet,
      {
        walletPolicyId: policyId,
        walletAssetNameHex: ASSET_NAME,
        sttAssetNameHex: ASSET_NAME,
        sttSpendReference: `${REFERENCE_TX_HASH}#0`
      },
      "payout-streaming-payment",
      {
        sttInputTxHash: STATE_TX_HASH,
        sttInputOutputIndex: 0,
        outputDatum: stateDatum,
        outputAssets: stateAmount,
        crankSignerKeyHash: PAYMENT_KEY_HASH,
        walletInputs: [],
        walletOutputs: [],
        extraTransfers: [transfer],
        validityWindowReferenceTimeMs: REFERENCE_TIME_MS
      }
    );

    const tx = deserializeTx(result.txHex);
    const outputs = Array.from(
      (tx.body().outputs() as { values(): CstTransactionOutput[] }).values()
    );
    const payoutOutput = outputs.find(
      (output) => output.address().toBech32().toString() === PAYOUT_ADDRESS
    );
    expect(payoutOutput).toBeDefined();
    if (!payoutOutput) throw new Error("Payout output was not built.");
    const payoutLovelace = BigInt(payoutOutput.amount().coin().toString());
    expect(payoutLovelace).toBeGreaterThan(SETTLEMENT_LOVELACE);
    expect(payoutLovelace).toBeLessThan(5_000_000n);
    expect(
      outputs.some((output) => output.address().toBech32().toString() === PAYMENT_ADDRESS)
    ).toBe(false);

    const payoutTag = {
      alternative: 0,
      fields: [7, STATE_TX_HASH, 0]
    };
    expect(inlineDatumCbor(payoutOutput)).toBe(serializeData(payoutTag, "Mesh"));

    const expectedStateForm = withFallbackAdminUserInStateForm(
      createDefaultStateForm(),
      PAYMENT_KEY_HASH
    );
    expectedStateForm.streamingPayments = [{
      ...stateForm.streamingPayments[0]!,
      paidOutAmount: SETTLEMENT_LOVELACE.toString()
    }];
    const stateOutput = outputs.find(
      (output) => output.address().toBech32().toString() === stateAddress
    );
    expect(stateOutput).toBeDefined();
    if (!stateOutput) throw new Error("Continuing State output was not built.");
    expect(inlineDatumCbor(stateOutput)).toBe(
      serializeData(stateFormToDatum(expectedStateForm), "Mesh")
    );

    const redeemers = (tx.witnessSet().redeemers() as unknown as {
      values(): { data(): { toCbor(): string } }[];
    } | undefined)?.values() ?? [];
    expect(redeemers).toHaveLength(1);
    expect(redeemers[0]!.data().toCbor()).toBe(
      serializeData(
        buildSttSpendRedeemerData({
          kind: "streaming-payment-payout",
          payoutDelta: [{ unit: "lovelace", quantity: SETTLEMENT_LOVELACE.toString() }]
        }),
        "Mesh"
      )
    );
    expect(result.warnings).toContain(
      `ADA payout top-up: tagged outputs total ${payoutLovelace} lovelace; settlement delta 300000 lovelace; spender-funded extra ${payoutLovelace - SETTLEMENT_LOVELACE} lovelace. Review this extra amount before signing.`
    );
  });
});
