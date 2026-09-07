import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  pubKeyAddress,
  resolveScriptHash,
  scriptAddress,
  serializeAddressObj,
  serializeData,
  type UTxO
} from "@meshsdk/core";
import {
  toScriptRef,
  toTxUnspentOutput
} from "@meshsdk/core-cst";
import {
  getSttMintPolicyId,
  getSttSpendScript,
  getWalletSpendScript,
  resolveScriptAddress
} from "@/lib/contracts/blueprint";
import {
  createDefaultStateForm,
  stateFormToDatum,
  type StateFormState,
  type StreamingPaymentFormState
} from "@/lib/contracts/state-form";
import { buildSttSpendTx } from "@/lib/mesh/transactions/stt-spend";
import { buildConsolidateUtxosTx } from "@/lib/mesh/transactions/consolidate-utxos";
import { buildStreamingPaymentPayoutTransfer } from "@/lib/user-flow/guided-helpers";
import {
  deserializeTx,
  type CstKeyHash,
  type CstTransactionInput,
  type CstTransactionOutput
} from "@/lib/mesh/cst";
import {
  assertExactJson,
  createFixtureFetcher,
  createFixtureWallet,
  describeScriptInputs,
  describeStateShape
} from "./entrypoint-budget-fixture-support";

const MAX_UINT64 = 18_446_744_073_709_551_615n;
const DAY_MS = 86_400_000n;
const REFERENCE_TIME_MS = 2_000_000_000_000;
const STT_TX_HASH = "22".repeat(32);
const STT_REFERENCE_TX_HASH = "44".repeat(32);
const WALLET_REFERENCE_TX_HASH = "45".repeat(32);
const WALLET_TX_HASH = "55".repeat(32);
const CONSOLIDATION_WALLET_TX_HASH = "56".repeat(32);
const FUNDING_TX_HASH = "aa".repeat(32);
const COLLATERAL_TX_HASH = "bb".repeat(32);
const CONSOLIDATION_FUNDING_TX_HASH = "cc".repeat(32);
const CONSOLIDATION_COLLATERAL_TX_HASH = "dd".repeat(32);
const STT_ASSET_NAME = "deadbeef";
// Keep this fixture near the transaction-size limit as compiled scripts shrink.
const WIDE_VALUE_NATIVE_ASSET_COUNT = 210;
const POLICY_DEEP_NATIVE_ASSET_COUNT = 151;
const SHORT_ASSETS_PER_POLICY = 257;

function bigEndianHex(value: bigint | number, bytes: number): string {
  return BigInt(value).toString(16).padStart(bytes * 2, "0");
}

function paymentAddress(keyHash: string): string {
  return serializeAddressObj(pubKeyAddress(keyHash, undefined, undefined), 0);
}

function userWalletHash(userId: number, walletId: number): string {
  return bigEndianHex(1_000 + userId * 100 + walletId, 28);
}

function allowanceEntries(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    policyId: bigEndianHex(1, 28),
    assetName: bigEndianHex(index + 1, 32),
    amount: MAX_UINT64.toString()
  }));
}

function valueAssetAt(index: number) {
  const policyIndex = Math.floor(index / SHORT_ASSETS_PER_POLICY);
  const assetIndex = index % SHORT_ASSETS_PER_POLICY;
  return {
    policyId: bigEndianHex(4_000 + policyIndex, 28),
    assetName: assetIndex === 0 ? "" : bigEndianHex(assetIndex - 1, 1)
  };
}

function streamingPayments(
  targetPolicyId: string,
  targetAssetName: string
): StreamingPaymentFormState[] {
  const endDate = BigInt(REFERENCE_TIME_MS) - 10_000_000n;
  const startDate = endDate - DAY_MS;
  return Array.from({ length: 15 }, (_, index) => {
    const number = index + 1;
    const target = number === 15;
    const payeeHash = target ? "11".repeat(28) : bigEndianHex(2_000 + number, 28);
    return {
      id: (MAX_UINT64 - BigInt(index)).toString(),
      payoutAddress: paymentAddress(payeeHash),
      paidOutAmount: (MAX_UINT64 - (target ? 2n : 1n)).toString(),
      policyId: target ? targetPolicyId : bigEndianHex(3_000 + number, 28),
      assetName: target ? targetAssetName : bigEndianHex(number, 32),
      amountPerDay: MAX_UINT64.toString(),
      startDate: startDate.toString(),
      endDate: endDate.toString()
    };
  });
}

