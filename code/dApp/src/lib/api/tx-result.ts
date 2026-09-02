import { z } from "zod";

// The response every build route returns. This is `BuildResult` from
// types/contracts.ts, unchanged: it already carries an unsigned transaction, a
// readable preview, a fee estimate and non-blocking advisories, so HTTP does not
// need a second shape. Each route annotates its builder result as
// `BuildResultDto`, so a drift between the two fails the build rather than
// shipping a response the spec does not describe.

const TxSizeSchema = z
  .object({
    usedBytes: z.int().meta({ description: "Serialised size of the transaction." }),
    maxBytes: z.int().meta({ description: "Protocol limit for a transaction." }),
    percentage: z.string().meta({ description: "Used size as a percentage of the limit.", example: "12.4" })
  })
  .meta({ id: "TxSize", description: "How much of the transaction-size budget this build uses." });

const TxPreviewSchema = z
  .object({
    action: z.string().meta({ description: "Which builder produced this transaction.", example: "mint" }),
    summary: z.string().meta({
      description: "One-line description of what the transaction does.",
      example: "Mint state token"
    }),
    cbor: z.string().meta({ description: "The transaction CBOR, same value as `txHex`." }),
    txSize: TxSizeSchema.optional()
  })
  .meta({
    id: "TxPreview",
    description: "A human-readable view of the built transaction, for showing to a signer before they approve it."
  });

const ExecutionRedeemerUsageSchema = z
  .object({
    tag: z.string().meta({ description: "Redeemer purpose.", example: "MINT" }),
    index: z.int(),
    mem: z.string().meta({ description: "Memory units used.", example: "393982" }),
    steps: z.string().meta({ description: "CPU steps used.", example: "122536851" }),
    reference: z.string().optional(),
    validator: z.string().optional().meta({ example: "stt.stt.mint" })
  })
  .meta({ id: "ExecutionRedeemerUsage", description: "Measured cost of one redeemer." });

const ExecutionValidatorUsageSchema = z
  .object({
    validator: z.string().meta({ example: "stt.stt.mint" }),
    memUsed: z.string(),
    stepsUsed: z.string(),
    redeemerCount: z.int()
  })
  .meta({ id: "ExecutionValidatorUsage", description: "Measured cost per validator." });

const ExecutionUnitsSchema = z
  .object({
    memUsed: z.string(),
    stepsUsed: z.string(),
    maxTxMem: z.string(),
    maxTxSteps: z.string(),
    maxBlockMem: z.string(),
    maxBlockSteps: z.string(),
    redeemers: z.array(ExecutionRedeemerUsageSchema),
    perValidator: z.array(ExecutionValidatorUsageSchema)
  })
  .meta({
    id: "ExecutionUnits",
    description:
      "Script execution budget the build measured against the chain, with the protocol maxima to compare it against."
  });

export const BuildResultSchema = z
  .object({
    txHex: z.string().meta({
      description:
        "The unsigned transaction, CBOR as hex. Sign it with the address's key and submit it; the server holds no key and never signs.",
      example: "84ad00d9010283825820300b5fc7..."
    }),
    preview: TxPreviewSchema,
    estimatedFeeLovelace: z.string().optional().meta({
      description: "Estimated fee in lovelace.",
      example: "424778"
    }),
    executionUnits: ExecutionUnitsSchema.optional(),
    warnings: z
      .array(z.string())
      .optional()
      .meta({
        description:
          "Advisories about the resulting state that do not block the build, such as a lapsed wake-up timer. The transaction is still valid on-chain.",
        example: ["Proof-of-life deadline has already lapsed."]
      }),
    signerAddress: z.string().optional().meta({
      description:
        "Address whose signature the transaction requires, as resolved at build time. Sign it with this address's key.",
      example: "addr_test1qr..."
    })
  })
  .meta({
    id: "BuildResult",
    description: "An unsigned transaction plus everything a caller needs to review it before signing."
  });

export type BuildResultDto = z.infer<typeof BuildResultSchema>;
