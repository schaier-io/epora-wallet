import { isConstrDataValue } from "./guards";
import { type ConstrData, type ContractConfig } from "@/lib/types/contracts";
import {
  isOnChainInteger,
  type OnChainInteger
} from "@/lib/contracts/on-chain-integer";

export function waitFor(milliseconds: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

export function resolveEffectiveAssetNameHex(config: ContractConfig) {
  const walletAssetNameHex = config.walletAssetNameHex?.trim() ?? "";
  const sttAssetNameHex = config.sttAssetNameHex.trim();
  return walletAssetNameHex || sttAssetNameHex;
}

export function readProofOfLifeOption(
  datum: ConstrData | null | undefined,
  index: number
): OnChainInteger | null | undefined {
  if (!datum || datum.alternative !== 0 || datum.fields.length <= index) {
    return undefined;
  }

  const value = datum.fields[index];
  if (!isConstrDataValue(value)) {
    return undefined;
  }

  if (value.alternative === 1 && value.fields.length === 0) {
    return null;
  }

  if (value.alternative === 0 && value.fields.length === 1 && isOnChainInteger(value.fields[0])) {
    return value.fields[0];
  }

  return undefined;
}