function cappedListAndScalarState(
  targetPolicyId: string,
  targetAssetName: string,
  lastNonAdminPayoutAt = 0n
): StateFormState {
  const form = createDefaultStateForm();
  form.walletName = "x".repeat(32);
  form.multiSigThresholdMode = "some";
  form.multiSigThreshold = MAX_UINT64.toString();
  form.proofOfLifeUnlockTimeMode = "some";
  form.proofOfLifeUnlockTime = MAX_UINT64.toString();
  form.proofOfLifeIncrementMode = "some";
  form.proofOfLifeIncrement = MAX_UINT64.toString();
  form.lastNonAdminPayoutAt = {
    alternative: 0,
    fields: [lastNonAdminPayoutAt]
  };
  form.users = Array.from({ length: 10 }, (_, index) => {
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
  form.beneficiaries = Array.from({ length: 5 }, (_, index) => {
    const beneficiaryNumber = index + 1;
    const walletStart = beneficiaryNumber === 1 ? 1 : beneficiaryNumber === 5 ? 6 : beneficiaryNumber + 1;
    const walletCount = beneficiaryNumber === 1 ? 2 : beneficiaryNumber === 5 ? 10 : 1;
    return {
      id: (MAX_UINT64 - BigInt(index)).toString(),
      wallets: Array.from({ length: walletCount }, (_, walletIndex) =>
        bigEndianHex(walletStart + walletIndex, 28)
      ),
      unlockAfterMode: "some" as const,
      unlockAfter: MAX_UINT64.toString(),
      weight: MAX_UINT64.toString(),
      payoutAddress: serializeAddressObj(
        scriptAddress(bigEndianHex(101, 28), bigEndianHex(102, 28), true),
        0
      )
    };
  });
  form.streamingPayments = streamingPayments(targetPolicyId, targetAssetName);
  return form;
}

function encodeCborArray(items: string[]): string {
  const length = items.length;
  const header =
    length < 24
      ? (0x80 + length).toString(16).padStart(2, "0")
      : `98${length.toString(16).padStart(2, "0")}`;
  return `${header}${items.join("")}`;
}

function writeFixture(outputDirectory: string, name: string, value: string): void {
  writeFileSync(resolve(outputDirectory, name), `${value}\n`);
}

function collectionValues<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }
  const collection = value as { values?: () => readonly T[] };
  return typeof collection.values === "function"
    ? Array.from(collection.values())
    : [];
}

function cborHexSha256(code: string): string {
  return createHash("sha256").update(Buffer.from(code, "hex")).digest("hex");
}

async function main() {
  const outputDirectory = process.argv[2];
  if (!outputDirectory) {
    throw new Error("Usage: build-entrypoint-budget-fixture.ts <output-directory>");
  }
  mkdirSync(outputDirectory, { recursive: true });

  await buildPartialPayoutFixture(outputDirectory);
  await buildConsolidationFixture(outputDirectory);
}

