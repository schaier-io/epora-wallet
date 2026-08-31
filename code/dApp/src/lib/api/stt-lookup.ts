import { z } from "zod";
import { STT_LOOKUP_MAX_TX_LIMIT } from "@/lib/stt-cache/domain";

const PAYMENT_KEY_HASH_PATTERN = /^[0-9a-f]{56}$/i;
const MAX_ADDRESS_LENGTH = 256;

// Moved verbatim out of the route handler. The XOR rule and its message are
// unchanged, so every existing test still describes the same behaviour.
export const SttLookupRequestSchema = z
  .object({
    paymentKeyHash: z
      .string()
      .trim()
      .regex(PAYMENT_KEY_HASH_PATTERN)
      .optional()
      .meta({
        description: "Payment key hash of a wallet participant, 56 hex characters.",
        example: "bc3f3eae902eaf53b3d8a1f9d7ad2e6b370f8b9ec8c9b62a9044455b"
      }),
    address: z.string().trim().min(1).max(MAX_ADDRESS_LENGTH).optional().meta({
      description: "Bech32 address to derive the payment key hash from."
    }),
    txLimit: z
      .number()
      .int()
      .min(1)
      .max(STT_LOOKUP_MAX_TX_LIMIT)
      .optional()
      .meta({ description: "Recent transactions to return per wallet." }),
    cursor: z
      .string()
      .trim()
      .min(1)
      .optional()
      .meta({ description: "`nextCursor` from a previous response." })
  })
  .superRefine((value, context) => {
    const hasPaymentKeyHash = typeof value.paymentKeyHash === "string";
    const hasAddress = typeof value.address === "string";

    if (hasPaymentKeyHash === hasAddress) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Exactly one of paymentKeyHash or address must be provided."
      });
    }
  })
  .meta({
    id: "SttLookupRequest",
    description: "Find the STT wallets a payment key participates in. Give exactly one of paymentKeyHash or address."
  });

const SttLookupTransactionSchema = z
  .object({
    txHash: z.string(),
    transitionKind: z.enum(["MINT", "FORWARD", "CLOSE", "UNKNOWN"]),
    slot: z.string(),
    txIndex: z.number().int(),
    block: z.string(),
    blockHeight: z.number().int().nullable(),
    blockTime: z.number().int().nullable(),
    fees: z.string(),
    size: z.number().int(),
    deposit: z.string(),
    invalidBefore: z.string(),
    invalidAfter: z.string()
  })
  .meta({
    id: "SttLookupTransaction",
    description: "One state-thread transition. Lovelace amounts are decimal strings."
  });

const SttLookupWalletSchema = z
  .object({
    id: z.string(),
    network: z.string(),
    policyId: z.string(),
    assetNameHex: z.string(),
    unit: z.string(),
    sttScriptAddress: z.string(),
    walletScriptAddress: z.string(),
    status: z.enum(["ACTIVE", "CLOSED"]),
    currentTxHash: z.string().nullable(),
    currentOutputIndex: z.number().int().nullable(),
    lastSeenBlockHeight: z.number().int().nullable(),
    lastSeenBlockTime: z.number().int().nullable(),
    matchedRoles: z.array(
      z.enum(["ADMIN_USER", "USER", "BENEFICIARY", "STREAMING_PAYMENT_RECIPIENT"])
    ),
    stateSummary: z.object({
      walletName: z.string(),
      userCount: z.number().int(),
      adminCount: z.number().int(),
      beneficiaryCount: z.number().int(),
      streamingPaymentCount: z.number().int()
    }),
    recentTransactions: z.array(SttLookupTransactionSchema)
  })
  .meta({
    id: "SttLookupWallet",
    description: "One permission wallet, its current state summary, and its recent activity."
  });

export const SttLookupResponseSchema = z
  .object({
    normalizedPaymentKeyHash: z.string().nullable(),
    sourceAddress: z.string().nullable(),
    nextCursor: z.string().nullable().meta({
      description: "Pass back as `cursor` for the next page. `null` on the last page."
    }),
    wallets: z.array(SttLookupWalletSchema),
    sync: z
      .object({
        recentHeadTriggered: z.boolean(),
        reconcileTriggered: z.boolean(),
        recentHeadLastSyncedAt: z.string().nullable(),
        walletReconcileLastSyncedAt: z.string().nullable(),
        historyBackfillCursor: z.string().nullable()
      })
      .meta({
        description: "Freshness of the cache behind this answer, and whether this request triggered a background sync."
      })
  })
  .meta({
    id: "SttLookupResponse",
    description: "Wallets matching the key, with state, recent activity and cache freshness."
  });

export type SttLookupRequestDto = z.infer<typeof SttLookupRequestSchema>;
export type SttLookupResponseDto = z.infer<typeof SttLookupResponseSchema>;
