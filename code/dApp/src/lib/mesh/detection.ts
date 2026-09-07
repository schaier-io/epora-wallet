import { type UTxO } from "@meshsdk/core";
import { z } from "zod";
import {
  getSttMintPolicyId,
  getSttSpendScript,
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
  checkedReferenceCount: number;
};


export async function detectSttInfo(knownUnit?: string): Promise<DetectedSttInfo> {
  const fetcher = new ServerFetcher();
  const policyId = getSttMintPolicyId();
  const script = getSttSpendScript();
  const scriptAddress = resolveScriptAddress(script);
  const collectionAssets: Array<{ unit: string; quantity: string }> = [];
  let cursor: number | string | null | undefined;

  if (knownUnit !== undefined) {
    if (!knownUnit.startsWith(policyId) || !/^[0-9a-f]+$/i.test(knownUnit) ||
        knownUnit.length <= POLICY_ID_LENGTH || knownUnit.length > POLICY_ID_LENGTH + 64 || knownUnit.length % 2 !== 0) {
      throw new Error("The requested wallet asset does not match the current STT policy.");
    }
    collectionAssets.push({ unit: knownUnit, quantity: "1" });
  } else do {
    const page = await fetcher.fetchCollectionAssets(policyId, cursor ?? undefined);
    collectionAssets.push(
      ...page.assets.filter((asset) => asset.unit.startsWith(policyId) && asset.unit !== policyId)
    );
    cursor = page.next;
  } while (cursor);

  const tokens: DetectedSttToken[] = [];
  // Known wallets use the asset index. Unknown inventory still enumerates the
  // shared address and remains subject to provider pagination and response limits.
  const scriptUtxos =
    collectionAssets.length > 0 ? await fetcher.fetchAddressUTxOs(scriptAddress, knownUnit) : [];

  for (const asset of collectionAssets) {
    const assetNameHex = asset.unit.slice(POLICY_ID_LENGTH);

    for (const utxo of scriptUtxos) {
      if (utxo.output.address !== scriptAddress ||
          utxo.output.amount.filter((entry) => entry.unit === asset.unit)
            .reduce((sum, entry) => sum + BigInt(entry.quantity), 0n) !== 1n) {
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
 * Walks the same cursor pagination as {@link detectSttInfo} and only counts the
 * assets on each page, because the datums are not needed here. The policy id itself
 * can appear as a pseudo-asset in some providers, so it is excluded.
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

const SharedHelperResponseSchema = z.object({
  result: z.object({
    policyId: z.string().regex(/^[0-9a-f]{56}$/),
    sttScriptHash: z.string().regex(/^[0-9a-f]{56}$/),
    storeAddress: z.string().min(1),
    status: z.enum(["missing", "ready"]),
    activeReference: z.string().regex(/^[0-9a-f]{64}#\d+$/).nullable(),
    matchingReferences: z.array(z.string().regex(/^[0-9a-f]{64}#\d+$/)),
    matchingCount: z.number().int().nonnegative(),
    checkedReferenceCount: z.number().int().nonnegative()
  })
});

/** The server owns discovery. The browser only receives the verified locator. */
export async function detectSharedSttReferenceStore(): Promise<SharedSttReferenceStoreInfo> {
  const response = await fetch("/api/shared-helper", { cache: "no-store" });
  if (!response.ok) throw new Error("Wallet service is temporarily unavailable.");
  const parsed = SharedHelperResponseSchema.safeParse(await response.json());
  if (!parsed.success || (parsed.data.result.status === "ready" && !parsed.data.result.activeReference)) {
    throw new Error("Wallet service returned an invalid setup response.");
  }
  return parsed.data.result;
}
