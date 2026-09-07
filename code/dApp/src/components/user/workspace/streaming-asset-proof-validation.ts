import type { WalletBalanceSummary } from "./types";
import type { ConstrData } from "@/lib/types/contracts";
import { getFreshStreamingAssetUnits, getMissingStreamingAssetUnits } from "@/lib/contracts/streaming-asset-proof";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/LibContractsStateValidation.json";

const i18n = createDefaultTranslator("LibContractsStateValidation", defaultMessages);

/** A loaded proof from either wallet is enough. A failed lookup does not establish absence. */
export function validateStreamingAssetProofDraft(
  outputStateDatum: ConstrData,
  sources: readonly WalletBalanceSummary[],
  inputStateDatum?: ConstrData
): string[] {
  const requiredUnits = getFreshStreamingAssetUnits(outputStateDatum, inputStateDatum);
  if (requiredUnits.length === 0) return [];
  let missingUnits: string[];
  try {
    missingUnits = getMissingStreamingAssetUnits(requiredUnits, sources
      .filter((source) => !source.loading && !source.error)
      .flatMap((source) => source.assets));
  } catch {
    return [i18n("streamingAssetProofUnavailable")];
  }
  if (missingUnits.length === 0) return [];
  if (sources.length === 0 || sources.some((source) => source.loading)) {
    return [i18n("streamingAssetProofLoading")];
  }
  if (sources.some((source) => source.error)) return [i18n("streamingAssetProofUnavailable")];
  return missingUnits.map((unit) => i18n("streamingAssetProofRequired", { unit }));
}
