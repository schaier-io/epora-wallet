import type { ConstrData } from "@/lib/types/contracts";
import { getValidityWindow } from "@/lib/mesh/transactions/internals/core";
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { BrowserWallet, UTxO } from "@meshsdk/core";
import type { StateFormState, StreamingPaymentFormState } from "@/lib/contracts/state-form";
import type { OnChainStructuredAction } from "@/lib/contracts/action-data";
import type { CstTransactionInput, CstTransactionOutput } from "@/lib/mesh/cst";
import { CARDANO_MAX_TX_SIZE_BYTES } from "@/lib/mesh/transactions/internals/constants";
import { calculateMinimumLovelaceForOutput } from "@/lib/mesh/transactions/internals/value";
import { formatLovelaceAsAda } from "@/lib/units/lovelace";

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
      const match = /^txs\/([0-9a-f]+)\/utxos$/.exec(url);
      if (match) {
        return { outputs: [...chain.referencedUtxos.values()]
          .filter((utxo) => utxo.input.txHash === match[1])
          .map((utxo) => ({ output_index: utxo.input.outputIndex, consumed_by_tx: null })) };
      }
      return {};
    }
    async evaluateTx(txHex: string) {
      const { deserializeTx } = await import("@/lib/mesh/cst");
      const redeemerCount = deserializeTx(txHex).witnessSet().redeemers()?.size() ?? 0;
      return Array.from({ length: redeemerCount }, (_, index) => ({
        index,
        tag: "SPEND",
        budget: { mem: 700_000, steps: 300_000_000 }
      }));
    }
    async submitTx() {
      return "00".repeat(32);
    }
  }

  return { ServerFetcher };
});

const {
  pubKeyAddress,
  resolveScriptHash,
  serializeAddressObj,
  serializeData
} = await import("@meshsdk/core");
const { deserializeTx } = await import("@/lib/mesh/cst");
const { toScriptRef, toTxUnspentOutput } = await import("@meshsdk/core-cst");
const {
  getSttMintPolicyId,
  getSttSpendScript,
  getWalletSpendScript,
  resolveScriptAddress
} = await import("@/lib/contracts/blueprint");
const {
  createDefaultStateForm,
  stateFormToDatum,
  withFallbackAdminUserInStateForm
} = await import("@/lib/contracts/state-form");
const {
  buildSttSpendRedeemerData,
  buildWalletSpendRedeemerData,
  resolveStructuredOnChainAction
} = await import("@/lib/contracts/action-data");
const { buildStreamingPaymentPayoutTransfer } = await import(
  "@/lib/user-flow/guided-helpers"
);
const { buildSttSpendTx } = await import("@/lib/mesh/transactions/stt-spend");
const { buildConsolidateUtxosTx } = await import(
  "@/lib/mesh/transactions/consolidate-utxos"
);

const PAYMENT_ADDRESS = "addr_test1vqg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygxrcya6";
const PAYOUT_ADDRESS =
  "addr_test1qra89xrexu3vq28g5glatk44s96mysv345rvxsve4x5uh9vvmn2lu5e2ma4eavm9sx3jk5unu0n8vl93k0h3lcqkauwqpcpttu";
const PAYMENT_KEY_HASH = "11".repeat(28);
const STATE_TX_HASH = "22".repeat(32);
const REFERENCE_TX_HASH = "44".repeat(32);
const WALLET_REFERENCE_TX_HASH = "45".repeat(32);
const ASSET_NAME = "deadbeef";
const NATIVE_POLICY_ID = "ab".repeat(28);
const NATIVE_ASSET_NAME = "01";
const NATIVE_UNIT = `${NATIVE_POLICY_ID}${NATIVE_ASSET_NAME}`;
const SETTLEMENT_LOVELACE = 300_000n;
const REFERENCE_TIME_MS = 1_000_000;
const MAX_UINT64 = 18_446_744_073_709_551_615n;
const DAY_MS = 86_400_000n;
const DEEP_POLICY_COUNT = 151;

function adaUtxo(
  txByte: string,
  lovelace: string,
  address = PAYMENT_ADDRESS
): UTxO {
  return {
    input: { txHash: txByte.repeat(32), outputIndex: 0 },
    output: {
      address,
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

function transactionInputKey(input: CstTransactionInput) {
  return `${input.transactionId().toString()}#${input.index().toString()}`;
}

function nativeQuantity(output: CstTransactionOutput, unit: string) {
  const entries = output.amount().multiasset()?.entries() ?? [];
  for (const [assetId, quantity] of entries) {
    if (assetId.toString() === unit) {
      return BigInt(quantity.toString());
    }
  }
  return 0n;
}

function bigEndianHex(value: bigint | number, bytes: number) {
  return BigInt(value).toString(16).padStart(bytes * 2, "0");
}

function paymentAddress(keyHash: string) {
  return serializeAddressObj(pubKeyAddress(keyHash, undefined, undefined), 0);
}

function userWalletHash(userId: number, walletId: number) {
  return bigEndianHex(1_000 + userId * 100 + walletId, 28);
}

function allowanceEntries(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    policyId: bigEndianHex(1, 28),
    assetName: bigEndianHex(index + 1, 32),
    amount: MAX_UINT64.toString()
  }));
}

