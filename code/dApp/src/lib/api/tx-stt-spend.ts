import { z } from "zod";
import {
  MAX_STREAMING_PAYOUTS_PER_TRANSACTION,
  MAX_WALLET_INPUTS_PER_SPEND
} from "@/lib/contracts/transaction-limits";
import {
  AssetListSchema,
  ContractConfigSchema,
  HashHexSchema,
  OutputIndexSchema,
  PayoutTransferSchema,
  RequiredSignerKeyHashesSchema,
  ConstrDataSchema,
  TxHashSchema,
  TxRequestBaseSchema,
  WalletInputRefSchema,
  WalletScriptOutputSchema
} from "./tx-primitives";

// The nine STT-spend actions. They share one builder and one STT input, and
// differ in what they must be told about the signer or the target, so this is a
// discriminated union on `action` rather than one schema with nine optional
// fields. Each `.min(1)` and required field below mirrors a throw in
// transactions/stt-spend.ts, so the spec documents the same contract the
// builder enforces.

const SttSpendBase = TxRequestBaseSchema.extend({
  config: ContractConfigSchema,
  sttInputTxHash: TxHashSchema.meta({
    description: "Transaction that produced the STT State UTxO to consume."
  }),
  sttInputOutputIndex: OutputIndexSchema.optional(),
  outputDatum: ConstrDataSchema.meta({
    description:
      "The State datum to forward. Some actions derive it from the consumed State instead and ignore this."
  }),
  outputAssets: AssetListSchema.meta({
    description: "Value to forward with the State, alongside the state token itself."
  }),
  authorityPath: z
    .enum(["admin", "multisig", "user", "beneficiary", "rule-driven"])
    .optional()
    .meta({
      description: "Which access path authorises the action. Defaults to `admin`.",
      example: "admin"
    }),
  requiredSignerKeyHashes: RequiredSignerKeyHashesSchema.optional(),
  validityWindowReferenceTimeMs: z.int().optional().meta({
    description:
      "Reference time for the transaction's validity window, in Unix milliseconds. Defaults to the server's clock. Set it to build against a specific point in time.",
    example: 1756641600000
  }),
  walletInputs: z
    .array(WalletInputRefSchema)
    .max(MAX_WALLET_INPUTS_PER_SPEND)
    .optional()
    .meta({
      description: "Wallet-script UTxOs to spend alongside the State."
    }),
  walletOutputs: z.array(WalletScriptOutputSchema).optional().meta({
    description: "Continuing wallet outputs to produce."
  }),
  extraTransfers: z.array(PayoutTransferSchema).optional().meta({
    description: "Additional recipients paid by this transaction."
  })
});

/**
 * Three actions derive the forwarded State from the consumed one and never read
 * the caller's copy: `stt-spend.ts` skips its `assertValidConstrData` for them.
 * Requiring the fields anyway would reject a request that followed the
 * descriptions above and omitted what the builder ignores.
 */
const SttSpendDerivedBase = SttSpendBase.extend({
  outputDatum: ConstrDataSchema.optional().meta({
    description: "Ignored for this action: the forwarded State is derived from the consumed one."
  }),
  outputAssets: AssetListSchema.optional().meta({
    description: "Ignored for this action: the State's value is preserved as it stands."
  })
});

/** The four actions that need nothing beyond the shared State fields. */
const useSchema = SttSpendBase.extend({ action: z.literal("use") }).meta({
  description: "Spend under an admin or multisig rule."
});

const renewProofOfLifeSchema = SttSpendBase.extend({
  action: z.literal("renew-proof-of-life")
}).meta({ description: "Reset the dead-man-switch timer." });

const updateStateSchema = SttSpendBase.extend({ action: z.literal("update-state") }).meta({
  description: "Rewrite the wallet's State: users, caps, beneficiaries, timings."
});

const manageStreamingPaymentsSchema = SttSpendBase.extend({
  action: z.literal("manage-streaming-payments")
}).meta({ description: "Create, change or remove streaming payments." });

const allowanceSchema = SttSpendDerivedBase.extend({
  action: z.literal("use-allowance"),
  allowanceSignerKeyHash: HashHexSchema.meta({
    description: "Payment key hash of the user drawing on their allowance. They must sign the result."
  })
}).meta({ description: "Draw on a user's allowance. Requires at least one locked input and one transfer." });

const beneficiarySchema = SttSpendBase.extend({
  action: z.literal("use-beneficiary"),
  beneficiarySignerKeyHash: HashHexSchema.meta({
    description: "Payment key hash of the beneficiary claiming their share. They must sign the result."
  })
}).meta({ description: "Claim a beneficiary share after the recovery deadline has passed." });

const payoutSchema = SttSpendBase.extend({
  action: z.literal("payout-streaming-payment"),
  extraTransfers: z
    .array(PayoutTransferSchema)
    .max(MAX_STREAMING_PAYOUTS_PER_TRANSACTION)
    .optional()
    .meta({
      description: "Additional recipients paid by this transaction."
    }),
  crankSignerKeyHash: HashHexSchema.meta({
    description:
      "Payment key hash of whoever turns the crank, and the transaction's sole required signer. The crank is not permissionless, so this is required: it decides whether the signer clears the authority gate, and whether an admin must preserve the non-admin payout stamp rather than set it."
  })
}).meta({ description: "Pay out what a streaming payment has accrued." });

const cancelSchema = SttSpendDerivedBase.extend({
  action: z.literal("cancel-streaming-payment"),
  streamingPaymentCancelId: z.int().min(0).meta({
    description: "Id of the streaming payment the payee is stopping.",
    example: 0
  })
}).meta({
  description:
    "Stop a streaming payment as its payee. The forwarded State is derived from the consumed one, so `outputDatum` is ignored."
});

const removeAccessSchema = SttSpendDerivedBase.extend({
  action: z.literal("remove-access-index"),
  removeAccessTarget: z
    .object({
      list: z.enum(["user", "beneficiary"]).meta({ description: "Which list to remove from." }),
      index: z.int().min(0).meta({ description: "Position in that list." })
    })
    .meta({
      id: "RemoveAccessTarget",
      description: "The access entry to remove."
    })
}).meta({
  description:
    "Remove one user or beneficiary. The entry is spliced out and value is preserved, so `outputDatum` and `outputAssets` are ignored."
});

export const SttSpendTxRequestSchema = z
  .discriminatedUnion("action", [
    useSchema,
    renewProofOfLifeSchema,
    updateStateSchema,
    manageStreamingPaymentsSchema,
    allowanceSchema,
    beneficiarySchema,
    payoutSchema,
    cancelSchema,
    removeAccessSchema
  ])
  .meta({
    id: "SttSpendTxRequest",
    description:
      "Spend the wallet's state-thread token, forwarding its State. `action` selects which of the nine transitions to build."
  });

export type SttSpendTxRequestDto = z.infer<typeof SttSpendTxRequestSchema>;
export type SttSpendAction = SttSpendTxRequestDto["action"];
