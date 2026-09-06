import { z } from "zod";
import {
  AssetListSchema,
  ContractConfigSchema,
  HashHexSchema,
  OnChainUint64Schema,
  OutputIndexSchema,
  PayoutTransferSchema,
  RequiredSignerKeyHashesSchema,
  ConstrDataSchema,
  TxHashSchema,
  TxRequestBaseSchema,
  WalletInputRefSchema,
  WalletScriptOutputSchema
} from "./tx-primitives";

// The eleven STT-spend actions. They share one builder and one STT input, and
// differ in what they must be told about the signer or the target, so this is a
// discriminated union on `action` rather than one schema with action-specific
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
  walletInputs: z.array(WalletInputRefSchema).optional().meta({
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
 * Six actions derive the forwarded State from the consumed one and never read
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
  description: "Rewrite the wallet's State: users, caps, beneficiaries, timings. Each beneficiary must include a fifth payout_address field containing a structured Cardano Address with a key or script payment credential. Four-field beneficiary records are unsupported."
});

const manageStreamingPaymentsSchema = SttSpendBase.extend({
  action: z.literal("manage-streaming-payments")
}).meta({
  description:
    "Create or change streaming payment schedules. Settlement removes matured or fully settled schedules."
});

const allowanceSchema = SttSpendDerivedBase.extend({
  action: z.literal("use-allowance"),
  allowanceSignerKeyHash: HashHexSchema.meta({
    description: "Payment key hash of the user drawing on their allowance. They must sign the result."
  })
}).meta({ description: "Draw on a user's allowance. Requires at least one locked input and one transfer." });

const beneficiarySchema = SttSpendDerivedBase.extend({
  action: z.literal("use-beneficiary"),
  beneficiarySignerKeyHash: HashHexSchema.meta({
    description: "Payment key hash of the beneficiary claiming their share. They must sign the result."
  })
}).meta({
  description:
    "Claim a beneficiary share after the recovery deadline has passed. The forwarded State is derived from the consumed one."
});

const beneficiaryExitSchema = beneficiarySchema.extend({
  action: z.literal("exit-beneficiary")
}).meta({
  description:
    "Permanently claim and give up beneficiary rights, including the final beneficiary. The final exit requires an empty stream list and the non-admin recovery cooldown. Omitted funds and later deposits are excluded from this claim."
});

const beneficiaryStreamStopSchema = SttSpendDerivedBase.extend({
  action: z.literal("stop-beneficiary-stream"),
  beneficiarySignerKeyHash: HashHexSchema.meta({
    description: "Connected beneficiary payment key hash. It must match the building wallet and be unlocked at the transaction lower bound."
  }),
  beneficiaryStreamStopId: OnChainUint64Schema.meta({ description: "Id of the streaming payment to shorten." }),
  walletInputs: z.array(WalletInputRefSchema).max(0).optional(),
  walletOutputs: z.array(WalletScriptOutputSchema).max(0).optional(),
  extraTransfers: z.array(PayoutTransferSchema).max(0).optional()
}).meta({
  description: "Stop one stream as an unlocked beneficiary. The end becomes max(start, transaction upper bound), strictly before its old end. Preserves paid amounts and retained debt. No wallet inputs, wallet outputs or transfers are allowed. Shares the 30-minute non-admin cadence with no owner bypass."
});

const payoutSchema = SttSpendBase.extend({
  action: z.literal("payout-streaming-payment"),
  extraTransfers: z
    .array(PayoutTransferSchema)
    .optional()
    .meta({
      description: "Additional recipients paid by this transaction."
    }),
  crankSignerKeyHash: HashHexSchema.meta({
    description:
      "Payment key hash of the connected wallet that starts the crank. This primary signer is required. Additional required signer hashes may complete a multisig quorum. The full signer set decides whether authority passes and whether an admin preserves the non-admin payout stamp rather than sets it."
  })
}).meta({ description: "Pay out what a streaming payment has accrued." });

const cancelSchema = SttSpendDerivedBase.extend({
  action: z.literal("cancel-streaming-payment"),
  streamingPaymentCancelId: OnChainUint64Schema.meta({
    description: "Id of the streaming payment the payee is stopping.",
    example: 0
  })
}).meta({
  description:
    "Stop a streaming payment as its payee. After final recovery opens, the new end must equal the transaction's upper validity bound. The forwarded State is derived from the consumed one, so `outputDatum` is ignored."
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
    beneficiaryExitSchema,
    beneficiaryStreamStopSchema,
    payoutSchema,
    cancelSchema,
    removeAccessSchema
  ])
  .meta({
    id: "SttSpendTxRequest",
    description:
      "Spend the wallet's state-thread token, forwarding its State. `action` selects which of the eleven transitions to build."
  });

export type SttSpendTxRequestDto = z.infer<typeof SttSpendTxRequestSchema>;
export type SttSpendAction = SttSpendTxRequestDto["action"];