function scalarHeavyStreamingPayments(): StreamingPaymentFormState[] {
  return Array.from({ length: 15 }, (_, index) => {
    const paymentNumber = index + 1;
    const isLastPayment = paymentNumber === 15;
    return {
      id: (MAX_UINT64 - BigInt(index)).toString(),
      payoutAddress: paymentAddress(bigEndianHex(2_000 + paymentNumber, 28)),
      paidOutAmount: MAX_UINT64.toString(),
      policyId: bigEndianHex(
        isLastPayment ? 4_006 : 3_000 + paymentNumber,
        28
      ),
      assetName: bigEndianHex(isLastPayment ? 253 : paymentNumber, 32),
      amountPerDay: MAX_UINT64.toString(),
      startDate: (MAX_UINT64 - DAY_MS).toString(),
      endDate: MAX_UINT64.toString()
    };
  });
}

function cappedListAndScalarState(): StateFormState {
  const state = createDefaultStateForm();
  state.walletName = "\0".repeat(32);
  state.multiSigThresholdMode = "some";
  state.multiSigThreshold = MAX_UINT64.toString();
  state.proofOfLifeUnlockTimeMode = "some";
  state.proofOfLifeUnlockTime = MAX_UINT64.toString();
  state.proofOfLifeIncrementMode = "some";
  state.proofOfLifeIncrement = MAX_UINT64.toString();
  state.lastNonAdminPayoutAt = {
    alternative: 0,
    fields: [MAX_UINT64]
  };
  state.users = Array.from({ length: 10 }, (_, index) => {
    const userId = index + 1;
    const walletCount = userId === 10 ? 6 : 1;
    return {
      id: (MAX_UINT64 - BigInt(index)).toString(),
      wallets: Array.from({ length: walletCount }, (_, walletIndex) =>
        userWalletHash(userId, walletIndex + 1)
      ),
      perDayAllowance: userId === 1 ? allowanceEntries(5) : [],
      remainingAllowance: userId <= 2 ? allowanceEntries(5) : [],
      nextAllowanceReset: MAX_UINT64.toString(),
      canRenewProofOfLife: true,
      multiSigPowerMode: "some" as const,
      multiSigPower: MAX_UINT64.toString(),
      isAdmin: true,
      preset: "custom" as const
    };
  });
  state.beneficiaries = Array.from({ length: 5 }, (_, index) => {
    const beneficiaryNumber = index + 1;
    const walletStart =
      beneficiaryNumber === 1 ? 1 : beneficiaryNumber === 5 ? 6 : beneficiaryNumber + 1;
    const walletCount = beneficiaryNumber === 1 ? 2 : beneficiaryNumber === 5 ? 10 : 1;
    return {
      id: (MAX_UINT64 - BigInt(index)).toString(),
      wallets: Array.from({ length: walletCount }, (_, walletIndex) =>
        bigEndianHex(walletStart + walletIndex, 28)
      ),
      unlockAfterMode: "some" as const,
      unlockAfter: MAX_UINT64.toString(),
      weight: MAX_UINT64.toString()
    };
  });
  state.streamingPayments = scalarHeavyStreamingPayments();
  return state;
}

