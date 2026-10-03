import { DEFAULT_PROTOCOL_PARAMETERS, DEFAULT_V1_COST_MODEL_LIST, DEFAULT_V2_COST_MODEL_LIST, DEFAULT_V3_COST_MODEL_LIST, type Protocol } from "@meshsdk/common";
import { OfflineEvaluatorScalus, toScriptRef } from "@meshsdk/core-cst";
import { resolveScriptHash, resolveScriptHashDRepId, serializeData, serializeRewardAddress, type PlutusScript, type UTxO } from "@meshsdk/core";
import { getSttMintPolicyId, getSttSpendScript, getWalletSpendScript, getWalletWithdrawScript, getWalletPublishScript, getWalletVoteScript, resolveScriptAddress } from "@/lib/contracts/blueprint";
import { createDefaultStateForm, stateFormToDatum, withFallbackAdminUserInStateForm } from "@/lib/contracts/state-form";
import { ServerFetcher } from "@/lib/mesh/server-fetcher";
import { createOfflineBuildParameters } from "./offline-evaluation-mint-fixture";
import { buildSttSpendTx } from "./stt-spend";
import { buildWalletWithdrawTx } from "./wallet-withdraw";
import { buildWalletPublishTx, buildWalletVoteTx } from "./wallet-governance";

const ADDRESS = "addr_test1vqg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygxrcya6";
const KEY = "11".repeat(28);
const STT_REFERENCE_HASH = "44".repeat(32);
const ASSET_NAME = "deadbeef";
const COST_MODELS = [DEFAULT_V1_COST_MODEL_LIST, DEFAULT_V2_COST_MODEL_LIST, DEFAULT_V3_COST_MODEL_LIST];

export type OfflineAction = "state-update" | "wallet-spend" | "withdraw" | "publish" | "vote";

