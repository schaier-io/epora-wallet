// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserWallet, PlutusScript, UTxO } from "@meshsdk/core";
import type { StreamingPaymentFormState } from "@/lib/contracts/state-form";
import type { CstCollection, CstTransactionInput, CstTransactionOutput } from "@/lib/mesh/cst";

// Real Mesh construction verifies serialized input/output placement. The mocked
// evaluator supplies budgets only; these tests do not validate Plutus execution.
const chain = vi.hoisted(() => ({
  addressUtxos: new Map<string, UTxO[]>(),
  referencedUtxos: new Map<string, UTxO>(),
  evaluations: 0,
  evaluatorTag: "SPEND" as "SPEND" | "MINT"
}));

vi.mock("@/lib/mesh/server-fetcher", async () => {
  const {
    DEFAULT_PROTOCOL_PARAMETERS,
    DEFAULT_V1_COST_MODEL_LIST,
    DEFAULT_V2_COST_MODEL_LIST,
    DEFAULT_V3_COST_MODEL_LIST
  } = await import("@meshsdk/common");
  class ServerFetcher {
    async fetchProtocolParameters() { return DEFAULT_PROTOCOL_PARAMETERS; }
    async fetchCostModels() {
      return [DEFAULT_V1_COST_MODEL_LIST, DEFAULT_V2_COST_MODEL_LIST, DEFAULT_V3_COST_MODEL_LIST];
    }
    async fetchAddressUTxOs(address: string) {
      return chain.addressUtxos.get(address) ?? [];
    }
    async fetchUTxOs(txHash: string, outputIndex?: number) {
      return [...chain.referencedUtxos.values()].filter((utxo) =>
        utxo.input.txHash === txHash &&
        (outputIndex === undefined || utxo.input.outputIndex === outputIndex)
      );
    }
    async get(url: string) {
      if (url.includes("epochs/latest/parameters")) {
        return { cost_models_raw: {
          PlutusV1: DEFAULT_V1_COST_MODEL_LIST,
          PlutusV2: DEFAULT_V2_COST_MODEL_LIST,
          PlutusV3: DEFAULT_V3_COST_MODEL_LIST
        } };
      }
      const match = /^txs\/([0-9a-f]+)\/utxos$/.exec(url);
      return match ? { outputs: [...chain.referencedUtxos.values()]
        .filter((utxo) => utxo.input.txHash === match[1])
        .map((utxo) => ({ output_index: utxo.input.outputIndex, consumed_by_tx: null })) } : {};
    }
    async evaluateTx(txHex: string) {
      chain.evaluations += 1;
      const { deserializeTx } = await import("@/lib/mesh/cst");
      const count = deserializeTx(txHex).witnessSet().redeemers()?.size() ?? 0;
      return Array.from({ length: count }, (_, index) => ({
        index, tag: chain.evaluatorTag, budget: { mem: 700_000, steps: 300_000_000 }
      }));
    }
  }
  return { ServerFetcher };
});

const { resolveScriptHash, serializeData } = await import("@meshsdk/core");
const { toScriptRef } = await import("@meshsdk/core-cst");
const { deserializeTx } = await import("@/lib/mesh/cst");
const {
  getSttMintPolicyId, getSttMintScript, getSttSpendScript,
  resolveScriptAddress, resolveSttReferenceStoreAddress, resolveWalletSpendAddress
} = await import("@/lib/contracts/blueprint");
const {
  createDefaultStateForm, stateFormToDatum, withFallbackAdminUserInStateForm
} = await import("@/lib/contracts/state-form");
const { buildSttSpendTx } = await import("@/lib/mesh/transactions/stt-spend");
const { buildMintStateTokenTx } = await import("@/lib/mesh/transactions/mint-state-token");
const { deriveAssetName } = await import("@/lib/mesh/transactions/internals");

