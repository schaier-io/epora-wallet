import { WalletSpendTxRequestSchema } from "@/lib/api";
import { createTxRoute } from "@/lib/http/tx-route";
import { buildWalletSpendTx } from "@/lib/mesh/transactions/wallet-spend";
import type { WalletSpendFormInput } from "@/lib/types/contracts";

export const runtime = "nodejs";

export const POST = createTxRoute({
  name: "wallet-spend",
  schema: WalletSpendTxRequestSchema,
  build: async ({ address: _address, config, ...input }, wallet, fetcher) =>
    buildWalletSpendTx(wallet, config, input as WalletSpendFormInput, fetcher)
});
