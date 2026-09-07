// Mint a fresh STT with the current blueprint and initial admin State.
// Prerequisites: a funded wallet_1.sk, provider settings, STT_SPEND_REFERENCE.
import { MeshWallet } from "@meshsdk/core";
import fs from "node:fs";
import "dotenv/config";
import { loadBlueprint } from "./lib/blueprint.mjs";
import { resolveProvider } from "./lib/network.mjs";
import { buildSttMintTx } from "./lib/mint.mjs";

try {
  if (!process.env.STT_SPEND_REFERENCE?.trim()) {
    throw new Error("Set STT_SPEND_REFERENCE to the deployed STT reference script txHash#index. See README.md.");
  }
  const { provider, network, networkId } = resolveProvider();
  const wallet = new MeshWallet({
    networkId,
    fetcher: provider,
    submitter: provider,
    key: { type: "mnemonic", words: fs.readFileSync("wallet_1.sk", "utf8").trim().split(/\s+/) },
  });
  console.log("Building STT mint with the configured reference script...");
  const { unsignedTx, policyId, assetName, sttAddress, maxTxSize } = await buildSttMintTx({
    wallet, provider, network, blueprint: loadBlueprint("./plutus.json"),
    sttSpendReference: process.env.STT_SPEND_REFERENCE,
  });
  const signedTx = await wallet.signTx(unsignedTx, true);
  if (signedTx.length / 2 > maxTxSize) {
    throw new Error(`Signed transaction exceeds the protocol limit of ${maxTxSize} bytes.`);
  }
  const txHash = await wallet.submitTx(signedTx);
  console.log(`Minted STT:
  Tx ID: ${txHash}
  AssetName: ${assetName}
  PolicyId: ${policyId}
  AssetId: ${policyId + assetName}
  Script Address: ${sttAddress}`);
} catch (error) {
  console.error("STT mint failed:", error);
  process.exitCode = 1;
}