const PAYMENT_ADDRESS = "addr_test1vqg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygxrcya6";
const PAYMENT_KEY_HASH = "11".repeat(28);
const STATE_ASSET_NAME = "deadbeef";
const TOKEN_POLICY = "ab".repeat(28);
const TOKEN_UNIT = `${TOKEN_POLICY}01`;
const WRONG_TOKEN_UNIT = `${TOKEN_POLICY}02`;
const REFERENCE_TIME_MS = 1_000_000;

function utxo(txByte: string, address = PAYMENT_ADDRESS, tokenUnit?: string, quantity = "1"): UTxO {
  return {
    input: { txHash: txByte.repeat(32), outputIndex: 0 },
    output: { address, amount: [
      { unit: "lovelace", quantity: "100000000" },
      ...(tokenUnit ? [{ unit: tokenUnit, quantity }] : [])
    ] }
  };
}

function reference(utxo: UTxO) {
  return `${utxo.input.txHash}#${utxo.input.outputIndex}`;
}

function register(utxo: UTxO) {
  chain.referencedUtxos.set(reference(utxo), utxo);
  return utxo;
}

function scriptReference(script: PlutusScript) {
  const result = utxo("44", resolveSttReferenceStoreAddress());
  result.output.scriptRef = String(toScriptRef(script).toCbor());
  result.output.scriptHash = resolveScriptHash(script.code, script.version);
  return register(result);
}

function stream(id = "1"): StreamingPaymentFormState {
  return {
    id, payoutAddress: PAYMENT_ADDRESS, paidOutAmount: "0",
    policyId: TOKEN_POLICY, assetName: "01", amountPerDay: "1",
    startDate: "2000000", endDate: "10000000"
  };
}

function state(streams: StreamingPaymentFormState[] = []) {
  const result = withFallbackAdminUserInStateForm(createDefaultStateForm(), PAYMENT_KEY_HASH);
  result.streamingPayments = streams;
  return result;
}

function wallet(utxos = [utxo("aa"), utxo("bb")]) {
  utxos.forEach(register);
  return {
    getUtxos: async () => utxos,
    getChangeAddress: async () => PAYMENT_ADDRESS,
    getUsedAddresses: async () => [PAYMENT_ADDRESS],
    getUnusedAddresses: async () => []
  } as unknown as BrowserWallet;
}

function inputKeys(inputs: readonly CstTransactionInput[] | undefined) {
  return (inputs ?? []).map((input) => `${input.transactionId().toString()}#${input.index().toString()}`);
}

function bodyOf(txHex: string) { return deserializeTx(txHex).body(); }

function nativeQuantity(output: CstTransactionOutput, unit: string) {
  return [...(output.amount().multiasset()?.entries() ?? [])]
    .filter(([assetId]) => assetId.toString() === unit)
    .reduce((sum, [, quantity]) => sum + BigInt(quantity.toString()), 0n);
}

function expectReadOnlyProof(txHex: string, proof: UTxO) {
  const body = bodyOf(txHex);
  expect(inputKeys(body.referenceInputs()?.values())).toContain(reference(proof));
  expect(inputKeys((body.inputs() as CstCollection<CstTransactionInput>).values())).not.toContain(reference(proof));
  expect(inputKeys(body.collateral()?.values())).not.toContain(reference(proof));
}

function manageContext(existing: StreamingPaymentFormState[] = []) {
  const policyId = getSttMintPolicyId();
  const walletAddress = resolveWalletSpendAddress({ sttPolicyId: policyId, sttAssetNameHex: STATE_ASSET_NAME });
  const stateUtxo = utxo("22", resolveScriptAddress(getSttSpendScript()), `${policyId}${STATE_ASSET_NAME}`);
  stateUtxo.output.plutusData = serializeData(stateFormToDatum(state(existing)), "Mesh");
  register(stateUtxo);
  const sharedReference = scriptReference(getSttSpendScript());
  const config = {
    walletPolicyId: policyId, walletAssetNameHex: STATE_ASSET_NAME,
    sttAssetNameHex: STATE_ASSET_NAME, sttSpendReference: reference(sharedReference)
  };
  return {
    walletAddress, stateUtxo, sharedReference,
    build: (streams = [stream()], sourceWallet = wallet()) => buildSttSpendTx(
      sourceWallet, config, "manage-streaming-payments", {
        sttInputTxHash: stateUtxo.input.txHash, sttInputOutputIndex: 0,
        outputDatum: stateFormToDatum(state(streams)), outputAssets: stateUtxo.output.amount,
        authorityPath: "admin", validityWindowReferenceTimeMs: REFERENCE_TIME_MS
      }
    )
  };
}

