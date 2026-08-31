import { z } from "zod";
import {
  AssetListSchema,
  ConstrDataSchema,
  ContractConfigSchema,
  HashHexSchema,
  OutputIndexSchema,
  PayoutTransferSchema,
  QuantitySchema,
  StateDatumSchema,
  TxHashSchema,
  TxRequestBaseSchema,
  WalletInputRefSchema,
  WalletScriptOutputSchema
} from "./tx-primitives";

const OperatorAuthorityPathSchema = z.enum(["admin", "multisig"]).optional().meta({
  description: "Which operator path authorises the action. Defaults to `admin`.",
  example: "admin"
});

/** The STT State UTxO an action consumes, and the State it forwards. */
const SttForwardSchema = {
  sttInputTxHash: TxHashSchema.meta({
    description: "Transaction that produced the STT State UTxO to consume."
  }),
  sttInputOutputIndex: OutputIndexSchema.optional(),
  sttOutputDatum: StateDatumSchema.meta({
    description: "The State datum to forward. It must be a legal successor of the consumed State."
  }),
  sttOutputAssets: AssetListSchema.meta({
    description: "Value to forward with the State, alongside the state token itself."
  })
};

/** Every wallet-script action names the wallet it targets. */
const WalletActionBase = TxRequestBaseSchema.extend({
  config: ContractConfigSchema
});

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

export const LockFundsTxRequestSchema = WalletActionBase.extend({
  assets: AssetListSchema.meta({
    description: "Value to deposit. At least one asset is required."
  }),
  inlineDatum: ConstrDataSchema.optional().meta({
    description: "Optional inline datum to attach to the deposit output."
  }),
  intendedStakeCredential: ConstrDataSchema.optional().meta({
    description:
      "The wallet's current `intended_stake_credential`, as `Option<Credential>`. A deposit has no STT input to read it from, so a staking wallet must pass it or the funds land at the enterprise address."
  })
}).meta({
  id: "LockFundsTxRequest",
  description: "Deposit funds to a wallet. Receiving needs no datum and no signature from the wallet."
});

export const WalletSpendTxRequestSchema = WalletActionBase.extend({
  walletInputTxHash: TxHashSchema.meta({
    description: "Transaction that produced the wallet-script UTxO to spend."
  }),
  walletInputOutputIndex: OutputIndexSchema.optional(),
  redeemer: ConstrDataSchema.meta({
    description: "The wallet-spend redeemer authorising this spend."
  }),
  outputs: z.array(PayoutTransferSchema).meta({
    description: "Who receives what."
  })
}).meta({
  id: "WalletSpendTxRequest",
  description: "Spend from the wallet script directly, under a rule that permits it."
});

export const WalletWithdrawTxRequestSchema = WalletActionBase.extend({
  rewardAddress: z.string().min(1).meta({
    description: "The wallet's reward address to withdraw staking rewards from.",
    example: "stake_test1uqevw2xnsc0pvn9t9r9c45ydkjs5t5ldz5c8y2rqkha7dnq5cjxkq"
  }),
  amountLovelace: QuantitySchema.meta({
    description: "Rewards to withdraw, in lovelace. Must equal the full available balance."
  }),
  ...SttForwardSchema,
  authorityPath: OperatorAuthorityPathSchema
}).meta({
  id: "WalletWithdrawTxRequest",
  description: "Withdraw the wallet's staking rewards."
});

export const ConsolidateTxRequestSchema = WalletActionBase.extend({
  sttInputTxHash: TxHashSchema,
  sttInputOutputIndex: OutputIndexSchema.optional(),
  outputDatum: StateDatumSchema.meta({ description: "The State datum to forward." }),
  outputAssets: AssetListSchema.meta({ description: "Value to forward with the State." }),
  authorityPath: z.enum(["admin", "multisig", "beneficiary"]).optional().meta({
    description: "Which path authorises the consolidation. Defaults to `admin`."
  }),
  walletInputs: z.array(WalletInputRefSchema).min(1).meta({
    description: "The wallet-script UTxOs to merge. At least one is required."
  }),
  walletOutputs: z.array(WalletScriptOutputSchema).optional().meta({
    description: "The continuing wallet outputs to produce. Defaults to a single merged output."
  })
}).meta({
  id: "ConsolidateTxRequest",
  description:
    "Merge wallet-script UTxOs, and migrate them to the wallet's current base address after a stake-credential change."
});

export const SetStakeCredentialTxRequestSchema = WalletActionBase.extend({
  ...SttForwardSchema,
  authorityPath: OperatorAuthorityPathSchema,
  stakeCredential: z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("none") }).meta({
        description: "Clear the credential. The wallet receives at its enterprise address."
      }),
      z.object({ kind: z.literal("key"), hashHex: HashHexSchema }).meta({
        description: "Delegate through a stake key hash."
      }),
      z.object({ kind: z.literal("script"), hashHex: HashHexSchema }).meta({
        description: "Delegate through a script hash, such as the wallet's own staking script."
      })
    ])
    .meta({
      id: "StakeCredentialSelection",
      description: "The credential to record as the wallet's `intended_stake_credential`."
    })
}).meta({
  id: "SetStakeCredentialTxRequest",
  description:
    "Set the stake credential every continuing wallet output must use. Moves no funds: existing UTxOs are migrated by a follow-up consolidate."
});

export const VoteTxRequestSchema = WalletActionBase.extend({
  vote: z.record(z.string(), z.unknown()).meta({
    description: "The governance vote, as the JSON object Mesh expects."
  }),
  ...SttForwardSchema,
  authorityPath: OperatorAuthorityPathSchema
}).meta({
  id: "VoteTxRequest",
  description: "Cast a governance vote as the wallet."
});

export const PublishTxRequestSchema = WalletActionBase.extend({
  certificate: z.record(z.string(), z.unknown()).meta({
    description: "The certificate to publish, as the JSON object Mesh expects."
  }),
  ...SttForwardSchema,
  authorityPath: OperatorAuthorityPathSchema
}).meta({
  id: "PublishTxRequest",
  description: "Publish a certificate as the wallet, such as a stake delegation."
});

export const DeployReferenceTxRequestSchema = TxRequestBaseSchema.extend({
  lockedLovelace: QuantitySchema.optional().meta({
    description: "Lovelace to lock with the reference script. Defaults to 5000000."
  }),
  useExactLovelace: z.boolean().optional().meta({
    description: "Lock exactly `lockedLovelace` rather than topping up to the minimum the output needs."
  }),
  allowDuplicateCurrentScriptReferences: z.boolean().optional().meta({
    description: "Deploy even though a reference for the current script already exists."
  })
}).meta({
  id: "DeployReferenceTxRequest",
  description:
    "Deploy the shared STT spend script as a reference script, so later transactions do not carry it inline."
});

export type LockFundsTxRequestDto = z.infer<typeof LockFundsTxRequestSchema>;
export type WalletSpendTxRequestDto = z.infer<typeof WalletSpendTxRequestSchema>;
export type WalletWithdrawTxRequestDto = z.infer<typeof WalletWithdrawTxRequestSchema>;
export type ConsolidateTxRequestDto = z.infer<typeof ConsolidateTxRequestSchema>;
export type SetStakeCredentialTxRequestDto = z.infer<typeof SetStakeCredentialTxRequestSchema>;
export type VoteTxRequestDto = z.infer<typeof VoteTxRequestSchema>;
export type PublishTxRequestDto = z.infer<typeof PublishTxRequestSchema>;
export type DeployReferenceTxRequestDto = z.infer<typeof DeployReferenceTxRequestSchema>;
