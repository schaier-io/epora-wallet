import { DEFAULT_PROTOCOL_PARAMETERS, DEFAULT_V1_COST_MODEL_LIST, DEFAULT_V2_COST_MODEL_LIST, DEFAULT_V3_COST_MODEL_LIST, type Protocol } from "@meshsdk/common";
import { OfflineEvaluatorScalus, toScriptRef } from "@meshsdk/core-cst";
import { resolveScriptHash, type UTxO } from "@meshsdk/core";
import { getSttMintScript, resolveSttReferenceStoreAddress } from "@/lib/contracts/blueprint";
import { createDefaultStateForm, stateFormToDatum, withFallbackAdminUserInStateForm } from "@/lib/contracts/state-form";
import { ServerFetcher } from "@/lib/mesh/server-fetcher";
import { buildMintStateTokenTx } from "./mint-state-token";

const ADDRESS = "addr_test1vqg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygxrcya6";
export const DEFAULT_OFFLINE_COST_MODELS = [DEFAULT_V1_COST_MODEL_LIST, DEFAULT_V2_COST_MODEL_LIST, DEFAULT_V3_COST_MODEL_LIST];
const REFERENCE_HASH = "22".repeat(32);

const FIXTURE_PROTOCOL_MAJOR_VERSION = 10;
const FIXTURE_PROTOCOL_MINOR_VERSION = 0;

export function createOfflineBuildParameters(protocol: Protocol, costModels: number[][]) {
  return {
    epoch: protocol.epoch, protocol_major_ver: FIXTURE_PROTOCOL_MAJOR_VERSION,
    protocol_minor_ver: FIXTURE_PROTOCOL_MINOR_VERSION,
    coins_per_utxo_word: protocol.coinsPerUtxoSize, collateral_percent: protocol.collateralPercent,
    decentralisation_param: protocol.decentralisation, key_deposit: protocol.keyDeposit,
    max_block_ex_mem: protocol.maxBlockExMem, max_block_ex_steps: protocol.maxBlockExSteps,
    max_block_header_size: protocol.maxBlockHeaderSize, max_block_size: protocol.maxBlockSize,
    max_collateral_inputs: protocol.maxCollateralInputs, max_tx_ex_mem: protocol.maxTxExMem,
    max_tx_ex_steps: protocol.maxTxExSteps, max_tx_size: protocol.maxTxSize, max_val_size: protocol.maxValSize,
    min_fee_a: protocol.minFeeA, min_fee_b: protocol.minFeeB, min_pool_cost: protocol.minPoolCost,
    pool_deposit: protocol.poolDeposit, price_mem: protocol.priceMem, price_step: protocol.priceStep,
    cost_models_raw: { PlutusV1: costModels[0], PlutusV2: costModels[1], PlutusV3: costModels[2] }
  };
}

export async function createOfflineMintFixture(useLocalEvaluation = false, options?: { costModels?: number[][]; protocolParameters?: Protocol }) {
  const costModels = options?.costModels ?? DEFAULT_OFFLINE_COST_MODELS;
  const protocolParameters = options?.protocolParameters ?? DEFAULT_PROTOCOL_PARAMETERS;
  const script = getSttMintScript();
  const utxos: UTxO[] = [0, 1].map(outputIndex => ({
    input: { txHash: "11".repeat(32), outputIndex },
    output: { address: ADDRESS, amount: [{ unit: "lovelace", quantity: "100000000" }] }
  }));
  utxos.push({ input: { txHash: REFERENCE_HASH, outputIndex: 0 }, output: {
    address: resolveSttReferenceStoreAddress(), amount: [{ unit: "lovelace", quantity: "100000000" }],
    scriptRef: String(toScriptRef(script).toCbor()), scriptHash: resolveScriptHash(script.code, script.version)
  } });
  const fetcher = new ServerFetcher();
  fetcher.fetchProtocolParameters = async () => protocolParameters;
  fetcher.fetchCostModels = async () => costModels;
  fetcher.fetchUTxOs = async (hash, index) => utxos.filter(utxo => utxo.input.txHash === hash && (index === undefined || utxo.input.outputIndex === index));
  fetcher.get = async path => path.includes("epochs/latest/parameters")
    ? createOfflineBuildParameters(protocolParameters, costModels)
    : { outputs: [{ output_index: 0, consumed_by_tx: null }] };
  const passes: string[] = [];
  const localEvaluator = new OfflineEvaluatorScalus(fetcher, "preprod", undefined, costModels);
  fetcher.evaluateTx = async txHex => {
    passes.push(txHex);
    return useLocalEvaluation ? localEvaluator.evaluateTx(txHex, utxos)
      : [{ index: 0, tag: "MINT", budget: { mem: 700_000, steps: 300_000_000 } }];
  };
  const wallet = {
    getUtxos: async () => utxos.slice(0, 2), getChangeAddress: async () => ADDRESS,
    getUsedAddresses: async () => [ADDRESS], getUnusedAddresses: async () => []
  };
  const input = {
    stateDatum: stateFormToDatum(withFallbackAdminUserInStateForm(createDefaultStateForm(), "11".repeat(28))),
    mintLovelace: "2000000", sttSpendReference: `${REFERENCE_HASH}#0`
  };
  const build = () => buildMintStateTokenTx(wallet, input, fetcher);
  const built = await build();
  return { utxos, passes, fetcher, built, build, wallet, input };
}
