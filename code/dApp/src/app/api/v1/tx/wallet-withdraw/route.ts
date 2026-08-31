import { WalletWithdrawTxRequestSchema } from "@/lib/api";
import { createTxRoute } from "@/lib/http/tx-route";
import { buildWalletWithdrawTx } from "@/lib/mesh/transactions/wallet-withdraw";
import type { WalletWithdrawFormInput } from "@/lib/types/contracts";

export const runtime = "nodejs";

export const POST = createTxRoute({
  name: "wallet-withdraw",
  schema: WalletWithdrawTxRequestSchema,
  build: async ({ address: _address, config, ...input }, wallet, fetcher) =>
    buildWalletWithdrawTx(wallet, config, input as WalletWithdrawFormInput, fetcher)
});
