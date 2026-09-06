import { z } from "zod";
import type { Data } from "@meshsdk/common";
import { MAX_ON_CHAIN_STATE_INTEGER } from "@/lib/contracts/on-chain-integer";
import type { ConstrData } from "@/lib/types/contracts";

// The build routes take an address and never a key: the server assembles an
// unsigned transaction and the caller signs it themselves. This is a cheap
// format gate so an obviously wrong value fails validation with a useful
// message. `assertServerWalletAddress` in lib/mesh/server-wallet.ts is the
// authority — it bech32-decodes before any provider call.
const PREPROD_ADDRESS_PATTERN = /^addr_test1[0-9a-z]{20,}$/;

// JSON Schema cannot apply a numeric maximum to a decimal string. This pattern
// describes every accepted decimal representation through the uint64 maximum.
function buildUint64DecimalPatternSource(): string {
  const maximum = MAX_ON_CHAIN_STATE_INTEGER.toString();
  const alternatives = [`[0-9]{1,${maximum.length - 1}}`];

  for (const [index, digitText] of [...maximum].entries()) {
    const digit = Number(digitText);
    if (digit === 0) continue;

    const prefix = maximum.slice(0, index);
    const lowerDigit = digit === 1 ? "0" : `[0-${digit - 1}]`;
    const remainingLength = maximum.length - index - 1;
    const suffix = remainingLength === 0 ? "" : `[0-9]{${remainingLength}}`;
    alternatives.push(`${prefix}${lowerDigit}${suffix}`);
  }

  alternatives.push(maximum);
  return `(?:${alternatives.join("|")})`;
}

const UINT64_DECIMAL_PATTERN_SOURCE = buildUint64DecimalPatternSource();

const OnChainUint64DecimalSchema = z
  .string()
  .regex(
    new RegExp(`^${UINT64_DECIMAL_PATTERN_SOURCE}$`),
    `Expected a decimal integer between 0 and ${MAX_ON_CHAIN_STATE_INTEGER.toString()}.`
  );

const PlutusIntegerDecimalSchema = z
  .string()
  .regex(
    new RegExp(`^-?${UINT64_DECIMAL_PATTERN_SOURCE}$`),
    `Expected an integer with magnitude at most ${MAX_ON_CHAIN_STATE_INTEGER.toString()}.`
  );

export const CardanoAddressSchema = z
  .string()
  .regex(PREPROD_ADDRESS_PATTERN, "Expected a preprod bech32 address starting with `addr_test1`.")
  .meta({
    id: "CardanoAddress",
    description:
      "A preprod bech32 payment address. The transaction is built to spend from it, and the caller signs the result.",
    example:
      "addr_test1qz7r704wjqh275anmzsln4ad9e4nwrutnmyvnd32jpzy2kal8d9m8yxj9gwg0ddh4nhj6zqwad8px7u45ljczt4ajfps72xr59"
  });

export const TxHashSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{64}$/, "Expected a 64-character hex transaction hash.")
  .meta({
    id: "TxHash",
    description: "A Cardano transaction hash, 32 bytes as hex.",
    example: "300b5fc703fc565c5d563d4b770180e55a3db6357e69af96a21e5a2933255662"
  });

export const OutputIndexSchema = z.int().min(0).meta({
  description: "Index of an output within its transaction.",
  example: 0
});

export const HashHexSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{56}$/, "Expected a 56-character (28-byte) hex hash.")
  .meta({
    id: "CredentialHash",
    description: "A blake2b-224 credential hash: 28 bytes as hex.",
    example: "ab".repeat(28)
  });

export const RequiredSignerKeyHashesSchema = z
  .array(HashHexSchema)
  .meta({
    description:
      "Payment key hashes the transaction lists as required signers in addition to the connected wallet. The ledger transaction-size limit decides how many fit."
  });

export const QuantitySchema = OnChainUint64DecimalSchema
  .meta({
    description:
      "An amount as a decimal string. Strings are used because Cardano quantities exceed the range JSON numbers represent exactly.",
    example: "5000000"
  });

// Plutus data as JSON. Mesh's own Data type also admits a Map, which has no
// JSON representation, and no datum this app builds uses one — so maps are out
// of the public surface rather than silently mis-encoded.
export type PlutusIntegerJson = { int: string };
export type ConstrDataJson = {
  alternative: number;
  fields: PlutusDataJson[];
};
export type PlutusDataJson =
  | string
  | number
  | PlutusIntegerJson
  | PlutusDataJson[]
  | ConstrDataJson;

export const OnChainUint64Schema = z.union([
  z.int().min(0),
  z
    .object({
      int: OnChainUint64DecimalSchema
    })
    .strict()
    .transform(({ int }) => BigInt(int))
    .meta({
      id: "OnChainUint64",
      description:
        "An exact non-negative uint64. Use this wrapper when the value exceeds JSON's exact integer range.",
      example: { int: MAX_ON_CHAIN_STATE_INTEGER.toString() }
    })
]);

