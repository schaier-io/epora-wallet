import { z } from "zod";
import {
  AssetListSchema,
  OutputIndexSchema,
  QuantitySchema,
  StateDatumSchema,
  TxHashSchema,
  TxRequestBaseSchema
} from "./tx-primitives";

// One request schema per build route, mirroring the builder each one calls.
// The nine-action `stt-spend` union lives in ./tx-stt-spend.ts.

export const MintTxRequestSchema = TxRequestBaseSchema.extend({
  stateDatum: StateDatumSchema.meta({
    description:
      "The initial STT State datum. It must grant at least one admin access path, or the build is rejected."
  }),
  mintLovelace: QuantitySchema.optional().meta({
    description: "Lovelace to lock with the new state token. Defaults to 5000000.",
    example: "5000000"
  }),
  starterAssets: AssetListSchema.optional().meta({
    description: "Assets to lock alongside the state token. Overrides `mintLovelace` when it names lovelace."
  }),
  selectedReferenceUtxo: z
    .object({ txHash: TxHashSchema, outputIndex: OutputIndexSchema })
    .optional()
    .meta({
      description:
        "Which of the address's UTxOs seeds the token name. Chosen automatically when omitted; the resulting asset name depends on it."
    })
}).meta({
  id: "MintTxRequest",
  description: "Mint a new state-thread token, creating a wallet."
});

export type MintTxRequestDto = z.infer<typeof MintTxRequestSchema>;
