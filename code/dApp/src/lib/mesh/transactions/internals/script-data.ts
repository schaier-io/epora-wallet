import { CARDANO_MAX_TX_SIZE_BYTES } from "./constants";
import { collectErrorText } from "./errors";
import { isRecord } from "./guards";
import { type ServerFetcher } from "@/lib/mesh/server-fetcher";
import { CborWriter, CostModel, Costmdls, Hash32ByteBase16, deserializeTx } from "@/lib/mesh/cst";
import { blake2b } from "ethereum-cryptography/blake2b";
import { bytesToHex, hexToBytes } from "ethereum-cryptography/utils";

type BlockfrostEpochParametersResponse = {
  cost_models_raw?: Record<string, unknown>;
  cost_models?: Record<string, unknown>;
};



type ScriptDataHashRefreshResult = {
  txHex: string;
  beforeHash: string | null;
  afterHash: string | null;
  changed: boolean;
  reason: "no-redeemers" | "updated";
};



function normalizeCostModelList(value: unknown) {
  const entries = Array.isArray(value)
    ? value
    : isRecord(value)
      ? Object.values(value)
      : null;

  if (!entries) {
    return null;
  }

  const costs = entries
    .map((entry) => {
      if (typeof entry === "number" && Number.isFinite(entry)) {
        return entry;
      }

      if (typeof entry === "string" && entry.trim().length > 0) {
        const parsed = Number(entry);
        return Number.isFinite(parsed) ? parsed : null;
      }

      return null;
    })
    .filter((entry): entry is number => entry !== null);

  return costs.length === entries.length ? costs : null;
}



function resolveRawCostModelList(
  response: BlockfrostEpochParametersResponse,
  key: "PlutusV1" | "PlutusV2" | "PlutusV3"
) {
  const containers = [response.cost_models_raw, response.cost_models];

  for (const container of containers) {
    if (!isRecord(container)) {
      continue;
    }

    const candidates = [
      container[key],
      container[key.toLowerCase()],
      container[key.replace("Plutus", "plutus_").toLowerCase()],
      container[key.replace("Plutus", "plutus:").toLowerCase()],
      container[key.replace("Plutus", "plutus_")],
      container[key.replace("Plutus", "plutus:")]
    ];

    for (const candidate of candidates) {
      const costs = normalizeCostModelList(candidate);
      if (costs) {
        return costs;
      }
    }
  }

  return null;
}



function computeScriptDataHashWithCostModels(
  costModels: Costmdls,
  redeemers: { size(): number; toCbor(): string } | undefined,
  datums?: { size(): number; toCbor(): string }
): Hash32ByteBase16 | null {
  const writer = new CborWriter();
  const emptyMap = new Uint8Array([160]);

  if (datums && datums.size() > 0 && (!redeemers || redeemers.size() === 0)) {
    writer.writeEncodedValue(emptyMap);
    writer.writeEncodedValue(hexToBytes(datums.toCbor()));
    writer.writeEncodedValue(emptyMap);
  } else {
    if (!redeemers || redeemers.size() === 0) {
      return null;
    }

    writer.writeEncodedValue(hexToBytes(redeemers.toCbor()));
    if (datums && datums.size() > 0) {
      writer.writeEncodedValue(hexToBytes(datums.toCbor()));
    }
    writer.writeEncodedValue(hexToBytes(costModels.languageViewsEncoding()));
  }

  return Hash32ByteBase16(
    bytesToHex(blake2b(writer.encode(), 32))
  ) as Hash32ByteBase16;
}



export function readScriptDataHash(txHex: string) {
  return deserializeTx(txHex).body().scriptDataHash()?.toString() ?? null;
}



function getCborMajorType(hex: string) {
  const firstByte = Number.parseInt(hex.trim().slice(0, 2), 16);
  return Number.isFinite(firstByte) ? firstByte >> 5 : null;
}



export function isLikelyTransactionCbor(hex: string) {
  return getCborMajorType(hex) === 4;
}



export function setScriptDataHash(txHex: string, scriptDataHash: string) {
  if (!/^[0-9a-f]{64}$/i.test(scriptDataHash)) {
    throw new Error("Computed script integrity hash must be 32 bytes of hex.");
  }

  const tx = deserializeTx(txHex);
  const txBody = tx.body();
  const normalizedScriptDataHash =
    scriptDataHash.toLowerCase() as Hash32ByteBase16;

  txBody.setScriptDataHash(normalizedScriptDataHash);
  tx.setBody(txBody);

  const updatedTxHex = tx.toCbor();
  const updatedScriptDataHash = readScriptDataHash(updatedTxHex);
  if (updatedScriptDataHash !== normalizedScriptDataHash) {
    throw new Error("Unable to update the transaction protocol-parameter hash.");
  }

  return updatedTxHex;
}



