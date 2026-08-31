import { SetStakeCredentialTxRequestSchema } from "@/lib/api";
import { createTxRoute } from "@/lib/http/tx-route";
import { buildSetIntendedStakeCredentialTx } from "@/lib/mesh/transactions/set-intended-stake-credential";
import type { SetIntendedStakeCredentialFormInput } from "@/lib/types/contracts";

export const runtime = "nodejs";

export const POST = createTxRoute({
  name: "set-stake-credential",
  schema: SetStakeCredentialTxRequestSchema,
  build: async ({ address: _address, config, ...input }, wallet, fetcher) =>
    buildSetIntendedStakeCredentialTx(wallet, config, input as SetIntendedStakeCredentialFormInput, fetcher)
});
