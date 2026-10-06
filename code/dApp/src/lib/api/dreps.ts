import { z } from "zod";

// Every bech32 DRep id Mesh's `toDRep` (`@meshsdk/core-cst` 1.9.1) can turn into a
// certificate: CIP-129 `drep1…` (header byte plus hash, key or script), the deprecated
// CIP-105 `drep1…` (bare key hash) and CIP-105 `drep_script1…`. Blockfrost documents the
// first two. Bech32 data charset (no 1, b, i, o).
const DREP_ID_PATTERN = /^drep(?:_script)?1[02-9ac-hj-np-z]+$/;

export const DREP_ID_MISSING_MESSAGE = "Provide a DRep id, e.g. /api/v1/dreps?id=drep1...";
export const DREP_ID_INVALID_MESSAGE = "That doesn't look like a DRep id (expected `drep1…`).";

export const DrepIdSchema = z
  .string()
  .trim()
  .min(1, DREP_ID_MISSING_MESSAGE)
  .refine((value) => DREP_ID_PATTERN.test(value), DREP_ID_INVALID_MESSAGE)
  .meta({ description: "DRep id: CIP-129 `drep1...`, or CIP-105 `drep1...` / `drep_script1...`." });

export const DrepsQuerySchema = z
  .object({
    id: DrepIdSchema.meta({
      description: "DRep id, bech32 `drep1...` (CIP-129 or CIP-105) or `drep_script1...`.",
      example: "drep1ygqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq7vlc9n"
    })
  })
  .meta({ id: "DrepsQuery", description: "Query parameters for the DRep lookup." });

export const DREP_STATUSES = ["active", "inactive", "retired"] as const;

export const DrepsResponseSchema = z
  .object({
    drep: z.object({
      drepId: z.string().meta({ description: "Bech32 DRep id, as Blockfrost returns it." }),
      name: z.string().nullable().meta({ description: "CIP-119 `givenName`, when the anchor resolved." }),
      votingPowerLovelace: z.string().nullable().meta({
        description: "Delegated voting power in lovelace, a decimal string."
      }),
      hasScript: z.boolean(),
      status: z.enum(DREP_STATUSES).meta({
        description:
          "`retired` after deregistration; `inactive` when it has not voted for `drep_activity` epochs, so its voting power does not count."
      })
    })
  })
  .meta({ id: "DrepsResponse", description: "A DRep's registration state and CIP-119 name." });

export type DrepsResponseDto = z.infer<typeof DrepsResponseSchema>;

/** The DRep id inside whatever the user pasted: a bare id or an explorer link that contains one. */
export function extractDrepId(text: string): string | null {
  return /drep(?:_script)?1[02-9ac-hj-np-z]+/.exec(text.toLowerCase())?.[0] ?? null;
}
