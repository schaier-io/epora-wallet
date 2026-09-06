import type { BeneficiaryPreparationFormInput, ContractConfig } from "@/lib/types/contracts";
import type { TxFetcher, WalletSource } from "@/lib/mesh/tx-context";
import { buildConsolidateUtxosTx } from "./consolidate-utxos";
/** Reuse the existing beneficiary Consolidate permission with a server-derived layout. */
export function buildBeneficiaryPreparationTx(wallet: WalletSource, config: ContractConfig, input: BeneficiaryPreparationFormInput, fetcher?: TxFetcher) {
  return buildConsolidateUtxosTx(wallet, config, {
    ...input,
    beneficiaryPreparation: true
  }, fetcher);
}
