import { MintTxRequestSchema } from "@/lib/api";
import { createTxRoute } from "@/lib/http/tx-route";
import { buildMintStateTokenTx } from "@/lib/mesh/transactions/mint-state-token";
import { requireSharedSttReferenceServer } from "@/lib/mesh/shared-stt-reference-server";
import type { MintFormInput } from "@/lib/types/contracts";

export const runtime = "nodejs";

export const POST = createTxRoute({
  name: "mint",
  schema: MintTxRequestSchema,
  build: async ({ address: _address, ...input }, wallet, fetcher) =>
    buildMintStateTokenTx(wallet, {
      ...input,
      sttSpendReference: input.sttSpendReference?.trim() || await requireSharedSttReferenceServer()
    } as MintFormInput, fetcher)
});
