import { BlockfrostProvider } from "@meshsdk/core";
import type { IFetcherOptions, UTxO } from "@meshsdk/common";
import type { ChainMethod } from "@/lib/types/contracts";

export const METHOD_VALUES = [
  "fetchAccountInfo",
  "fetchAddressUTxOs",
  "fetchAddressTxs",
  "fetchAssetAddresses",
  "fetchAssetMetadata",
  "fetchBlockInfo",
  "fetchCollectionAssets",
  "fetchProtocolParameters",
  "fetchCostModels",
  "fetchTxInfo",
  "fetchUTxOs",
  "fetchGovernanceProposal",
  "evaluateTx",
  "submitTx",
  "get"
] as const satisfies readonly ChainMethod[];

export function getBlockfrostProvider() {
  const apiKey = process.env.BLOCKFROST_PREPROD_PROJECT_ID;

  if (!apiKey) {
    throw new Error("Missing BLOCKFROST_PREPROD_PROJECT_ID in environment.");
  }

  return new BlockfrostProvider(apiKey);
}

function getStringArg(args: unknown[], index: number, label: string) {
  const value = args[index];

  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Argument '${label}' at index ${index} must be a non-empty string.`);
  }

  return value;
}

// SSRF defense-in-depth for the `get` passthrough: Blockfrost paths are
// relative (e.g. "/pools/<id>"). Reject any scheme-prefixed value (URL parsers
// accept "http:host" without slashes, so checking for "://" alone is not
// enough), protocol-relative URLs, backslashes (treated as slashes by some
// parsers), and path traversal so an attacker can't aim the proxy at another
// host. The check runs against the raw value AND its fully percent-decoded form
// (decoded in a bounded loop until stable, so double-encoded payloads like
// "%252e%252e/admin" can't slip a traversal or a second host past the guard no
// matter how many decode passes a downstream applies).
function getRelativePathArg(args: unknown[], index: number, label: string) {
  const value = getStringArg(args, index, label);

  const reject = () => {
    throw new Error(`Argument '${label}' at index ${index} must be a relative Blockfrost path.`);
  };

  // Peel percent-encoding until it stops changing (cap the passes to avoid a
  // pathological loop). Malformed encoding is itself suspicious for a plain path.
  let decoded = value;
  for (let pass = 0; pass < 5; pass++) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      reject();
      return value;
    }
    if (next === decoded) break;
    decoded = next;
  }

  const looksUnsafe = (candidate: string) =>
    /^[a-z][a-z0-9+.-]*:/i.test(candidate) ||
    candidate.includes("://") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    candidate.includes("..");

  if (looksUnsafe(value) || looksUnsafe(decoded)) {
    reject();
  }

  return value;
}

function getOptionalStringArg(args: unknown[], index: number, label: string) {
  const value = args[index];

  if (typeof value === "undefined" || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`Argument '${label}' at index ${index} must be a string.`);
  }

  return value;
}

function getNumberArg(args: unknown[], index: number, label: string) {
  const value = args[index];

  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Argument '${label}' at index ${index} must be a number.`);
  }

  return value;
}

function getOptionalNumberArg(args: unknown[], index: number, label: string) {
  const value = args[index];

  if (typeof value === "undefined" || value === null) {
    return undefined;
  }

  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Argument '${label}' at index ${index} must be a number.`);
  }

  return value;
}

function getOptionalCursorArg(args: unknown[], index: number, label: string) {
  const value = args[index];

  if (typeof value === "undefined" || value === null) {
    return undefined;
  }

  if (typeof value === "number" && !Number.isNaN(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  throw new Error(`Argument '${label}' at index ${index} must be a numeric string or number.`);
}

function getOptionalObjectArg(args: unknown[], index: number, label: string) {
  const value = args[index];

  if (typeof value === "undefined" || value === null) {
    return undefined;
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Argument '${label}' at index ${index} must be an object.`);
  }

  return value as IFetcherOptions;
}

function getOptionalUtxosArg(args: unknown[], index: number, label: string) {
  const value = args[index];

  if (typeof value === "undefined" || value === null) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`Argument '${label}' at index ${index} must be an array.`);
  }

  return value as UTxO[];
}

function getOptionalStringArrayArg(args: unknown[], index: number, label: string) {
  const value = args[index];

  if (typeof value === "undefined" || value === null) {
    return undefined;
  }

  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`Argument '${label}' at index ${index} must be an array of strings.`);
  }

  return value as string[];
}

async function toUnknown(value: Promise<unknown>): Promise<unknown> {
  return (await value) as unknown;
}

export async function executeMeshMethod(
  provider: BlockfrostProvider,
  method: ChainMethod,
  args: unknown[]
): Promise<unknown> {
  switch (method) {
    case "fetchAccountInfo": {
      return toUnknown(provider.fetchAccountInfo(getStringArg(args, 0, "address")));
    }
    case "fetchAddressUTxOs": {
      return toUnknown(
        provider.fetchAddressUTxOs(
          getStringArg(args, 0, "address"),
          getOptionalStringArg(args, 1, "asset")
        )
      );
    }
    case "fetchAddressTxs": {
      return toUnknown(
        provider.fetchAddressTxs(
          getStringArg(args, 0, "address"),
          getOptionalObjectArg(args, 1, "options")
        )
      );
    }
    case "fetchAssetAddresses": {
      return toUnknown(provider.fetchAssetAddresses(getStringArg(args, 0, "asset")));
    }
    case "fetchAssetMetadata": {
      return toUnknown(provider.fetchAssetMetadata(getStringArg(args, 0, "asset")));
    }
    case "fetchBlockInfo": {
      return toUnknown(provider.fetchBlockInfo(getStringArg(args, 0, "hash")));
    }
    case "fetchCollectionAssets": {
      return toUnknown(
        provider.fetchCollectionAssets(
          getStringArg(args, 0, "policyId"),
          getOptionalCursorArg(args, 1, "cursor")
        )
      );
    }
    case "fetchProtocolParameters": {
      return toUnknown(
        provider.fetchProtocolParameters(getOptionalNumberArg(args, 0, "epoch"))
      );
    }
    case "fetchCostModels": {
      return toUnknown(
        provider.fetchCostModels(getOptionalNumberArg(args, 0, "epoch"))
      );
    }
    case "fetchTxInfo": {
      return toUnknown(provider.fetchTxInfo(getStringArg(args, 0, "hash")));
    }
    case "fetchUTxOs": {
      return toUnknown(
        provider.fetchUTxOs(
          getStringArg(args, 0, "hash"),
          getOptionalNumberArg(args, 1, "index")
        )
      );
    }
    case "fetchGovernanceProposal": {
      return toUnknown(
        provider.fetchGovernanceProposal(
          getStringArg(args, 0, "txHash"),
          getNumberArg(args, 1, "certIndex")
        )
      );
    }
    case "evaluateTx": {
      return toUnknown(
        provider.evaluateTx(
          getStringArg(args, 0, "tx"),
          getOptionalUtxosArg(args, 1, "additionalUtxos"),
          getOptionalStringArrayArg(args, 2, "additionalTxs")
        )
      );
    }
    case "submitTx": {
      return toUnknown(provider.submitTx(getStringArg(args, 0, "tx")));
    }
    case "get": {
      return toUnknown(provider.get(getRelativePathArg(args, 0, "url")));
    }
    default: {
      throw new Error(`Unsupported method: ${method as string}`);
    }
  }
}