async function buildPartialPayoutFixture(outputDirectory: string) {
  const sttScript = getSttSpendScript();
  const policyId = getSttMintPolicyId();
  const stateAddress = resolveScriptAddress(sttScript);
  const walletScript = getWalletSpendScript({
    sttPolicyId: policyId,
    sttAssetNameHex: STT_ASSET_NAME
  });
  const walletAddress = resolveScriptAddress(walletScript);
  const crankSignerKeyHash = "11".repeat(28);
  const payoutQuantity = "1";
  const targetAsset = valueAssetAt(WIDE_VALUE_NATIVE_ASSET_COUNT - 1);
  const stateForm = cappedListAndScalarState(targetAsset.policyId, targetAsset.assetName);
  const stateDatum = stateFormToDatum(stateForm);
  const stateDatumCbor = serializeData(stateDatum, "Mesh");
  const stateAssets = [
    { unit: "lovelace", quantity: "30000000" },
    { unit: `${policyId}${STT_ASSET_NAME}`, quantity: "1" }
  ];
  const stateUtxo = {
    input: { txHash: STT_TX_HASH, outputIndex: 0 },
    output: {
      address: stateAddress,
      amount: stateAssets,
      plutusData: stateDatumCbor
    }
  } as UTxO;
  const referenceUtxo = {
    input: { txHash: STT_REFERENCE_TX_HASH, outputIndex: 0 },
    output: {
      address: paymentAddress("33".repeat(28)),
      amount: [{ unit: "lovelace", quantity: "2000000" }],
      scriptRef: String(toScriptRef(sttScript).toCbor()),
      scriptHash: resolveScriptHash(sttScript.code, sttScript.version)
    }
  } as UTxO;
  const walletAssets = [
    { unit: "lovelace", quantity: "5000000" },
    ...Array.from({ length: WIDE_VALUE_NATIVE_ASSET_COUNT }, (_, index) => {
      const asset = valueAssetAt(index);
      return {
        unit: `${asset.policyId}${asset.assetName}`,
        quantity: index === WIDE_VALUE_NATIVE_ASSET_COUNT - 1 ? "2" : "1"
      };
    })
  ];
  const walletUtxo = {
    input: { txHash: WALLET_TX_HASH, outputIndex: 0 },
    output: { address: walletAddress, amount: walletAssets }
  } as UTxO;
  const fundingUtxo = {
    input: { txHash: FUNDING_TX_HASH, outputIndex: 0 },
    output: {
      address: paymentAddress(crankSignerKeyHash),
      amount: [{ unit: "lovelace", quantity: "2000000000" }]
    }
  } as UTxO;
  const collateralUtxo = {
    input: { txHash: COLLATERAL_TX_HASH, outputIndex: 0 },
    output: {
      address: paymentAddress(crankSignerKeyHash),
      amount: [{ unit: "lovelace", quantity: "20000000" }]
    }
  } as UTxO;
  const allUtxos = [
    stateUtxo,
    referenceUtxo,
    walletUtxo,
    fundingUtxo,
    collateralUtxo
  ];
  const fetcher = createFixtureFetcher(allUtxos);
  const wallet = createFixtureWallet(fundingUtxo, collateralUtxo);
  const targetPayment = stateForm.streamingPayments.at(-1)!;
  const targetStreamingPaymentIndex = stateForm.streamingPayments.indexOf(targetPayment);
  const targetNativeAssetUnit = `${targetAsset.policyId}${targetAsset.assetName}`;
  const canonicalWalletValue = toTxUnspentOutput(walletUtxo).output().amount();
  const canonicalWalletAssets = canonicalWalletValue.toCore().assets;
  const targetNativeAssetIndex = canonicalWalletAssets
    ? Array.from(canonicalWalletAssets.keys()).findIndex(
        (assetId) => assetId === targetNativeAssetUnit
      )
    : -1;
  const crankSignerAddress = paymentAddress(crankSignerKeyHash);
  const crankSignerStreamingPayeeIndexes = stateForm.streamingPayments.flatMap(
    (payment, index) =>
      payment.payoutAddress === crankSignerAddress ? [index] : []
  );
  const transfer = buildStreamingPaymentPayoutTransfer(
    targetPayment,
    payoutQuantity,
    STT_TX_HASH,
    0
  );
  const result = await buildSttSpendTx(
    wallet,
    {
      walletPolicyId: policyId,
      walletAssetNameHex: STT_ASSET_NAME,
      sttAssetNameHex: STT_ASSET_NAME,
      sttSpendReference: `${STT_REFERENCE_TX_HASH}#0`
    },
    "payout-streaming-payment",
    {
      sttInputTxHash: STT_TX_HASH,
      sttInputOutputIndex: 0,
      outputDatum: stateDatum,
      outputAssets: stateAssets,
      crankSignerKeyHash,
      walletInputs: [walletUtxo.input],
      walletOutputs: [],
      extraTransfers: [transfer],
      validityWindowReferenceTimeMs: REFERENCE_TIME_MS
    },
    fetcher
  );

  const transaction = deserializeTx(result.txHex);
  // Funding, collateral, and the crank share one key. The size gate reserves
  // one serialized vkey witness, so reject a change to that signing shape.
  assertExactJson(
    collectionValues<CstKeyHash>(transaction.body().requiredSigners()).map((keyHash) => keyHash.value()),
    [crankSignerKeyHash],
    "The partial payout fixture must require only its crank key."
  );
  const transactionInputs = collectionValues<CstTransactionInput>(
    transaction.body().inputs()
  );
  const collateralInputs = collectionValues<CstTransactionInput>(
    (
      transaction.body() as unknown as {
        collateral?: () => unknown;
      }
    ).collateral?.()
  );
  const inputReferences = transactionInputs.map(
    (input) => `${input.transactionId().toString()}#${input.index()}`
  );
  const collateralReferences = collateralInputs.map(
    (input) => `${input.transactionId().toString()}#${input.index()}`
  );
  const expectedInputReferences = [
    `${STT_TX_HASH}#0`,
    `${WALLET_TX_HASH}#0`,
    `${FUNDING_TX_HASH}#0`
  ];
  if (JSON.stringify(inputReferences) !== JSON.stringify(expectedInputReferences)) {
    throw new Error(
      `Fixture input selection changed: expected ${expectedInputReferences.join(", ")}, found ${inputReferences.join(", ")}.`
    );
  }
  if (JSON.stringify(collateralReferences) !== JSON.stringify([`${COLLATERAL_TX_HASH}#0`])) {
    throw new Error(
      `Fixture collateral selection changed: found ${collateralReferences.join(", ")}.`
    );
  }
  const scriptByInputReference = new Map([
    [`${STT_TX_HASH}#0`, "stt.stt.spend"],
    [`${WALLET_TX_HASH}#0`, "wallet.wallet.spend"]
  ]);
  const scriptInputs = describeScriptInputs(
    transaction,
    transactionInputs,
    scriptByInputReference
  );
  if (scriptInputs.length !== 2) {
    throw new Error(`Expected two script inputs, found ${scriptInputs.length}.`);
  }

  const resolved = allUtxos.map(toTxUnspentOutput);
  const walletValueCbor = String(canonicalWalletValue.toCbor());
  const walletValueCborBytes = walletValueCbor.length / 2;
  writeFixture(outputDirectory, "transaction.cbor", result.txHex);
  writeFixture(
    outputDirectory,
    "inputs.cbor",
    encodeCborArray(resolved.map((utxo) => String(utxo.input().toCbor())))
  );
  writeFixture(
    outputDirectory,
    "outputs.cbor",
    encodeCborArray(resolved.map((utxo) => String(utxo.output().toCbor())))
  );
  writeFileSync(
    resolve(outputDirectory, "source.json"),
    `${JSON.stringify(
      {
        scenario: "capped-list-and-scalar-near-transaction-limit-partial-streaming-payout",
        transactionBytes: result.txHex.length / 2,
        nativeAssetCount: WIDE_VALUE_NATIVE_ASSET_COUNT,
        walletValueCborBytes,
        walletValueCborSha256: cborHexSha256(walletValueCbor),
        stateDatumCborBytes: stateDatumCbor.length / 2,
        stateDatumCborSha256: cborHexSha256(stateDatumCbor),
        stateShape: describeStateShape(stateForm),
        stressProfile: {
          crankSignerMatchesStateUser: stateForm.users.some((user) =>
            user.wallets.includes(crankSignerKeyHash)
          ),
          crankSignerMatchesBeneficiary: stateForm.beneficiaries.some(
            (beneficiary) =>
              beneficiary.wallets.includes(crankSignerKeyHash)
          ),
          crankSignerStreamingPayeeIndexes,
          targetStreamingPaymentIndex,
          targetNativeAssetIndex,
          payoutQuantity
        },
        walletParameters: {
          sttPolicyId: policyId,
          sttAssetNameHex: STT_ASSET_NAME
        },
        sttScriptHash: resolveScriptHash(sttScript.code, sttScript.version),
        walletScriptHash: resolveScriptHash(walletScript.code, walletScript.version),
        sttScriptCodeSha256: cborHexSha256(sttScript.code),
        walletScriptCodeSha256: cborHexSha256(walletScript.code),
        scriptInputs
      },
      null,
      2
    )}\n`
  );
}

