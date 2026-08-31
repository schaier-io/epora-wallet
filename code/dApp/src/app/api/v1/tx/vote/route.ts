import { VoteTxRequestSchema } from "@/lib/api";
import { createTxRoute } from "@/lib/http/tx-route";
import { buildWalletVoteTx } from "@/lib/mesh/transactions/wallet-governance";
import type { WalletVoteFormInput } from "@/lib/types/contracts";

export const runtime = "nodejs";

export const POST = createTxRoute({
  name: "vote",
  schema: VoteTxRequestSchema,
  build: async ({ address: _address, config, ...input }, wallet, fetcher) =>
    buildWalletVoteTx(wallet, config, input as WalletVoteFormInput, fetcher)
});
