import { SttSpendTxRequestSchema } from "@/lib/api";
import { createTxRoute } from "@/lib/http/tx-route";
import { buildSttSpendTx } from "@/lib/mesh/transactions/stt-spend";
import { requireSharedSttReferenceServer } from "@/lib/mesh/shared-stt-reference-server";
import type { SttSpendFormInput } from "@/lib/types/contracts";

export const runtime = "nodejs";

// One route for the nine STT transitions. `action` is a separate builder
// argument, so it is peeled off the validated body rather than passed through.
export const POST = createTxRoute({
  name: "stt-spend",
  schema: SttSpendTxRequestSchema,
  build: async ({ address: _address, config, action, ...input }, wallet, fetcher) =>
    buildSttSpendTx(
      wallet,
      { ...config, sttSpendReference: config.sttSpendReference?.trim() || await requireSharedSttReferenceServer() },
      action,
      input as SttSpendFormInput,
      fetcher
    )
});
