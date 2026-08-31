import { ConsolidateTxRequestSchema } from "@/lib/api";
import { createTxRoute } from "@/lib/http/tx-route";
import { buildConsolidateUtxosTx } from "@/lib/mesh/transactions/consolidate-utxos";
import type { ConsolidateUtxosFormInput } from "@/lib/types/contracts";

export const runtime = "nodejs";

export const POST = createTxRoute({
  name: "consolidate",
  schema: ConsolidateTxRequestSchema,
  build: async ({ address: _address, config, ...input }, wallet, fetcher) =>
    buildConsolidateUtxosTx(wallet, config, input as ConsolidateUtxosFormInput, fetcher)
});
