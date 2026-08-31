import { LockFundsTxRequestSchema } from "@/lib/api";
import { createTxRoute } from "@/lib/http/tx-route";
import { buildLockFundsTx } from "@/lib/mesh/transactions/lock-funds";
import type { LockFundsFormInput } from "@/lib/types/contracts";

export const runtime = "nodejs";

export const POST = createTxRoute({
  name: "lock-funds",
  schema: LockFundsTxRequestSchema,
  build: async ({ address: _address, config, ...input }, wallet, fetcher) =>
    buildLockFundsTx(wallet, config, input as LockFundsFormInput, fetcher)
});