describe("buildConsolidateUtxosTx integration", () => {
  it.each([1, 3])("preserves %i canonical wallet inputs in one canonical wallet output", async (walletInputCount) => {
    const sttScript = getSttSpendScript();
    const policyId = getSttMintPolicyId();
    const stateAddress = resolveScriptAddress(sttScript);
    const walletScript = getWalletSpendScript({
      sttPolicyId: policyId,
      sttAssetNameHex: ASSET_NAME
    });
    const walletAddress = resolveScriptAddress(walletScript);
    const sttUnit = `${policyId}${ASSET_NAME}`;
    const stateDatum = stateFormToDatum(
      withFallbackAdminUserInStateForm(
        createDefaultStateForm(),
        PAYMENT_KEY_HASH
      )
    );
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
        scriptRef: String(toScriptRef(sttScript).toCbor()),
        scriptHash: resolveScriptHash(sttScript.code, sttScript.version)
      }
    } as UTxO;
    const walletReferenceUtxo = {
      input: { txHash: WALLET_REFERENCE_TX_HASH, outputIndex: 0 },
      output: {
        address: PAYMENT_ADDRESS,
        amount: [{ unit: "lovelace", quantity: "100000000" }],
        scriptRef: String(toScriptRef(walletScript).toCbor()),
        scriptHash: resolveScriptHash(walletScript.code, walletScript.version)
      }
    } as UTxO;
    const walletInputs = Array.from({ length: walletInputCount }, (_, index) => ({
      input: {
        txHash: (index + 7).toString().repeat(64),
        outputIndex: 0
      },
      output: {
        address: walletAddress,
        amount: [
          { unit: "lovelace", quantity: "10000000" },
          {
            unit: `${NATIVE_POLICY_ID}${(index + 1).toString(16).padStart(2, "0")}`,
            quantity: String(index + 1)
          }
        ]
      }
    } as UTxO));
    chain.addressUtxos.set(stateAddress, [stateUtxo]);
    chain.referencedUtxos.set(`${STATE_TX_HASH}#0`, stateUtxo);
    chain.referencedUtxos.set(`${REFERENCE_TX_HASH}#0`, referenceUtxo);
    chain.referencedUtxos.set(
      `${WALLET_REFERENCE_TX_HASH}#0`,
      walletReferenceUtxo
    );
    for (const walletInput of walletInputs) {
      chain.referencedUtxos.set(`${walletInput.input.txHash}#0`, walletInput);
    }

    const wallet = {
      getUtxos: async () => [
        walletReferenceUtxo,
        adaUtxo("aa", "20000000"),
        adaUtxo("bb", "7000000")
      ],
      getChangeAddress: async () => PAYMENT_ADDRESS,
      getUsedAddresses: async () => [PAYMENT_ADDRESS],
      getUnusedAddresses: async () => []
    } as unknown as BrowserWallet;

    const result = await buildConsolidateUtxosTx(
      wallet,
      {
        walletPolicyId: policyId,
        walletAssetNameHex: ASSET_NAME,
        sttAssetNameHex: ASSET_NAME,
        sttSpendReference: `${REFERENCE_TX_HASH}#0`,
        walletSpendReference: `${WALLET_REFERENCE_TX_HASH}#0`
      },
      {
        sttInputTxHash: STATE_TX_HASH,
        sttInputOutputIndex: 0,
        outputDatum: stateDatum,
        outputAssets: stateAmount,
        authorityPath: "admin",
        walletInputs: walletInputs.map((walletInput) => walletInput.input)
      }
    );

    const tx = deserializeTx(result.txHex);
    const transactionInputs = (
      tx.body().inputs() as { values(): CstTransactionInput[] }
    ).values();
    const walletOutputs = Array.from(
      (tx.body().outputs() as { values(): CstTransactionOutput[] }).values()
    ).filter(
      (output) => output.address().toBech32().toString() === walletAddress
    );
    const redeemers = (tx.witnessSet().redeemers() as unknown as {
      values(): { data(): { toCbor(): string } }[];
    } | undefined)?.values() ?? [];
    const expectedAction = resolveStructuredOnChainAction(
      "consolidate-utxo",
      "admin"
    );
    const expectedWalletRedeemer = serializeData(
      buildWalletSpendRedeemerData(expectedAction),
      "Mesh"
    );

    const redeemerCbors = redeemers.map((redeemer) => redeemer.data().toCbor());
    const referenceInputs = tx.body().referenceInputs()?.values() ?? [];
    const referenceInputKeys = referenceInputs.map(transactionInputKey);
    const transactionInputKeys = transactionInputs.map(transactionInputKey);
    const collateralInputKeys =
      tx.body().collateral()?.values().map(transactionInputKey) ?? [];
    expect(transactionInputs.length).toBeGreaterThan(walletInputCount + 1);
    expect(referenceInputKeys).toEqual(
      expect.arrayContaining([
        `${REFERENCE_TX_HASH}#0`,
        `${WALLET_REFERENCE_TX_HASH}#0`
      ])
    );
    expect(referenceInputKeys).toHaveLength(2);
    expect(transactionInputKeys).not.toContain(`${WALLET_REFERENCE_TX_HASH}#0`);
    expect(collateralInputKeys).not.toContain(`${WALLET_REFERENCE_TX_HASH}#0`);
    expect(tx.witnessSet().plutusV3Scripts()?.values() ?? []).toHaveLength(0);
    expect(walletOutputs).toHaveLength(1);
    expect(BigInt(walletOutputs[0]!.amount().coin().toString())).toBe(
      10_000_000n * BigInt(walletInputCount)
    );
    walletInputs.forEach((_, index) => {
      const unit = `${NATIVE_POLICY_ID}${(index + 1).toString(16).padStart(2, "0")}`;
      expect(nativeQuantity(walletOutputs[0]!, unit)).toBe(BigInt(index + 1));
    });
    expect(redeemerCbors).toHaveLength(walletInputCount + 1);
    expect(
      redeemerCbors.filter((redeemer) => redeemer === expectedWalletRedeemer)
    ).toHaveLength(walletInputCount);
    expect(redeemerCbors).toContain(
      serializeData(buildSttSpendRedeemerData(expectedAction), "Mesh")
    );
  });

  it("repartitions one wallet input with six native assets into two continuing outputs", async () => {
    const sttScript = getSttSpendScript();
    const policyId = getSttMintPolicyId();
    const stateAddress = resolveScriptAddress(sttScript);
    const walletScript = getWalletSpendScript({
      sttPolicyId: policyId,
      sttAssetNameHex: ASSET_NAME
    });
    const walletAddress = resolveScriptAddress(walletScript);
    const sttUnit = `${policyId}${ASSET_NAME}`;
    const stateDatum = stateFormToDatum(
      withFallbackAdminUserInStateForm(createDefaultStateForm(), PAYMENT_KEY_HASH)
    );
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
        scriptRef: String(toScriptRef(sttScript).toCbor()),
        scriptHash: resolveScriptHash(sttScript.code, sttScript.version)
      }
    } as UTxO;
    const nativeUnits = Array.from(
      { length: 6 },
      (_, index) => `${NATIVE_POLICY_ID}${(index + 1).toString(16).padStart(2, "0")}`
    );
    const walletInput = {
      input: { txHash: "99".repeat(32), outputIndex: 0 },
      output: {
        address: walletAddress,
        amount: [
          { unit: "lovelace", quantity: "12000000" },
          ...nativeUnits.map((unit) => ({ unit, quantity: "2" }))
        ]
      }
    } as UTxO;
    chain.addressUtxos.set(stateAddress, [stateUtxo]);
    chain.referencedUtxos.set(`${STATE_TX_HASH}#0`, stateUtxo);
    chain.referencedUtxos.set(`${REFERENCE_TX_HASH}#0`, referenceUtxo);
    chain.referencedUtxos.set(
      `${walletInput.input.txHash}#${walletInput.input.outputIndex}`,
      walletInput
    );

    const result = await buildConsolidateUtxosTx(
      {
        getUtxos: async () => [adaUtxo("aa", "20000000"), adaUtxo("bb", "7000000")],
        getChangeAddress: async () => PAYMENT_ADDRESS,
        getUsedAddresses: async () => [PAYMENT_ADDRESS],
        getUnusedAddresses: async () => []
      } as unknown as BrowserWallet,
      {
        walletPolicyId: policyId,
        walletAssetNameHex: ASSET_NAME,
        sttAssetNameHex: ASSET_NAME,
        sttSpendReference: `${REFERENCE_TX_HASH}#0`
      },
      {
        sttInputTxHash: STATE_TX_HASH,
        sttInputOutputIndex: 0,
        outputDatum: stateDatum,
        outputAssets: stateAmount,
        authorityPath: "admin",
        walletInputs: [walletInput.input],
        walletOutputs: [
          {
            amount: [
              { unit: "lovelace", quantity: "6000000" },
              ...nativeUnits.map((unit) => ({ unit, quantity: "1" }))
            ]
          },
          {
            amount: [
              { unit: "lovelace", quantity: "6000000" },
              ...nativeUnits.map((unit) => ({ unit, quantity: "1" }))
            ]
          }
        ]
      }
    );

    const tx = deserializeTx(result.txHex);
    const walletOutputs = Array.from(
      (tx.body().outputs() as { values(): CstTransactionOutput[] }).values()
    ).filter(
      (output) => output.address().toBech32().toString() === walletAddress
    );
    expect(walletOutputs).toHaveLength(2);
    for (const output of walletOutputs) {
      expect(output.amount().coin().toString()).toBe("6000000");
      for (const unit of nativeUnits) {
        expect(nativeQuantity(output, unit)).toBe(1n);
      }
    }
    expect(result.preview.summary).toBe(
      "Reorganize 1 wallet fund pool into 2 resulting fund pools."
    );
    expect(tx.witnessSet().plutusV3Scripts()?.values()).toHaveLength(1);
    expect(tx.witnessSet().redeemers()?.size()).toBe(2);
  });

  it("builds the capped-list 151-policy repartition with reference scripts", async () => {
    const sttScript = getSttSpendScript();
    const policyId = getSttMintPolicyId();
    const stateAddress = resolveScriptAddress(sttScript);
    const walletScript = getWalletSpendScript({
      sttPolicyId: policyId,
      sttAssetNameHex: ASSET_NAME
    });
    const walletAddress = resolveScriptAddress(walletScript);
    const stateDatum = stateFormToDatum(cappedListAndScalarState());
    const sttUnit = `${policyId}${ASSET_NAME}`;
    const stateAmount = [
      { unit: "lovelace", quantity: "30000000" },
      { unit: sttUnit, quantity: "1" }
    ];
    const nativeAssets = Array.from({ length: DEEP_POLICY_COUNT }, (_, index) => ({
      unit: bigEndianHex(index + 1, 28),
      quantity: "1"
    }));
    const walletInputAmount = [
      { unit: "lovelace", quantity: "30000000" },
      ...nativeAssets
    ];
    const narrowOutputAmount = [{ unit: "lovelace", quantity: "2000000" }];
    const wideOutputAmount = [
      { unit: "lovelace", quantity: "28000000" },
      ...nativeAssets
    ];
    const stateUtxo = {
      input: { txHash: STATE_TX_HASH, outputIndex: 0 },
      output: {
        address: stateAddress,
        amount: stateAmount,
        plutusData: serializeData(stateDatum, "Mesh")
      }
    } as UTxO;
    const walletInput = {
      input: { txHash: "56".repeat(32), outputIndex: 0 },
      output: {
        address: walletAddress,
        amount: walletInputAmount
      }
    } as UTxO;
    const sttReferenceUtxo = {
      input: { txHash: REFERENCE_TX_HASH, outputIndex: 0 },
      output: {
        address: PAYMENT_ADDRESS,
        amount: [{ unit: "lovelace", quantity: "100000000" }],
        scriptRef: String(toScriptRef(sttScript).toCbor()),
        scriptHash: resolveScriptHash(sttScript.code, sttScript.version)
      }
    } as UTxO;
    const walletReferenceUtxo = {
      input: { txHash: WALLET_REFERENCE_TX_HASH, outputIndex: 0 },
      output: {
        address: PAYMENT_ADDRESS,
        amount: [{ unit: "lovelace", quantity: "100000000" }],
        scriptRef: String(toScriptRef(walletScript).toCbor()),
        scriptHash: resolveScriptHash(walletScript.code, walletScript.version)
      }
    } as UTxO;
    chain.addressUtxos.set(stateAddress, [stateUtxo]);
    chain.referencedUtxos.set(`${STATE_TX_HASH}#0`, stateUtxo);
    chain.referencedUtxos.set(`${REFERENCE_TX_HASH}#0`, sttReferenceUtxo);
    chain.referencedUtxos.set(
      `${WALLET_REFERENCE_TX_HASH}#0`,
      walletReferenceUtxo
    );
    chain.referencedUtxos.set(
      `${walletInput.input.txHash}#${walletInput.input.outputIndex}`,
      walletInput
    );

    const adminAddress = paymentAddress(userWalletHash(10, 6));
    const result = await buildConsolidateUtxosTx(
      {
        getUtxos: async () => [
          adaUtxo("ca", "100000000", adminAddress),
          adaUtxo("cb", "10000000", adminAddress)
        ],
        getChangeAddress: async () => adminAddress,
        getUsedAddresses: async () => [adminAddress],
        getUnusedAddresses: async () => []
      } as unknown as BrowserWallet,
      {
        walletPolicyId: policyId,
        walletAssetNameHex: ASSET_NAME,
        sttAssetNameHex: ASSET_NAME,
        sttSpendReference: `${REFERENCE_TX_HASH}#0`,
        walletSpendReference: `${WALLET_REFERENCE_TX_HASH}#0`
      },
      {
        sttInputTxHash: STATE_TX_HASH,
        sttInputOutputIndex: 0,
        outputDatum: stateDatum,
        outputAssets: stateAmount,
        authorityPath: "admin",
        walletInputs: [walletInput.input],
        walletOutputs: [
          { amount: narrowOutputAmount },
          { amount: wideOutputAmount }
        ]
      }
    );

    const stateDatumBytes = serializeData(stateDatum, "Mesh").length / 2;
    const walletValueBytes =
      String(toTxUnspentOutput(walletInput).output().amount().toCbor()).length / 2;
    const expectedWideValueCbor = String(
      toTxUnspentOutput({
        ...walletInput,
        output: { ...walletInput.output, amount: wideOutputAmount }
      }).output().amount().toCbor()
    );
    const wideOutputMinimum = calculateMinimumLovelaceForOutput({
      address: walletAddress,
      amount: wideOutputAmount
    });
    const tx = deserializeTx(result.txHex);
    const outputs = Array.from(
      (tx.body().outputs() as { values(): CstTransactionOutput[] }).values()
    );
    const walletOutputs = outputs.filter(
      (output) => output.address().toBech32().toString() === walletAddress
    );
    const stateOutput = outputs.find(
      (output) => output.address().toBech32().toString() === stateAddress
    );
    const txSizeBytes = result.txHex.length / 2;
    const txMarginBytes = CARDANO_MAX_TX_SIZE_BYTES - txSizeBytes;
    const minimumExpectedTxMarginBytes = 5_000;

    expect(stateDatumBytes).toBe(5_110);
    expect(walletValueBytes).toBe(4_991);
    expect(wideOutputMinimum).toBeLessThanOrEqual(28_000_000n);
    expect(txSizeBytes).toBeLessThanOrEqual(CARDANO_MAX_TX_SIZE_BYTES);
    expect(txMarginBytes).toBeGreaterThanOrEqual(minimumExpectedTxMarginBytes);
    expect(tx.body().referenceInputs()?.values()).toHaveLength(2);
    expect(tx.witnessSet().plutusV3Scripts()?.values() ?? []).toHaveLength(0);
    expect(tx.witnessSet().redeemers()?.size()).toBe(2);
    expect(walletOutputs).toHaveLength(2);
    expect(walletOutputs[0]!.amount().coin().toString()).toBe("2000000");
    expect(walletOutputs[1]!.amount().coin().toString()).toBe("28000000");
    expect(walletOutputs[1]!.amount().toCbor()).toBe(expectedWideValueCbor);
    expect(stateOutput).toBeDefined();
    if (!stateOutput) {
      throw new Error("Continuing State output was not built.");
    }
    expect(stateOutput.amount().coin().toString()).toBe("30000000");
    expect(inlineDatumCbor(stateOutput)).toBe(serializeData(stateDatum, "Mesh"));
  });
});

