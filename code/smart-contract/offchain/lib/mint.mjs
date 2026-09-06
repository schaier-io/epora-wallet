import { Transaction, unixTimeToEnclosingSlot, resolvePaymentKeyHash, SLOT_CONFIG_NETWORK } from "@meshsdk/core";
import { fromScriptRef } from "@meshsdk/core-cst";
import { plutusScript, policyIdOf, scriptAddress, sttAssetName } from "./blueprint.mjs";
import { initialAdminState } from "./state.mjs";

const VALIDITY_MARGIN_MS = 150_000;

// Build only. The CLI owns credentials, signing, and submission.
export async function buildSttMintTx({ wallet, provider, blueprint, sttSpendReference, network = "preprod", nowMs = Date.now() }) {
  if (!sttSpendReference?.trim()) {
    throw new Error("Set STT_SPEND_REFERENCE to the deployed STT reference script txHash#index.");
  }
  const match = sttSpendReference.trim().match(/^([0-9a-f]{64})#(\d+)$/i);
  if (!match || !Number.isSafeInteger(Number(match[2]))) {
    throw new Error("STT_SPEND_REFERENCE must use the format txHash#index with a safe integer index.");
  }
  const txHash = match[1].toLowerCase();
  const outputIndex = Number(match[2]);
  const matchesReference = (utxo) => utxo.input.txHash === txHash && utxo.input.outputIndex === outputIndex;
  const script = plutusScript(blueprint, "stt.stt.mint");
  const policyId = policyIdOf(script);
  const references = await provider.fetchUTxOs(txHash, outputIndex);
  const reference = references.find(matchesReference);
  if (!reference) throw new Error("STT reference output was not found.");
  // Transaction output lookup includes spent outputs. Check its current status too.
  const details = await provider.get(`txs/${txHash}/utxos`);
  if (details?.outputs?.find((output) => output.output_index === outputIndex)?.consumed_by_tx !== null) {
    throw new Error("Cannot confirm the STT reference output is unspent.");
  }
  let attachedScript;
  try {
    attachedScript = fromScriptRef(reference.output.scriptRef);
  } catch {
    throw new Error("STT reference output has no valid reference script.");
  }
  if (!attachedScript || !("code" in attachedScript) || attachedScript.version !== script.version ||
      policyIdOf(attachedScript) !== policyId ||
      (reference.output.scriptHash && reference.output.scriptHash !== policyId)) {
    throw new Error("STT reference script does not match the current blueprint.");
  }
  const address = (await wallet.getUnusedAddresses())[0];
  const sttAddress = scriptAddress(script, 0);
  const isFunding = (utxo) => !matchesReference(utxo) && !utxo.output.scriptRef;
  const funds = (await wallet.getUtxos()).filter(isFunding);
  const [firstUtxo] = funds;
  if (!firstUtxo) throw new Error("No UTxOs found for the example wallet.");
  const assetName = sttAssetName(firstUtxo.input.txHash, firstUtxo.input.outputIndex);
  const collateral = (await wallet.getCollateral()).filter(isFunding);
  if (collateral.length === 0) throw new Error("No collateral available without a reference script. Prepare wallet collateral first.");
  const params = await provider.fetchProtocolParameters();
  const tx = new Transaction({ initiator: wallet, fetcher: provider, evaluator: provider, params });
  tx.txBuilder.invalidBefore(unixTimeToEnclosingSlot(nowMs - VALIDITY_MARGIN_MS, SLOT_CONFIG_NETWORK[network]) - 1);
  tx.txBuilder.invalidHereafter(unixTimeToEnclosingSlot(nowMs + VALIDITY_MARGIN_MS, SLOT_CONFIG_NETWORK[network]) + 1);
  tx.setTxInputs([firstUtxo]);
  tx.setCollateral(collateral);
  // Prevent automatic selection from spending the shared reference output.
  tx.txBuilder.selectUtxosFrom(funds);
  tx.txBuilder
    .mintPlutusScript(script.version)
    .mint("1", policyId, assetName)
    .mintTxInReference(txHash, outputIndex, String(script.code.length / 2), policyId)
    .mintReferenceTxInRedeemerValue({ alternative: 0, fields: [] }, "Mesh");
  tx.setMetadata(721, { [policyId]: { [assetName]: {
    name: "Epora wallet STT",
    description: "Epora permission-wallet state thread token (STT)",
    image: "ipfs://test123"
  } } });
  tx.sendAssets({ address: sttAddress, datum: {
    value: initialAdminState({ adminPaymentKeyHash: resolvePaymentKeyHash(address) }),
    inline: true
  } }, [
    { unit: policyId + assetName, quantity: "1" },
    { unit: "lovelace", quantity: "2000000" }
  ]);
  tx.sendLovelace(address, "5000000");
  tx.setRequiredSigners([address]).setChangeAddress(address).setNetwork(network);
  return { unsignedTx: await tx.build(), policyId, assetName, sttAddress, maxTxSize: params.maxTxSize };
}