async function buildConsolidationFixture(outputDirectory: string) {
  const sttScript = getSttSpendScript();
  const policyId = getSttMintPolicyId();
  const stateAddress = resolveScriptAddress(sttScript);
  const walletScript = getWalletSpendScript({
    sttPolicyId: policyId,
    sttAssetNameHex: STT_ASSET_NAME
  });
  const walletAddress = resolveScriptAddress(walletScript);
  const adminKeyHash = userWalletHash(10, 6);
  const adminAddress = paymentAddress(adminKeyHash);
  const stateForm = cappedListAndScalarState(
    bigEndianHex(9_000, 28),
    bigEndianHex(9_000, 32),
    MAX_UINT64
  );
  const stateDatum = stateFormToDatum(stateForm);
  const stateDatumCbor = serializeData(stateDatum, "Mesh");
  const stateAssets = [
    { unit: "lovelace", quantity: "30000000" },
    { unit: `${policyId}${STT_ASSET_NAME}`, quantity: "1" }
  ];
  const nativeAssets = Array.from(
    { length: POLICY_DEEP_NATIVE_ASSET_COUNT },
    (_, index) => ({ unit: bigEndianHex(index + 1, 28), quantity: "1" })
  );
  const walletInputAssets = [
    { unit: "lovelace", quantity: "30000000" },
    ...nativeAssets
  ];
  const narrowOutputAssets = [{ unit: "lovelace", quantity: "2000000" }];
  const wideOutputAssets = [
    { unit: "lovelace", quantity: "28000000" },
    ...nativeAssets
  ];
  const stateUtxo = {
    input: { txHash: STT_TX_HASH, outputIndex: 0 },
    output: {
      address: stateAddress,
      amount: stateAssets,
      plutusData: stateDatumCbor
    }
  } as UTxO;
  const sttReferenceUtxo = {
    input: { txHash: STT_REFERENCE_TX_HASH, outputIndex: 0 },
    output: {
      address: paymentAddress("33".repeat(28)),
      amount: [{ unit: "lovelace", quantity: "2000000" }],
      scriptRef: String(toScriptRef(sttScript).toCbor()),
      scriptHash: resolveScriptHash(sttScript.code, sttScript.version)
    }
  } as UTxO;
  const walletReferenceUtxo = {
    input: { txHash: WALLET_REFERENCE_TX_HASH, outputIndex: 0 },
    output: {
      address: paymentAddress("34".repeat(28)),
      amount: [{ unit: "lovelace", quantity: "2000000" }],
      scriptRef: String(toScriptRef(walletScript).toCbor()),
      scriptHash: resolveScriptHash(walletScript.code, walletScript.version)
    }
  } as UTxO;
  const walletUtxo = {
    input: { txHash: CONSOLIDATION_WALLET_TX_HASH, outputIndex: 0 },
    output: { address: walletAddress, amount: walletInputAssets }
  } as UTxO;
  const fundingUtxo = {
    input: { txHash: CONSOLIDATION_FUNDING_TX_HASH, outputIndex: 0 },
    output: {
      address: adminAddress,
      amount: [{ unit: "lovelace", quantity: "100000000" }]
    }
  } as UTxO;
  const collateralUtxo = {
    input: { txHash: CONSOLIDATION_COLLATERAL_TX_HASH, outputIndex: 0 },
    output: {
      address: adminAddress,
      amount: [{ unit: "lovelace", quantity: "10000000" }]
    }
  } as UTxO;
  const allUtxos = [
    stateUtxo,
    sttReferenceUtxo,
    walletReferenceUtxo,
    walletUtxo,
    fundingUtxo,
    collateralUtxo
  ];
  const result = await buildConsolidateUtxosTx(
    createFixtureWallet(fundingUtxo, collateralUtxo),
    {
      walletPolicyId: policyId,
      walletAssetNameHex: STT_ASSET_NAME,
      sttAssetNameHex: STT_ASSET_NAME,
      sttSpendReference: `${STT_REFERENCE_TX_HASH}#0`,
      walletSpendReference: `${WALLET_REFERENCE_TX_HASH}#0`
    },
    {
      sttInputTxHash: STT_TX_HASH,
      sttInputOutputIndex: 0,
      outputDatum: stateDatum,
      outputAssets: stateAssets,
      authorityPath: "admin",
      walletInputs: [walletUtxo.input],
      walletOutputs: [
        { amount: narrowOutputAssets },
        { amount: wideOutputAssets }
      ]
    },
    createFixtureFetcher(allUtxos)
  );

  const transaction = deserializeTx(result.txHex);
  const transactionInputs = collectionValues<CstTransactionInput>(
    transaction.body().inputs()
  );
  const inputReferences = transactionInputs.map(
    (input) => `${input.transactionId().toString()}#${input.index()}`
  );
  const expectedInputReferences = [
    `${STT_TX_HASH}#0`,
    `${CONSOLIDATION_WALLET_TX_HASH}#0`,
    `${CONSOLIDATION_FUNDING_TX_HASH}#0`
  ];
  assertExactJson(
    inputReferences,
    expectedInputReferences,
    `Consolidation input selection changed: expected ${expectedInputReferences.join(", ")}, found ${inputReferences.join(", ")}.`
  );
  const scriptInputs = describeScriptInputs(
    transaction,
    transactionInputs,
    new Map([
      [`${STT_TX_HASH}#0`, "stt.stt.spend"],
      [`${CONSOLIDATION_WALLET_TX_HASH}#0`, "wallet.wallet.spend"]
    ])
  );
  if (scriptInputs.length !== 2) {
    throw new Error(`Expected two Consolidation script inputs, found ${scriptInputs.length}.`);
  }
  const referenceInputs = collectionValues<CstTransactionInput>(
    transaction.body().referenceInputs()
  ).map((input) => `${input.transactionId().toString()}#${input.index()}`);
  const expectedReferences = [
    `${STT_REFERENCE_TX_HASH}#0`,
    `${WALLET_REFERENCE_TX_HASH}#0`
  ];
  assertExactJson(
    referenceInputs.slice().sort(),
    expectedReferences.slice().sort(),
    `Consolidation reference inputs changed: ${referenceInputs.join(", ")}.`
  );
  const collateralInputs = collectionValues<CstTransactionInput>(
    transaction.body().collateral()
  ).map((input) => `${input.transactionId().toString()}#${input.index()}`);
  assertExactJson(
    collateralInputs,
    [`${CONSOLIDATION_COLLATERAL_TX_HASH}#0`],
    `Consolidation collateral selection changed: ${collateralInputs.join(", ")}.`
  );
  const outputs = collectionValues<CstTransactionOutput>(
    transaction.body().outputs()
  );
  const walletOutputs = outputs.filter(
    (output) => output.address().toBech32().toString() === walletAddress
  );
  const changeOutputs = outputs.filter(
    (output) => output.address().toBech32().toString() === adminAddress
  );
  const stateOutputs = outputs.filter(
    (output) => output.address().toBech32().toString() === stateAddress
  );
  if (
    walletOutputs.length !== 2 ||
    changeOutputs.length !== 1 ||
    stateOutputs.length !== 1 ||
    outputs.length !== 4
  ) {
    throw new Error(
      `Consolidation output shape changed: ${walletOutputs.length} wallet, ${changeOutputs.length} change, ${outputs.length} total.`
    );
  }
  const stateInlineDatum = stateOutputs[0].datum()?.asInlineData?.() as
    | { toCbor(): string }
    | undefined;
  if (String(stateInlineDatum?.toCbor()) !== stateDatumCbor) {
    throw new Error("Consolidation changed the continuing State datum.");
  }
  const changeLovelace = BigInt(changeOutputs[0].amount().coin().toString());
  if (changeLovelace <= 0n || changeLovelace >= 100_000_000n) {
    throw new Error(`Consolidation change is invalid: ${changeLovelace}.`);
  }
  if (
    String(walletOutputs[0].amount().toCbor()) !==
      String(toTxUnspentOutput({ ...walletUtxo, output: { ...walletUtxo.output, amount: narrowOutputAssets } }).output().amount().toCbor()) ||
    String(walletOutputs[1].amount().toCbor()) !==
      String(toTxUnspentOutput({ ...walletUtxo, output: { ...walletUtxo.output, amount: wideOutputAssets } }).output().amount().toCbor())
  ) {
    throw new Error("Consolidation wallet output Values changed.");
  }

  const resolved = allUtxos.map(toTxUnspentOutput);
  const walletValueCbor = String(toTxUnspentOutput(walletUtxo).output().amount().toCbor());
  writeFixture(outputDirectory, "consolidation-transaction.cbor", result.txHex);
  writeFixture(
    outputDirectory,
    "consolidation-inputs.cbor",
    encodeCborArray(resolved.map((utxo) => String(utxo.input().toCbor())))
  );
  writeFixture(
    outputDirectory,
    "consolidation-outputs.cbor",
    encodeCborArray(resolved.map((utxo) => String(utxo.output().toCbor())))
  );
  writeFileSync(
    resolve(outputDirectory, "consolidation-source.json"),
    `${JSON.stringify(
      {
        scenario: "capped-list-and-scalar-policy-deep-consolidation-repartition",
        transactionBytes: result.txHex.length / 2,
        nativeAssetCount: POLICY_DEEP_NATIVE_ASSET_COUNT,
        walletValueCborBytes: walletValueCbor.length / 2,
        walletValueCborSha256: cborHexSha256(walletValueCbor),
        stateDatumCborBytes: stateDatumCbor.length / 2,
        stateDatumCborSha256: cborHexSha256(stateDatumCbor),
        stateShape: describeStateShape(stateForm),
        transactionShape: {
          inputs: inputReferences.length,
          outputs: outputs.length,
          referenceInputs: referenceInputs.length,
          collateralInputs: collateralInputs.length,
          walletInputs: 1,
          walletOutputs: walletOutputs.length,
          changeOutputs: changeOutputs.length
        },
        stressProfile: {
          authorityPath: "admin",
          nativeAssetTopology: "151 policies with one empty-name asset each",
          intendedStakeCredential: "None"
        },
        walletParameters: {
          sttPolicyId: policyId,
          sttAssetNameHex: STT_ASSET_NAME
        },
        sttScriptHash: resolveScriptHash(sttScript.code, sttScript.version),
        walletScriptHash: resolveScriptHash(walletScript.code, walletScript.version),
        sttScriptCodeSha256: cborHexSha256(sttScript.code),
        walletScriptCodeSha256: cborHexSha256(walletScript.code),
        scriptInputs
      },
      null,
      2
    )}\n`
  );
}

// Pin the selector and clock for deterministic funding inputs and validity slots.
// The assertions above fail if a later selector reuses collateral as an input.
const originalRandom = Math.random;
const originalNow = Date.now;
Math.random = () => 0;
Date.now = () => REFERENCE_TIME_MS;
main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    Math.random = originalRandom;
    Date.now = originalNow;
  });
