import type { BuildResult, WalletInputRef } from "@/lib/types/contracts";
import { decodeEffect } from "@/lib/proposals/verify";
import { fetchScriptUtxos } from "./helpers/transactions";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceWorkspaceTransactions.json";

const i18n = createDefaultTranslator("ComponentsUserWorkspaceWorkspaceTransactions", defaultMessages);
const referenceKey = (ref: WalletInputRef) => `${ref.txHash.toLowerCase()}#${ref.outputIndex}`;

export function omittedDiscoveredInputCount(
  discovered: WalletInputRef[],
  transactionInputs: WalletInputRef[]
): number {
  const consumed = new Set(transactionInputs.map(referenceKey));
  return new Set(discovered.map(referenceKey).filter((key) => !consumed.has(key))).size;
}

/** Refresh discovery before building, then compare against the actual transaction inputs. */
export async function buildReviewedBeneficiaryExit(
  address: string | null,
  build: () => Promise<BuildResult>
): Promise<BuildResult> {
  if (!address) throw new Error(i18n("exitDiscoveryAddressRequired"));
  const discovered = await fetchScriptUtxos(address);
  const result = await build();
  const effect = decodeEffect(result.txHex);
  if (effect.decodeError) throw new Error(effect.decodeError);
  const omitted = omittedDiscoveredInputCount(discovered.map((utxo) => utxo.input), effect.inputs);
  return {
    ...result,
    warnings: [
      ...(result.warnings ?? []),
      i18n("exitRightsWarning"),
      i18n("exitUnusedShareWarning"),
      omitted > 0
        ? i18n("exitOmittedFundsWarning", { count: omitted })
        : i18n("exitAllDiscoveredSelectedWarning")
    ]
  };
}