beforeEach(() => {
  chain.addressUtxos.clear();
  chain.referencedUtxos.clear();
  chain.evaluations = 0;
  chain.evaluatorTag = "SPEND";
});

describe("new stream asset proof (real Mesh build, mocked chain I/O)", () => {
  it("references a smart-wallet token UTxO without spending or collateralizing it", async () => {
    const context = manageContext();
    const proof = register(utxo("55", context.walletAddress, TOKEN_UNIT));
    chain.addressUtxos.set(context.walletAddress, [proof]);
    const result = await context.build();
    expectReadOnlyProof(result.txHex, proof);
    expect(chain.evaluations).toBeGreaterThan(0);
  });

  it("spends a connected-wallet proof UTxO and returns its entire token amount", async () => {
    const context = manageContext();
    const proof = utxo("55", PAYMENT_ADDRESS, TOKEN_UNIT, "7");
    proof.output.amount[0]!.quantity = "7000000";
    const result = await context.build([stream()], wallet([utxo("aa"), utxo("bb"), proof]));
    const body = bodyOf(result.txHex);
    expect(inputKeys((body.inputs() as CstCollection<CstTransactionInput>).values())).toContain(reference(proof));
    expect(inputKeys(body.referenceInputs()?.values())).not.toContain(reference(proof));
    expect(inputKeys(body.collateral()?.values())).not.toContain(reference(proof));
    const change = (body.outputs() as { values(): CstTransactionOutput[] }).values()
      .filter((output) => output.address().toBech32().toString() === PAYMENT_ADDRESS);
    expect(change.reduce((sum, output) => sum + nativeQuantity(output, TOKEN_UNIT), 0n)).toBe(7n);
  });

  it("includes proof as a spent input when the collateral fallback reuses it", async () => {
    const context = manageContext();
    const proof = utxo("55", PAYMENT_ADDRESS, TOKEN_UNIT);
    proof.output.amount[0]!.quantity = "7000000";
    const result = await context.build([stream()], wallet([proof]));
    const body = bodyOf(result.txHex);
    expect(inputKeys(body.collateral()?.values())).toContain(reference(proof));
    expect(inputKeys((body.inputs() as CstCollection<CstTransactionInput>).values())).toContain(reference(proof));
  });

  it("rejects a token with the same policy but the wrong asset name before evaluation", async () => {
    const context = manageContext();
    const wrongToken = register(utxo("55", context.walletAddress, WRONG_TOKEN_UNIT));
    chain.addressUtxos.set(context.walletAddress, [wrongToken]);
    await expect(context.build()).rejects.toThrow(TOKEN_UNIT);
    expect(chain.evaluations).toBe(0);
  });

  it.each([
    ["0", TOKEN_UNIT],
    ["-1", "Streaming asset proof quantity must be a non-negative integer string."]
  ])("rejects a smart-wallet proof with quantity %s before evaluation", async (quantity, error) => {
    const context = manageContext();
    const emptyProof = register(utxo("55", context.walletAddress, TOKEN_UNIT, quantity));
    chain.addressUtxos.set(context.walletAddress, [emptyProof]);
    await expect(context.build()).rejects.toThrow(error);
    expect(chain.evaluations).toBe(0);
  });

  it("reuses one positive token reference for two fresh streams of the same asset", async () => {
    const context = manageContext();
    const proof = register(utxo("55", context.walletAddress, TOKEN_UNIT));
    chain.addressUtxos.set(context.walletAddress, [proof]);
    const result = await context.build([stream("1"), stream("2")]);
    expectReadOnlyProof(result.txHex, proof);
    const proofReferences = inputKeys(bodyOf(result.txHex).referenceInputs()?.values())
      .filter((key) => key === reference(proof));
    expect(proofReferences).toHaveLength(1);
  });

  it("allows an existing stream end-date edit when its asset is absent", async () => {
    const existing = stream();
    const context = manageContext([existing]);
    const result = await context.build([{ ...existing, endDate: "12000000" }]);
    expect(bodyOf(result.txHex).referenceInputs()?.values()).toHaveLength(1);
    expect(chain.evaluations).toBeGreaterThan(0);
  });

  it("uses the existing STT script reference when it contains the stream asset", async () => {
    const context = manageContext();
    context.sharedReference.output.amount.push({ unit: TOKEN_UNIT, quantity: "1" });
    const result = await context.build();
    expectReadOnlyProof(result.txHex, context.sharedReference);
    expect(bodyOf(result.txHex).referenceInputs()?.values()).toHaveLength(1);
  });

  it("accepts the consumed STT input as proof and preserves its token amount", async () => {
    const context = manageContext();
    context.stateUtxo.output.amount.push({ unit: TOKEN_UNIT, quantity: "1" });
    const result = await context.build();
    const body = bodyOf(result.txHex);
    expect(inputKeys((body.inputs() as CstCollection<CstTransactionInput>).values())).toContain(reference(context.stateUtxo));
    expect(body.referenceInputs()?.values()).toHaveLength(1);
    const output = (body.outputs() as { values(): CstTransactionOutput[] }).values()
      .find((candidate) => candidate.address().toBech32().toString() === context.stateUtxo.output.address);
    expect(output).toBeDefined();
    expect(nativeQuantity(output!, TOKEN_UNIT)).toBe(1n);
  });

  it("references a connected-wallet token UTxO that holds a reference script", async () => {
    const context = manageContext();
    const proof = utxo("55", PAYMENT_ADDRESS, TOKEN_UNIT);
    const script = getSttSpendScript();
    proof.output.scriptRef = String(toScriptRef(script).toCbor());
    proof.output.scriptHash = resolveScriptHash(script.code, script.version);
    const result = await context.build([stream()], wallet([utxo("aa"), utxo("bb"), proof]));
    expectReadOnlyProof(result.txHex, proof);
  });

  it("proves a new stream at wallet creation using the intended smart-wallet address", async () => {
    chain.evaluatorTag = "MINT";
    const sharedReference = scriptReference(getSttMintScript());
    const mintInput = utxo("aa");
    const walletAddress = resolveWalletSpendAddress({
      sttPolicyId: getSttMintPolicyId(), sttAssetNameHex: deriveAssetName(mintInput.input)
    });
    const proof = register(utxo("55", walletAddress, TOKEN_UNIT));
    chain.addressUtxos.set(walletAddress, [proof]);
    const result = await buildMintStateTokenTx(wallet([mintInput, utxo("bb")]), {
      stateDatum: stateFormToDatum(state([stream()])), mintLovelace: "2000000",
      selectedReferenceUtxo: mintInput.input, sttSpendReference: reference(sharedReference)
    });
    expectReadOnlyProof(result.txHex, proof);
    expect(chain.evaluations).toBeGreaterThan(0);
  });

  it("rejects a nonexistent stream asset at wallet creation before evaluation", async () => {
    chain.evaluatorTag = "MINT";
    const sharedReference = scriptReference(getSttMintScript());
    await expect(buildMintStateTokenTx(wallet(), {
      stateDatum: stateFormToDatum(state([stream()])), mintLovelace: "2000000",
      sttSpendReference: reference(sharedReference)
    })).rejects.toThrow(TOKEN_UNIT);
    expect(chain.evaluations).toBe(0);
  });
});
