import { DeployReferenceTxRequestSchema } from "@/lib/api";
import { createTxRoute } from "@/lib/http/tx-route";
import { buildDeploySharedSttReferenceTx } from "@/lib/mesh/transactions/deploy-shared-reference";

export const runtime = "nodejs";

export const POST = createTxRoute({
  name: "deploy-reference",
  schema: DeployReferenceTxRequestSchema,
  build: async ({ address: _address, ...options }, wallet, fetcher) =>
    buildDeploySharedSttReferenceTx(wallet, options, fetcher)
});
