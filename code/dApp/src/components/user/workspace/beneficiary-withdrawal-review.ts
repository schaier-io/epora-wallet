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

/** Review omitted pools only when the consumed State says this withdrawal removes access. */
export async function buildReviewedBeneficiaryWithdrawal(
  address: string | null,
  build: () => Promise<BuildResult>
): Promise<BuildResult> {
  const result = await build();
  if (result.beneficiaryAccess === "retained") return result;
  if (result.beneficiaryAccess !== "removed") throw new Error(i18n("withdrawalAccessUnknown"));
  if (!address) throw new Error(i18n("withdrawalDiscoveryAddressRequired"));
  const discovered = await fetchScriptUtxos(address);
  const effect = decodeEffect(result.txHex);
  if (effect.decodeError) throw new Error(effect.decodeError);
  const omitted = omittedDiscoveredInputCount(discovered.map((utxo) => utxo.input), effect.inputs);
  return {
    ...result,
    warnings: [
      ...(result.warnings ?? []),
      omitted > 0
        ? i18n("withdrawalOmittedFundsWarning", { count: omitted })
        : i18n("withdrawalAllDiscoveredSelectedWarning")
    ]
  };
}