export const PlutusIntegerSchema = z.union([
  z.int(),
  z
    .object({ int: PlutusIntegerDecimalSchema })
    .strict()
    .transform(({ int }) => BigInt(int))
    .meta({
      id: "PlutusInteger",
      description:
        "An exact signed Plutus integer with uint64-bounded magnitude. Use this wrapper when the value exceeds JSON's exact integer range.",
      example: { int: MAX_ON_CHAIN_STATE_INTEGER.toString() }
    })
]);

export const ConstrDataSchema: z.ZodType<ConstrData, ConstrDataJson> = z.lazy(() =>
  z
    .object({
      alternative: z.int().min(0).meta({
        description: "Constructor index of the Plutus data value.",
        example: 0
      }),
      fields: z.array(PlutusDataSchema).meta({
        description: "The constructor's fields, in declaration order."
      })
    })
    // Both ids sit where the generator can see a nameable schema: on the object
    // here, and on the lazy wrapper for PlutusData below, whose union it inlines.
    // Naming them is what keeps the recursion from rendering as __schema0.
    .meta({
      id: "ConstrData",
      description:
        "A Plutus constructor value. Byte strings are hex. Integers use exact wrappers, or safe JSON numbers for compatibility.",
      example: { alternative: 0, fields: [] }
    })
);

export const PlutusDataSchema: z.ZodType<Data, PlutusDataJson> = z
  .lazy(() =>
    z.union([z.string(), PlutusIntegerSchema, z.array(PlutusDataSchema), ConstrDataSchema])
  )
  .meta({
    id: "PlutusData",
    description:
      "One Plutus data value: a hex byte string, an exact integer, a list, or a constructor."
  });

export function stringifyTxRequestBody(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) => {
    if (typeof entry !== "bigint") {
      return entry;
    }

    if (
      entry < -MAX_ON_CHAIN_STATE_INTEGER ||
      entry > MAX_ON_CHAIN_STATE_INTEGER
    ) {
      throw new RangeError(
        `Transaction request integer must have magnitude at most ${MAX_ON_CHAIN_STATE_INTEGER.toString()}.`
      );
    }
    return { int: entry.toString() } satisfies PlutusIntegerJson;
  });
}

export const AssetSchema = z
  .object({
    unit: z.string().min(1).meta({
      description: "`lovelace`, or a policy id concatenated with a hex asset name.",
      example: "lovelace"
    }),
    quantity: QuantitySchema
  })
  .meta({
    id: "Asset",
    description: "One asset and its amount."
  });

export const AssetListSchema = z.array(AssetSchema).meta({
  description: "A value, as a list of assets."
});

export const WalletInputRefSchema = z
  .object({
    txHash: TxHashSchema,
    outputIndex: OutputIndexSchema
  })
  .meta({
    id: "WalletInputRef",
    description: "A reference to one wallet-script UTxO to spend."
  });

export const WalletScriptOutputSchema = z
  .object({
    amount: AssetListSchema,
    inlineDatum: ConstrDataSchema.optional()
  })
  .meta({
    id: "WalletScriptOutput",
    description: "A continuing output paid back to the wallet script."
  });

export const PayoutTransferSchema = z
  .object({
    address: z.string().min(1).meta({
      description: "The bech32 address that receives this transfer.",
      example:
        "addr_test1qz7r704wjqh275anmzsln4ad9e4nwrutnmyvnd32jpzy2kal8d9m8yxj9gwg0ddh4nhj6zqwad8px7u45ljczt4ajfps72xr59"
    }),
    amount: AssetListSchema,
    inlineDatum: ConstrDataSchema.optional()
  })
  .meta({
    id: "PayoutTransfer",
    description: "One recipient and the value they receive."
  });

export const ContractConfigSchema = z
  .object({
    sttAssetNameHex: z.string().meta({
      description: "Hex asset name of the wallet's state-thread token.",
      example: "4a54e32392a501ce0018aff2175012cfc7d19183ae6a3d87dc0bfa7e703d95ae"
    }),
    walletPolicyId: z.string().optional().meta({
      description: "Policy id of the state-thread token. Required by every wallet-script action."
    }),
    walletAssetNameHex: z.string().optional().meta({
      description: "Hex asset name used to parameterise the wallet scripts."
    }),
    sttSpendReference: z.string().optional(),
    walletSpendReference: z.string().optional().meta({
      description:
        "Optional txHash#index UTxO holding this wallet's applied spend validator. Consolidation uses it instead of an inline wallet script."
    }),
    walletWithdrawReference: z.string().optional(),
    walletPublishReference: z.string().optional(),
    walletVoteReference: z.string().optional()
  })
  .meta({
    id: "ContractConfig",
    description:
      "Identifies which wallet the action targets, and optionally where its reference scripts are deployed."
  });

/** Every build request names the address the transaction is built for. */
export const TxRequestBaseSchema = z.object({
  address: CardanoAddressSchema
});