export function extractComputedScriptIntegrity(error: unknown) {
  for (const rawMessage of collectErrorText(error)) {
    const message = rawMessage.replace(/\\"/g, '"');
    const computedMatch = message.match(
      /"computedScriptIntegrity"\s*:\s*"([0-9a-f]{64})"/i
    );
    if (computedMatch?.[1]) {
      return computedMatch[1].toLowerCase();
    }

    const expectedMatch = message.match(
      /expected:\s*SJust\s*\(SafeHash\s*"([0-9a-f]{64})"\)/i
    );
    if (expectedMatch?.[1]) {
      return expectedMatch[1].toLowerCase();
    }
  }

  return null;
}



export async function refreshScriptDataHashWithLiveCostModels(
  txHex: string,
  fetcher: ServerFetcher
): Promise<ScriptDataHashRefreshResult> {
  const tx = deserializeTx(txHex);
  const witnessSet = tx.witnessSet();
  const redeemers = witnessSet.redeemers();
  const beforeHash = tx.body().scriptDataHash()?.toString() ?? null;

  if (!redeemers || redeemers.size() === 0) {
    return {
      txHex,
      beforeHash,
      afterHash: beforeHash,
      changed: false,
      reason: "no-redeemers"
    };
  }

  const rawProtocolParametersUnknown = await fetcher.get("epochs/latest/parameters");
  if (!isRecord(rawProtocolParametersUnknown)) {
    throw new Error("Blockfrost returned malformed latest protocol parameters.");
  }

  const rawProtocolParameters =
    rawProtocolParametersUnknown as BlockfrostEpochParametersResponse;
  const costModels = new Costmdls();
  const plutusV1Scripts = witnessSet.plutusV1Scripts();
  const plutusV2Scripts = witnessSet.plutusV2Scripts();
  const plutusV3Scripts = witnessSet.plutusV3Scripts();
  const requiresPlutusV1 = Boolean(plutusV1Scripts && plutusV1Scripts.size() > 0);
  const requiresPlutusV2 = Boolean(plutusV2Scripts && plutusV2Scripts.size() > 0);
  const requiresPlutusV3 =
    Boolean(plutusV3Scripts && plutusV3Scripts.size() > 0) ||
    (!requiresPlutusV1 && !requiresPlutusV2);

  if (requiresPlutusV1) {
    const v1Costs = resolveRawCostModelList(rawProtocolParameters, "PlutusV1");
    if (!v1Costs) {
      throw new Error("Unable to load the live Plutus V1 cost model from Blockfrost.");
    }
    costModels.insert(CostModel.newPlutusV1(v1Costs));
  }

  if (requiresPlutusV2) {
    const v2Costs = resolveRawCostModelList(rawProtocolParameters, "PlutusV2");
    if (!v2Costs) {
      throw new Error("Unable to load the live Plutus V2 cost model from Blockfrost.");
    }
    costModels.insert(CostModel.newPlutusV2(v2Costs));
  }

  if (requiresPlutusV3) {
    const v3Costs = resolveRawCostModelList(rawProtocolParameters, "PlutusV3");
    if (!v3Costs) {
      throw new Error("Unable to load the live Plutus V3 cost model from Blockfrost.");
    }
    costModels.insert(CostModel.newPlutusV3(v3Costs));
  }

  const nextScriptDataHash = computeScriptDataHashWithCostModels(
    costModels,
    redeemers,
    witnessSet.plutusData() ?? undefined
  );

  if (!nextScriptDataHash) {
    return {
      txHex,
      beforeHash,
      afterHash: beforeHash,
      changed: false,
      reason: "no-redeemers"
    };
  }

  const txBody = tx.body();
  txBody.setScriptDataHash(nextScriptDataHash);
  tx.setBody(txBody);
  const refreshedTxHex = tx.toCbor();
  const afterHash = readScriptDataHash(refreshedTxHex);

  return {
    txHex: refreshedTxHex,
    beforeHash,
    afterHash,
    changed: beforeHash !== afterHash,
    reason: "updated"
  };
}



export function buildTxSizeSummary(txHex: string) {
  const usedBytes = Math.ceil(txHex.length / 2);
  const percentage = ((usedBytes / CARDANO_MAX_TX_SIZE_BYTES) * 100).toFixed(2);

  return {
    usedBytes,
    maxBytes: CARDANO_MAX_TX_SIZE_BYTES,
    percentage
  };
}



export function plutusScriptSizeBytes(script: { code: string }) {
  return Math.ceil(script.code.length / 2);
}



export function formatByteCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}