describe("buildSttSpendTx ADA payout integration", () => {
  it.each(["use", "use-allowance", "use-beneficiary", "exit-beneficiary", "final-beneficiary-exit"] as const)("builds %s with two wallet-script inputs and preserves unrelated assets", async (mode) => {
    const action = mode === "final-beneficiary-exit" ? "exit-beneficiary" : mode;
    const isBeneficiary = action === "use-beneficiary" || action === "exit-beneficiary";
    const sttScript = getSttSpendScript();
    const policyId = getSttMintPolicyId();
    const stateAddress = resolveScriptAddress(sttScript);
    const walletScript = getWalletSpendScript({
      sttPolicyId: policyId,
      sttAssetNameHex: ASSET_NAME
    });
    const walletAddress = resolveScriptAddress(walletScript);
    const sttUnit = `${policyId}${ASSET_NAME}`;
    const stateForm = withFallbackAdminUserInStateForm(
      createDefaultStateForm(),
      PAYMENT_KEY_HASH
    );
    stateForm.users[0]!.perDayAllowance = [{ policyId: "", assetName: "", amount: "5000000" }];
    stateForm.users[0]!.remainingAllowance = stateForm.users[0]!.perDayAllowance;
    if (isBeneficiary) {
      stateForm.proofOfLifeUnlockTimeMode = "some";
      stateForm.proofOfLifeUnlockTime = "1";
      stateForm.proofOfLifeIncrementMode = "some";
      stateForm.proofOfLifeIncrement = "60";
      stateForm.beneficiaries = [PAYMENT_KEY_HASH, "77".repeat(28)].map((key, index) => ({
        id: String(index + 1), wallets: [key], unlockAfterMode: "none", unlockAfter: "", weight: "1"
      }));
    }
    if (mode === "final-beneficiary-exit") {
      stateForm.users = [];
      stateForm.multiSigThresholdMode = "none";
      stateForm.beneficiaries = stateForm.beneficiaries.slice(0, 1);
    }
    const unrelatedAssets = action !== "use"
      ? Array.from({ length: 6 }, (_, index) => ({
          unit: `${NATIVE_POLICY_ID}${(index + 1).toString(16).padStart(2, "0")}`,
          quantity: "1"
        }))
      : [];
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
        scriptRef: String(toScriptRef(sttScript).toCbor()),
        scriptHash: resolveScriptHash(sttScript.code, sttScript.version)
      }
    } as UTxO;
    const firstWalletInput = {
      input: { txHash: "55".repeat(32), outputIndex: 0 },
      output: {
        address: walletAddress,
        amount: [{ unit: "lovelace", quantity: "4000000" }, ...unrelatedAssets]
      }
    } as UTxO;
    const secondWalletInput = {
      input: { txHash: "66".repeat(32), outputIndex: 1 },
      output: {
        address: walletAddress,
        amount: [{ unit: "lovelace", quantity: "4000000" }, ...unrelatedAssets]
      }
    } as UTxO;
    chain.addressUtxos.set(stateAddress, [stateUtxo]);
    chain.referencedUtxos.set(`${STATE_TX_HASH}#0`, stateUtxo);
    chain.referencedUtxos.set(`${REFERENCE_TX_HASH}#0`, referenceUtxo);
    chain.referencedUtxos.set("55".repeat(32) + "#0", firstWalletInput);
    chain.referencedUtxos.set("66".repeat(32) + "#1", secondWalletInput);

    const wallet = {
      getUtxos: async () => [adaUtxo("aa", "20000000"), adaUtxo("bb", "7000000")],
      getChangeAddress: async () => PAYMENT_ADDRESS,
      getUsedAddresses: async () => [PAYMENT_ADDRESS],
      getUnusedAddresses: async () => []
    } as unknown as BrowserWallet;
    const operatorAction: OnChainStructuredAction = isBeneficiary ? {
      kind: action === "exit-beneficiary" ? "beneficiary-exit" : "beneficiary-withdrawal", beneficiaryId: 1n
    } : action === "use-allowance" ? {
      kind: "allowance-withdrawal",
      userId: BigInt(stateForm.users[0]!.id),
      spentAllowance: [{ unit: "lovelace", quantity: "3000000" }]
    } : {
      kind: "operator",
      operatorPath: "admin",
      operatorIntent: "use"
    };

    const result = await buildSttSpendTx(
      wallet,
      {
        walletPolicyId: policyId,
        walletAssetNameHex: ASSET_NAME,
        sttAssetNameHex: ASSET_NAME,
        sttSpendReference: `${REFERENCE_TX_HASH}#0`
      },
      action,
      {
        sttInputTxHash: STATE_TX_HASH,
        sttInputOutputIndex: 0,
        outputDatum: stateDatum,
        outputAssets: stateAmount,
        authorityPath: "admin",
        allowanceSignerKeyHash: PAYMENT_KEY_HASH,
        beneficiarySignerKeyHash: PAYMENT_KEY_HASH,
        walletInputs: [firstWalletInput.input, secondWalletInput.input],
        walletOutputs: [],
        extraTransfers: [
          {
            address: PAYOUT_ADDRESS,
            amount: [
              { unit: "lovelace", quantity: "3000000" },
              ...(isBeneficiary ? unrelatedAssets : [])
            ]
          }
        ],
        validityWindowReferenceTimeMs: REFERENCE_TIME_MS
      }
    );

    const tx = deserializeTx(result.txHex);
    const continuingWalletOutputs = Array.from(
      (tx.body().outputs() as { values(): CstTransactionOutput[] }).values()
    ).filter((output) => output.address().toBech32().toString() === walletAddress);
    expect(continuingWalletOutputs).toHaveLength(1);
    expect(BigInt(continuingWalletOutputs[0]!.amount().coin().toString())).toBe(5_000_000n);
    for (const asset of unrelatedAssets) {
      expect(nativeQuantity(continuingWalletOutputs[0]!, asset.unit)).toBe(isBeneficiary ? 1n : 2n);
    }
    const redeemers = (tx.witnessSet().redeemers() as unknown as {
      values(): { data(): { toCbor(): string } }[];
    } | undefined)?.values() ?? [];
    const redeemerCbors = redeemers.map((redeemer) => redeemer.data().toCbor());
    const expectedWalletRedeemer = serializeData(
      buildWalletSpendRedeemerData(operatorAction),
      "Mesh"
    );
    expect(redeemerCbors).toHaveLength(3);
    expect(
      redeemerCbors.filter((redeemer) => redeemer === expectedWalletRedeemer)
    ).toHaveLength(2);
    expect(redeemerCbors).toContain(
      serializeData(buildSttSpendRedeemerData(operatorAction), "Mesh")
    );

    if (action === "exit-beneficiary") {
      expect(result.warnings).toContain("The connected wallet funds the transaction fee externally.");
      const outputs = Array.from((tx.body().outputs() as { values(): CstTransactionOutput[] }).values());
      const stateOutput = outputs.find((output) => output.address().toBech32().toString() === stateAddress)!;
      const expectedState = structuredClone(stateDatum);
      const access = expectedState.fields[0] as ConstrData;
      access.fields[2] = (access.fields[2] as ConstrData[]).slice(1);
      if (mode === "final-beneficiary-exit") {
        expectedState.fields[5] = { alternative: 0, fields: [getValidityWindow(REFERENCE_TIME_MS).latestTimeMs] };
      }
      expect(inlineDatumCbor(stateOutput)).toBe(serializeData(expectedState, "Mesh"));
    }

    const expectedWalletInputRefs = new Set([
      "55".repeat(32) + "#0",
      "66".repeat(32) + "#1"
    ]);
    const walletBudgetRefs = result.executionUnits?.redeemers
      .map((redeemer) => redeemer.reference)
      .filter(
        (reference): reference is string =>
          typeof reference === "string" && expectedWalletInputRefs.has(reference)
      );
    expect(walletBudgetRefs).toEqual(
      expect.arrayContaining(["55".repeat(32) + "#0", "66".repeat(32) + "#1"])
    );
    expect(new Set(walletBudgetRefs).size).toBe(2);
  });

  it("keeps settlement at 300k and permits ordinary change without a wallet-script input", async () => {
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
    ).toBe(true);

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
      `ADA payout top-up: ${formatLovelaceAsAda(payoutLovelace - SETTLEMENT_LOVELACE)} ADA extra goes to ${PAYOUT_ADDRESS}. Final output: ${formatLovelaceAsAda(payoutLovelace)} ADA. Scheduled settlement: 0.3 ADA. Review before signing.`
    );
  });

  it("builds three mixed ADA and native payouts with ordinary wallet change", async () => {
    const script = getSttSpendScript();
    const policyId = getSttMintPolicyId();
    const stateAddress = resolveScriptAddress(script);
    const walletScript = getWalletSpendScript({
      sttPolicyId: policyId,
      sttAssetNameHex: ASSET_NAME
    });
    const walletAddress = resolveScriptAddress(walletScript);
    const sttUnit = `${policyId}${ASSET_NAME}`;
    const stateForm = withFallbackAdminUserInStateForm(
      createDefaultStateForm(),
      PAYMENT_KEY_HASH
    );
    stateForm.streamingPayments = [
      {
        id: "7",
        payoutAddress: PAYOUT_ADDRESS,
        paidOutAmount: "0",
        policyId: "",
        assetName: "",
        amountPerDay: "86400000",
        startDate: "0",
        endDate: "10000000"
      },
      {
        id: "8",
        payoutAddress: PAYOUT_ADDRESS,
        paidOutAmount: "0",
        policyId: NATIVE_POLICY_ID,
        assetName: NATIVE_ASSET_NAME,
        amountPerDay: "86400000",
        startDate: "0",
        endDate: "10000000"
      },
      {
        id: "9",
        payoutAddress: PAYOUT_ADDRESS,
        paidOutAmount: "0",
        policyId: "",
        assetName: "",
        amountPerDay: "86400000",
        startDate: "0",
        endDate: "10000000"
      }
    ];
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

    const nativeUtxo = {
      input: { txHash: "dd".repeat(32), outputIndex: 0 },
      output: {
        address: PAYMENT_ADDRESS,
        amount: [
          { unit: "lovelace", quantity: "10000000" },
          { unit: NATIVE_UNIT, quantity: "100" }
        ]
      }
    } as UTxO;
    const collateral = adaUtxo("bb", "7000000");
    const wallet = {
      getUtxos: async () => [nativeUtxo, collateral],
      getChangeAddress: async () => PAYMENT_ADDRESS,
      getUsedAddresses: async () => [PAYMENT_ADDRESS],
      getUnusedAddresses: async () => []
    } as unknown as BrowserWallet;
    const transfers = [
      buildStreamingPaymentPayoutTransfer(
        stateForm.streamingPayments[0]!,
        SETTLEMENT_LOVELACE.toString(),
        "ff".repeat(32),
        9
      ),
      buildStreamingPaymentPayoutTransfer(
        stateForm.streamingPayments[1]!,
        "10",
        "ff".repeat(32),
        9
      ),
      buildStreamingPaymentPayoutTransfer(
        stateForm.streamingPayments[2]!,
        SETTLEMENT_LOVELACE.toString(),
        "ff".repeat(32),
        9
      )
    ];

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
        extraTransfers: transfers,
        validityWindowReferenceTimeMs: REFERENCE_TIME_MS
      }
    );

    const tx = deserializeTx(result.txHex);
    const outputs = Array.from(
      (tx.body().outputs() as { values(): CstTransactionOutput[] }).values()
    );
    expect(outputs).toHaveLength(5);
    const payoutOutputs = outputs.filter(
      (output) => output.address().toBech32().toString() === PAYOUT_ADDRESS
    );
    expect(payoutOutputs).toHaveLength(3);
    expect(new Set(payoutOutputs.map(inlineDatumCbor))).toEqual(
      new Set(
        [7, 8, 9].map((id) =>
          serializeData(
            { alternative: 0, fields: [id, STATE_TX_HASH, 0] },
            "Mesh"
          )
        )
      )
    );
    expect(
      payoutOutputs.some((output) => nativeQuantity(output, NATIVE_UNIT) === 10n)
    ).toBe(true);

    const changeOutput = outputs.find(
      (output) => output.address().toBech32().toString() === PAYMENT_ADDRESS
    );
    expect(changeOutput).toBeDefined();
    if (!changeOutput) throw new Error("Ordinary wallet change was not built.");
    expect(nativeQuantity(changeOutput, NATIVE_UNIT)).toBe(90n);

    const redeemers = (tx.witnessSet().redeemers() as unknown as {
      values(): { data(): { toCbor(): string } }[];
    } | undefined)?.values() ?? [];
    expect(redeemers).toHaveLength(1);
    expect(redeemers[0]!.data().toCbor()).toBe(
      serializeData(
        buildSttSpendRedeemerData({
          kind: "streaming-payment-payout",
          payoutDelta: [
            {
              unit: "lovelace",
              quantity: (SETTLEMENT_LOVELACE * 2n).toString()
            },
            { unit: NATIVE_UNIT, quantity: "10" }
          ]
        }),
        "Mesh"
      )
    );

    const lockedWalletInput = {
      input: { txHash: "ee".repeat(32), outputIndex: 0 },
      output: {
        address: walletAddress,
        amount: [
          { unit: "lovelace", quantity: "5000000" },
          { unit: NATIVE_UNIT, quantity: "100" }
        ]
      }
    } as UTxO;
    chain.referencedUtxos.set(
      `${lockedWalletInput.input.txHash}#${lockedWalletInput.input.outputIndex}`,
      lockedWalletInput
    );
    const lockedFundingUtxos = [10, 15, 20, 25, 30, 35, 40].map(
      (lovelace, index) =>
        adaUtxo((index + 1).toString(16).padStart(2, "0"), `${lovelace}000000`)
    );
    const lockedResult = await buildSttSpendTx(
      {
        getUtxos: async () => [...lockedFundingUtxos, collateral],
        getChangeAddress: async () => PAYMENT_ADDRESS,
        getUsedAddresses: async () => [PAYMENT_ADDRESS],
        getUnusedAddresses: async () => []
      } as unknown as BrowserWallet,
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
        walletInputs: [lockedWalletInput.input],
        walletOutputs: [],
        extraTransfers: transfers,
        validityWindowReferenceTimeMs: REFERENCE_TIME_MS
      }
    );

    const lockedTx = deserializeTx(lockedResult.txHex);
    const lockedOutputs = Array.from(
      (lockedTx.body().outputs() as { values(): CstTransactionOutput[] }).values()
    );
    expect(
      lockedOutputs.some(
        (output) => output.address().toBech32().toString() === PAYMENT_ADDRESS
      )
    ).toBe(false);
    const lockedPayoutOutputs = lockedOutputs.filter(
      (output) => output.address().toBech32().toString() === PAYOUT_ADDRESS
    );
    expect(lockedPayoutOutputs).toHaveLength(3);
    const continuingWalletOutput = lockedOutputs.find(
      (output) => output.address().toBech32().toString() === walletAddress
    );
    expect(continuingWalletOutput).toBeDefined();
    if (!continuingWalletOutput) {
      throw new Error("Continuing wallet output was not built.");
    }
    expect(continuingWalletOutput.amount().coin().toString()).toBe("4400000");
    expect(nativeQuantity(continuingWalletOutput, NATIVE_UNIT)).toBe(90n);
    expect(lockedTx.witnessSet().redeemers()?.size()).toBe(2);
  });
});

it("returns the actual deployed reference output index without store discovery", async () => {
  const { buildDeploySharedSttReferenceTx } = await import("./deploy-shared-reference");
  const { resolveSttReferenceStoreAddress } = await import("@/lib/contracts/blueprint");
  const wallet = {
    getUtxos: async () => [adaUtxo("aa", "200000000"), adaUtxo("bb", "7000000")],
    getChangeAddress: async () => PAYMENT_ADDRESS,
    getUsedAddresses: async () => [PAYMENT_ADDRESS],
    getUnusedAddresses: async () => []
  } as unknown as BrowserWallet;
  const result = await buildDeploySharedSttReferenceTx(wallet);
  const outputs = deserializeTx(result.txHex).body().outputs() as CstTransactionOutput[];
  expect(Number.isSafeInteger(result.referenceScriptOutputIndex)).toBe(true);
  expect(outputs[result.referenceScriptOutputIndex!]!.address().toBech32().toString())
    .toBe(resolveSttReferenceStoreAddress());
});
