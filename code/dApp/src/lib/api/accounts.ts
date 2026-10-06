import { z } from "zod";
import { CARDANO_NETWORK } from "@/lib/cardano-network";

// CIP-19 reward address. The prefix names the network, so a mainnet address sent to a
// testnet deployment is rejected here instead of answered "not registered".
const STAKE_HRP = CARDANO_NETWORK === "mainnet" ? "stake" : "stake_test";
const STAKE_ADDRESS_PATTERN = new RegExp(`^${STAKE_HRP}1[02-9ac-hj-np-z]+$`);

export const STAKE_ADDRESS_MISSING_MESSAGE =
  "Provide a stake address, e.g. /api/v1/accounts?address=stake1...";
export const STAKE_ADDRESS_INVALID_MESSAGE = `That doesn't look like a stake address on this network (expected \`${STAKE_HRP}1…\`).`;

export const StakeAddressSchema = z
  .string()
  .trim()
  .min(1, STAKE_ADDRESS_MISSING_MESSAGE)
  .refine((value) => STAKE_ADDRESS_PATTERN.test(value), STAKE_ADDRESS_INVALID_MESSAGE)
  .meta({ description: "Bech32 reward (stake) address on the deployment's network." });

export const AccountsQuerySchema = z
  .object({
    address: StakeAddressSchema.meta({
      description: "Bech32 reward address, `stake1...` on mainnet or `stake_test1...` on a testnet.",
      example: "stake_test17rphkx6acpnf78fuvxn0mkew3l0fd058hzquvz7w36x4gtcljw6kf"
    })
  })
  .meta({ id: "AccountsQuery", description: "Query parameters for the stake account lookup." });

export const AccountsResponseSchema = z
  .object({
    account: z.object({
      stakeAddress: z.string(),
      registered: z.boolean().meta({
        description: "Whether the stake address is registered. A delegation certificate needs a registered address."
      }),
      poolId: z.string().nullable().meta({ description: "Bech32 pool id the address delegates its stake to." }),
      drepId: z.string().nullable().meta({ description: "Bech32 DRep id the address delegates its voting power to." })
    })
  })
  .meta({
    id: "AccountsResponse",
    description: "A stake address's registration and delegation state. An address the chain has never seen reads as not registered."
  });

export type AccountsResponseDto = z.infer<typeof AccountsResponseSchema>;
