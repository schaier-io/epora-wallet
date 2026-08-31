import { z } from "zod";

const POOL_ID_BECH32_PATTERN = /^pool1[0-9a-z]+$/i;
const POOL_ID_HEX_PATTERN = /^[0-9a-f]{56}$/i;

// The route answers a missing id and a malformed id with different messages.
// They are named here so the handler, the tests and the spec all quote the same
// text instead of three copies drifting apart.
export const POOL_ID_MISSING_MESSAGE =
  "Provide a pool id, e.g. /api/v1/pools?id=pool1...";
export const POOL_ID_INVALID_MESSAGE =
  "That doesn't look like a pool id (expected `pool1…` or a 56-char hex id).";

export const PoolIdSchema = z
  .string()
  .trim()
  .min(1, POOL_ID_MISSING_MESSAGE)
  .refine(
    (value) => POOL_ID_BECH32_PATTERN.test(value) || POOL_ID_HEX_PATTERN.test(value),
    POOL_ID_INVALID_MESSAGE
  )
  .meta({
    description: "Stake pool id: bech32 `pool1...` or a 56-character hex id."
  });

export const PoolsQuerySchema = z
  .object({
    id: PoolIdSchema.meta({
      description: "Stake pool id, either bech32 `pool1...` or a 56-character hex id.",
      example: "pool1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy"
    })
  })
  .meta({
    id: "PoolsQuery",
    description: "Query parameters for the stake-pool lookup."
  });

// Lovelace amounts stay decimal strings, as Blockfrost returns them, because
// they exceed the safe integer range.
export const PoolsResponseSchema = z
  .object({
    pool: z.object({
      poolId: z.string(),
      ticker: z.string().nullable(),
      name: z.string().nullable(),
      homepage: z.string().nullable(),
      description: z.string().nullable(),
      saturation: z.number().nullable().meta({
        description: "Live saturation as a fraction, where 1 is 100 percent."
      }),
      liveStakeLovelace: z.string().nullable(),
      activeStakeLovelace: z.string().nullable(),
      declaredPledgeLovelace: z.string().nullable(),
      livePledgeLovelace: z.string().nullable(),
      marginPct: z.number().nullable(),
      fixedCostLovelace: z.string().nullable(),
      blocksMinted: z.number().int().nullable(),
      retiring: z.boolean()
    })
  })
  .meta({
    id: "PoolsResponse",
    description: "Stake pool details with off-chain metadata, when the pool registered any."
  });

export type PoolsResponseDto = z.infer<typeof PoolsResponseSchema>;
