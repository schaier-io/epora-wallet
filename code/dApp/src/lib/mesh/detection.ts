import { resolveScriptHash, type UTxO } from "@meshsdk/core";
import { fromScriptRef } from "@meshsdk/core-cst";
import {
  getSttMintPolicyId,
  getSttSpendScript,
  resolveSttReferenceStoreAddress,
  resolveScriptAddress
} from "@/lib/contracts/blueprint";
import { decodeDatumFromUtxo } from "@/lib/mesh/datum";
import { ServerFetcher } from "@/lib/mesh/server-fetcher";
import type { ConstrData } from "@/lib/types/contracts";

const POLICY_ID_LENGTH = 56;

export type DetectedSttToken = {
  policyId: string;
  assetNameHex: string;
  unit: string;
  scriptAddress: string;
  utxo: UTxO;
  datum: ConstrData | null;
};

export type DetectedSttInfo = {
  policyId: string;
  assetNameHex: string;
  scriptAddress: string;
  sttUtxos: UTxO[];
  tokens: DetectedSttToken[];
};

type SharedSttReferenceStoreStatus = "missing" | "ready";

export type SharedSttReferenceStoreInfo = {
  policyId: string;
  sttScriptHash: string;
  storeAddress: string;
  status: SharedSttReferenceStoreStatus;
  activeReference: string | null;
  matchingReferences: string[];
  matchingCount: number;
  staleReferenceCount: number;
  storeUtxoCount: number;
};

function createInputRefKey(txHash: string, outputIndex: number) {
  return `${txHash}#${outputIndex}`;
}

function compareReferenceKeys(left: string, right: string) {
  return left.localeCompare(right, "en", { sensitivity: "base" });
}

function hasReferenceScript(utxo: UTxO) {
  return typeof utxo.output.scriptRef === "string" && utxo.output.scriptRef.length > 0;
}

function utxoMatchesReferenceScript(
  utxo: UTxO,
  script: { code: string; version: "V1" | "V2" | "V3" }
) {
  const scriptRef = utxo.output.scriptRef;
  if (typeof scriptRef !== "string" || scriptRef.length === 0) {
    return false;
  }

  const expectedHash = resolveScriptHash(script.code, script.version);
  if (utxo.output.scriptHash) {
    return utxo.output.scriptHash === expectedHash;
  }

  const parsedScript = fromScriptRef(scriptRef);
  if (!parsedScript || !("code" in parsedScript)) {
    return false;
  }

  if (parsedScript.version !== script.version) {
    return false;
  }

  return resolveScriptHash(parsedScript.code, parsedScript.version) === expectedHash;
}

export async function detectSttInfo(): Promise<DetectedSttInfo> {
  const fetcher = new ServerFetcher();
  const policyId = getSttMintPolicyId();
  const script = getSttSpendScript();
  const scriptAddress = resolveScriptAddress(script);
  const collectionAssets: Array<{ unit: string; quantity: string }> = [];
  let cursor: number | string | null | undefined;

  do {
    const page = await fetcher.fetchCollectionAssets(policyId, cursor ?? undefined);
    collectionAssets.push(
      ...page.assets.filter((asset) => asset.unit.startsWith(policyId) && asset.unit !== policyId)
    );
    cursor = page.next;
  } while (cursor);

  const tokens: DetectedSttToken[] = [];

  for (const asset of collectionAssets) {
    const assetNameHex = asset.unit.slice(POLICY_ID_LENGTH);
    const scriptUtxos = await fetcher.fetchAddressUTxOs(scriptAddress, asset.unit);

    for (const utxo of scriptUtxos) {
      if (!utxo.output.amount.some((entry) => entry.unit === asset.unit)) {
        continue;
      }

      tokens.push({
        policyId,
        assetNameHex,
        unit: asset.unit,
        scriptAddress,
        utxo,
        datum: decodeDatumFromUtxo(utxo)
      });
    }
  }

  const sttUtxos = tokens.map((token) => token.utxo);

  if (tokens.length === 0) {
    return {
      policyId,
      assetNameHex: "",
      scriptAddress,
      sttUtxos,
      tokens
    };
  }

  return {
    policyId,
    assetNameHex: tokens[0]?.assetNameHex ?? "",
    scriptAddress,
    sttUtxos,
    tokens
  };
}

/**
 * Counts how many distinct STT assets currently exist under {@link policyId}.
 *
 * There is no on-chain mint counter, so the "wallet number" shown on the
 * membership card is derived from the size of the policy's asset collection.
 * Mirrors the cursor pagination in {@link detectSttInfo} but skips the
 * per-asset UTxO lookups — we only need the count, not the datums. The policy
 * id itself can appear as a pseudo-asset in some providers, so it is excluded.
 */
export async function countSttTokens(policyId: string): Promise<number> {
  const fetcher = new ServerFetcher();
  let total = 0;
  let cursor: number | string | null | undefined;

  do {
    const page = await fetcher.fetchCollectionAssets(policyId, cursor ?? undefined);
    total += page.assets.filter(
      (asset) => asset.unit.startsWith(policyId) && asset.unit !== policyId
    ).length;
    cursor = page.next;
  } while (cursor);

  return total;
}

export async function detectSharedSttReferenceStore(): Promise<SharedSttReferenceStoreInfo> {
  const fetcher = new ServerFetcher();
  const sttScript = getSttSpendScript();
  const storeAddress = resolveSttReferenceStoreAddress();
  const storeUtxos = await fetcher.fetchAddressUTxOs(storeAddress);
  const referenceStoreUtxos = storeUtxos.filter(hasReferenceScript);
  const matchingReferences = referenceStoreUtxos
    .filter((utxo) => utxoMatchesReferenceScript(utxo, sttScript))
    .map((utxo) => createInputRefKey(utxo.input.txHash, utxo.input.outputIndex))
    .sort(compareReferenceKeys);
  const matchingCount = matchingReferences.length;

  return {
    policyId: getSttMintPolicyId(),
    sttScriptHash: resolveScriptHash(sttScript.code, sttScript.version),
    storeAddress,
    status: matchingCount === 0 ? "missing" : "ready",
    activeReference: matchingReferences[0] ?? null,
    matchingReferences,
    matchingCount,
    staleReferenceCount: referenceStoreUtxos.length - matchingCount,
    storeUtxoCount: storeUtxos.length
  };
}
