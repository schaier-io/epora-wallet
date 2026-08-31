import { PublishTxRequestSchema } from "@/lib/api";
import { createTxRoute } from "@/lib/http/tx-route";
import { buildWalletPublishTx } from "@/lib/mesh/transactions/wallet-governance";
import type { WalletPublishFormInput } from "@/lib/types/contracts";

export const runtime = "nodejs";

export const POST = createTxRoute({
  name: "publish",
  schema: PublishTxRequestSchema,
  build: async ({ address: _address, config, ...input }, wallet, fetcher) =>
    buildWalletPublishTx(wallet, config, input as WalletPublishFormInput, fetcher)
});
