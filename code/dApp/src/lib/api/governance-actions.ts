import { z } from "zod";

// CIP-129 governance action id, or the ledger's own `txHash#index` form.
// Bech32 data charset (no 1, b, i, o).
const GOV_ACTION_BECH32_PATTERN = /^gov_action1[02-9ac-hj-np-z]+$/;
const GOV_ACTION_TX_REF_PATTERN = /^([0-9a-f]{64})#(\d{1,5})$/i;

export const GOV_ACTION_ID_MISSING_MESSAGE =
  "Provide a governance action id, e.g. /api/v1/governance-actions?id=gov_action1...";
export const GOV_ACTION_ID_INVALID_MESSAGE =
  "That doesn't look like a governance action id (expected `gov_action1…` or `<tx hash>#<index>`).";

/** The Blockfrost path segment for an id the schema below accepted. */
export function governanceActionPath(id: string): string {
  const txRef = GOV_ACTION_TX_REF_PATTERN.exec(id);
  return txRef
    ? `/governance/proposals/${txRef[1].toLowerCase()}/${Number(txRef[2])}`
    : `/governance/proposals/${id}`;
}

export const GovernanceActionIdSchema = z
  .string()
  .trim()
  .min(1, GOV_ACTION_ID_MISSING_MESSAGE)
  .refine(
    (value) => GOV_ACTION_BECH32_PATTERN.test(value) || GOV_ACTION_TX_REF_PATTERN.test(value),
    GOV_ACTION_ID_INVALID_MESSAGE
  )
  .meta({
    description: "Governance action id: CIP-129 `gov_action1...` or `<64-hex tx hash>#<index>`."
  });

export const GovernanceActionsQuerySchema = z
  .object({
    id: GovernanceActionIdSchema.meta({
      description: "Governance action id, either CIP-129 `gov_action1...` or `<tx hash>#<index>`.",
      example: "0ecc74fe26532cec1ab9a299f082afc436afc888ca2dc0fc6acda431c52dc60d#0"
    })
  })
  .meta({
    id: "GovernanceActionsQuery",
    description: "Query parameters for the governance action lookup."
  });

export const GOVERNANCE_ACTION_STATUSES = ["active", "ratified", "enacted", "dropped", "expired"] as const;

export const GovernanceActionsResponseSchema = z
  .object({
    action: z.object({
      id: z.string().meta({ description: "CIP-129 `gov_action1...` id." }),
      txHash: z.string(),
      index: z.number().int().nonnegative().meta({
        description: "Index of the action inside its proposal transaction (`govActionId.txIndex`)."
      }),
      type: z.string().meta({ description: "Blockfrost `governance_type`, e.g. `treasury_withdrawals`." }),
      title: z.string().nullable().meta({ description: "CIP-108 title, when the anchor resolved." }),
      abstract: z.string().nullable().meta({ description: "CIP-108 abstract, when the anchor resolved." }),
      expirationEpoch: z.number().int().nullable(),
      status: z.enum(GOVERNANCE_ACTION_STATUSES).meta({
        description: "`active` while DReps can still vote on it; every other value is final."
      })
    })
  })
  .meta({
    id: "GovernanceActionsResponse",
    description: "One governance action with its off-chain title and abstract, when published."
  });

export type GovernanceActionsResponseDto = z.infer<typeof GovernanceActionsResponseSchema>;
export type GovernanceAction = GovernanceActionsResponseDto["action"];