export async function createOfflineActionFixture(action: OfflineAction, authorized = true, options?: { costModels?: number[][]; protocolParameters?: Protocol }) {
  const costModels = options?.costModels ?? COST_MODELS;
  const protocolParameters = options?.protocolParameters ?? DEFAULT_PROTOCOL_PARAMETERS;
  // Different immutable fixtures must never reuse a transaction reference.
  const actionIndex = ["state-update", "wallet-spend", "withdraw", "publish", "vote"].indexOf(action);
  const stateHash = (0x30 + actionIndex + (authorized ? 0 : 0x10)).toString(16).repeat(32);
  const actionReferenceHash = (0x50 + actionIndex).toString(16).repeat(32);
  const policy = getSttMintPolicyId();
  const params = { sttPolicyId: policy, sttAssetNameHex: ASSET_NAME };
  const stateScript = getSttSpendScript();
  const stateDatum = stateFormToDatum(withFallbackAdminUserInStateForm(createDefaultStateForm(), authorized ? KEY : "77".repeat(28)));
  const stateAmount = [{ unit: "lovelace", quantity: "3000000" }, { unit: policy + ASSET_NAME, quantity: "1" }];
  const funding = ["aa", "bb"].map(txByte => ({ input: { txHash: txByte.repeat(32), outputIndex: 0 }, output: { address: ADDRESS, amount: [{ unit: "lovelace", quantity: "1000000000" }] } }));
  const utxos: UTxO[] = [...funding, { input: { txHash: stateHash, outputIndex: 0 }, output: { address: resolveScriptAddress(stateScript), amount: stateAmount, plutusData: serializeData(stateDatum, "Mesh") } }];
  function reference(hash: string, script: PlutusScript) {
    utxos.push({ input: { txHash: hash, outputIndex: 0 }, output: { address: ADDRESS, amount: [{ unit: "lovelace", quantity: "100000000" }], scriptRef: String(toScriptRef(script).toCbor()), scriptHash: resolveScriptHash(script.code, script.version) } });
  }
  reference(STT_REFERENCE_HASH, stateScript);
  const actionScript = action === "withdraw" ? getWalletWithdrawScript(params) : action === "publish" ? getWalletPublishScript(params) : action === "vote" ? getWalletVoteScript(params) : getWalletSpendScript(params);
  if (["withdraw", "publish", "vote"].includes(action)) reference(actionReferenceHash, actionScript);
  const walletInput: UTxO = { input: { txHash: "66".repeat(32), outputIndex: 0 }, output: { address: resolveScriptAddress(getWalletSpendScript(params)), amount: [{ unit: "lovelace", quantity: "10000000" }] } };
  if (action === "wallet-spend") utxos.push(walletInput);
  const fetcher = new ServerFetcher();
  fetcher.fetchProtocolParameters = async () => protocolParameters;
  fetcher.fetchCostModels = async () => costModels;
  fetcher.fetchUTxOs = async (hash, index) => utxos.filter(utxo => utxo.input.txHash === hash && (index === undefined || utxo.input.outputIndex === index));
  fetcher.fetchAddressUTxOs = async address => utxos.filter(utxo => utxo.output.address === address);
  fetcher.get = async path => path.includes("epochs/latest/parameters") ? createOfflineBuildParameters(protocolParameters, costModels) : { outputs: utxos.filter(utxo => path.includes(utxo.input.txHash)).map(utxo => ({ output_index: utxo.input.outputIndex, consumed_by_tx: null })) };
  const evaluator = new OfflineEvaluatorScalus(fetcher, "preprod", undefined, costModels);
  const passes: Awaited<ReturnType<typeof evaluator.evaluateTx>>[] = [];
  const txHexes: string[] = [];
  fetcher.evaluateTx = async txHex => {
    txHexes.push(txHex);
    const start = performance.now();
    const result = await evaluator.evaluateTx(txHex, utxos);
    passes.push(result);
    if (typeof process !== "undefined") process.stdout.write(`[offline-evaluation:actions] ${JSON.stringify({ action, pass: passes.length, milliseconds: performance.now() - start, result })}\n`);
    return result;
  };
  const wallet = { getUtxos: async () => funding, getChangeAddress: async () => ADDRESS, getUsedAddresses: async () => [ADDRESS], getUnusedAddresses: async () => [] };
  const config = { walletPolicyId: policy, walletAssetNameHex: ASSET_NAME, sttAssetNameHex: ASSET_NAME, sttSpendReference: `${STT_REFERENCE_HASH}#0`, walletWithdrawReference: `${actionReferenceHash}#0`, walletPublishReference: `${actionReferenceHash}#0`, walletVoteReference: `${actionReferenceHash}#0` };
  const shared = { sttInputTxHash: stateHash, sttInputOutputIndex: 0, sttOutputDatum: stateDatum, sttOutputAssets: stateAmount };
  const rewardAddress = serializeRewardAddress(resolveScriptHash(actionScript.code, actionScript.version), true, 0) as string;
  const build = action === "withdraw" ? () => buildWalletWithdrawTx(wallet, config, { ...shared, rewardAddress, amountLovelace: "1000000" }, fetcher)
    : action === "publish" ? () => buildWalletPublishTx(wallet, config, { ...shared, certificate: { type: "VoteDelegation", stakeKeyAddress: rewardAddress, drep: { alwaysAbstain: null } } }, fetcher)
    : action === "vote" ? () => buildWalletVoteTx(wallet, config, { ...shared, vote: { voter: { type: "DRep", drepId: resolveScriptHashDRepId(resolveScriptHash(actionScript.code, actionScript.version)) }, govActionId: { txHash: "99".repeat(32), txIndex: 0 }, votingProcedure: { voteKind: "Yes" } } }, fetcher)
    : () => buildSttSpendTx(wallet, config, action === "state-update" ? "update-state" : "use", { sttInputTxHash: stateHash, sttInputOutputIndex: 0, outputDatum: stateDatum, outputAssets: stateAmount, ...(action === "wallet-spend" ? { walletInputs: [walletInput.input] } : {}) }, fetcher);
  return { build, passes, txHexes, fetcher, utxos };
}

