import type {
  Asset,
  AuthorityPath,
  ConsolidateAuthorityPath,
  ConstrData,
  OperatorAuthorityPath,
  StakeCredentialSelection
} from "@/lib/types/contracts";
import { serializeAssetsToValueData } from "@/lib/contracts/value-data";

export type StructuredSttAction =
  | "use"
  | "renew-proof-of-life"
  | "update-state"
  | "manage-streaming-payments"
  | "use-allowance"
  | "use-beneficiary"
  | "payout-streaming-payment"
  | "consolidate-utxo"
  | "cancel-streaming-payment";

type OperatorIntent = "use" | "update-state" | "manage-streaming-payments";

export type OnChainStructuredAction =
  | {
      kind: "operator";
      operatorPath: OperatorAuthorityPath;
      operatorIntent: OperatorIntent;
    }
  | {
      kind: "proof-of-life-renewal";
    }
  | {
      kind: "allowance-withdrawal";
      userId?: number;
      // Required when this action becomes the on-chain redeemer (the STT
      // validator checks declared == state diff). Optional in the resolved
      // type only because the UI threads the action shape before the payload
      // is computed; the redeemer builder will throw if it is missing.
      spentAllowance?: Asset[];
    }
  | {
      kind: "beneficiary-withdrawal";
      beneficiaryId?: number;
    }
  | {
      kind: "streaming-payment-payout";
      payoutDelta?: Asset[];
    }
  | {
      kind: "consolidate";
      consolidatePath: ConsolidateAuthorityPath;
    }
  | {
      // A streaming-payment PAYEE stops its OWN stream by signing
      // (CancelStreamingPayment(Int)). The payload is the streaming-payment id.
      // The on-chain validator caps that payment's end_date at "now"; no
      // operator authority and no wallet spend are involved.
      kind: "streaming-payment-cancellation";
      streamingPaymentId?: number;
    }
  | {
      // Cheap operator-authorized removal of one access entry by index
      // (RunOperator(.., RemoveAccessIndex(UserIndex | BeneficiaryIndex))).
      kind: "remove-access-index";
      operatorPath: OperatorAuthorityPath;
      target: AccessRemovalTarget;
    }
  | {
      // Admin/multisig-only: set the wallet's intended stake credential — the
      // stake credential every continuing wallet output must use
      // (RunOperator(.., SetIntendedStakeCredential(Option<Credential>))).
      // No wallet spend.
      kind: "set-intended-stake-credential";
      operatorPath: OperatorAuthorityPath;
      stakeCredential: StakeCredentialSelection;
    };

/// Which access list and position a `remove-access-index` action targets. The
/// index is resolved against the consumed STT state (a single STT thread, so no
/// concurrent reordering can shift it).
export type AccessRemovalTarget = {
  list: "user" | "beneficiary";
  index: number;
};

export function buildOperatorPathData(
  authorityPath: OperatorAuthorityPath = "admin"
): ConstrData {
  return {
    alternative: authorityPath === "multisig" ? 1 : 0,
    fields: []
  };
}

function buildConsolidatePathData(
  authorityPath: ConsolidateAuthorityPath = "admin"
): ConstrData {
  if (authorityPath === "beneficiary") {
    return {
      alternative: 2,
      fields: []
    };
  }

  return {
    alternative: authorityPath === "multisig" ? 1 : 0,
    fields: []
  };
}

function buildOperatorIntentData(
  operatorIntent: OperatorIntent = "use"
): ConstrData {
  return {
    alternative:
      operatorIntent === "update-state"
        ? 1
        : operatorIntent === "manage-streaming-payments"
          ? 2
          : 0,
    fields: []
  };
}

function buildOperatorActionData(
  operatorPath: OperatorAuthorityPath = "admin",
  operatorIntent: OperatorIntent = "use"
): ConstrData {
  return {
    alternative: 0,
    fields: [buildOperatorPathData(operatorPath), buildOperatorIntentData(operatorIntent)]
  };
}

// Encode `Option<Credential>` (the SetIntendedStakeCredential payload).
//   Option: None = alt 1 []; Some(cred) = alt 0 [cred].
//   Credential: VerificationKey(hash) = alt 0 [hash]; Script(hash) = alt 1 [hash].
function buildStakeCredentialOptionData(
  selection: StakeCredentialSelection
): ConstrData {
  if (selection.kind === "none") {
    return { alternative: 1, fields: [] };
  }
  return {
    alternative: 0,
    fields: [
      {
        alternative: selection.kind === "script" ? 1 : 0,
        fields: [selection.hashHex]
      }
    ]
  };
}

// Build the STT spend redeemer. The on-chain `SttAction` now carries the
// wallet-side payload directly (was previously a separate `WalletWitness`
// field on the STT datum). Variants:
//   alt 0 RunOperator(OperatorAction)
//   alt 1 RenewProofOfLife
//   alt 2 UseAllowance(AssetEntries)             // spent_allowance triples
//   alt 3 UseBeneficiary(Int)                    // beneficiary id
//   alt 4 PayStreamingPayment(AssetEntries)          // payout_delta triples
//   alt 5 Consolidate(ConsolidatePath)
//   alt 6 CancelStreamingPayment(Int)                // streaming-payment id
function buildSttActionData(
  action: "mint" | OnChainStructuredAction
): ConstrData {
  if (action === "mint") {
    // Mint redeemer is `Data` on-chain — any value works. Keep a stable
    // 0-arity constructor for backward compatibility with existing off-chain
    // callers.
    return { alternative: 0, fields: [] };
  }

  switch (action.kind) {
    case "operator":
      return {
        alternative: 0,
        fields: [buildOperatorActionData(action.operatorPath, action.operatorIntent)]
      };
    case "proof-of-life-renewal":
      return {
        alternative: 1,
        fields: []
      };
    case "allowance-withdrawal":
      return {
        alternative: 2,
        fields: [
          serializeAssetsToValueData(
            action.spentAllowance ?? [],
            "UseAllowance spent_allowance"
          )
        ]
      };
    case "beneficiary-withdrawal":
      return {
        alternative: 3,
        fields: [action.beneficiaryId ?? 0]
      };
    case "streaming-payment-payout":
      return {
        alternative: 4,
        fields: [
          serializeAssetsToValueData(
            action.payoutDelta ?? [],
            "PayStreamingPayment payout_delta"
          )
        ]
      };
    case "consolidate":
      return {
        alternative: 5,
        fields: [buildConsolidatePathData(action.consolidatePath)]
      };
    case "streaming-payment-cancellation":
      return {
        alternative: 6,
        fields: [action.streamingPaymentId ?? 0]
      };
    case "remove-access-index":
      return {
        // RunOperator(OperatorAction { path, RemoveAccessIndex(target) })
        alternative: 0,
        fields: [
          {
            alternative: 0,
            fields: [
              buildOperatorPathData(action.operatorPath),
              {
                // OperatorActionKind::RemoveAccessIndex(AccessIndexTarget) = alt 3
                alternative: 3,
                fields: [
                  {
                    // UserIndex(Int) = alt 0, BeneficiaryIndex(Int) = alt 1
                    alternative: action.target.list === "user" ? 0 : 1,
                    fields: [action.target.index]
                  }
                ]
              }
            ]
          }
        ]
      };
    case "set-intended-stake-credential":
      return {
        // RunOperator(OperatorAction { path, SetIntendedStakeCredential(opt) })
        alternative: 0,
        fields: [
          {
            alternative: 0,
            fields: [
              buildOperatorPathData(action.operatorPath),
              {
                // OperatorActionKind::SetIntendedStakeCredential(Option<Credential>) = alt 4
                alternative: 4,
                fields: [buildStakeCredentialOptionData(action.stakeCredential)]
              }
            ]
          }
        ]
      };
  }
}

export function buildSttSpendRedeemerData(action: OnChainStructuredAction): ConstrData {
  return buildSttActionData(action);
}

// Backward-compatibility shim for call sites that used to write a separate
// `wallet_witness` field into the STT datum. That field no longer exists —
// the witness is part of the SttAction redeemer now. The shim returns a
// stable, zero-arity constructor so call sites that thread it through
// `withWalletWitness(datum, …)` continue to compile; the value is discarded
// on chain.
export function buildWalletWitnessData(
  _action: "mint" | OnChainStructuredAction
): ConstrData {
  void _action;
  return { alternative: 0, fields: [] };
}

// Historical alias: callers used to label this "state action" data; it now
// resolves to the same wallet-witness shim (see above). Retained for
// callsite stability — prefer `buildSttActionData` for new code.
export function buildStateActionData(
  action: "mint" | OnChainStructuredAction
): ConstrData {
  return buildWalletWitnessData(action);
}

// Historical alias for the wallet-rule constructor. The wallet rule type
// merged into `SttAction`; this shim keeps the symbol importable but emits
// the same zero-arity constructor as the witness shim.
// The wallet validator's spend redeemer is `Data` on-chain (was
// `WalletAction { Default }`). Any value is accepted; we send an empty
// constructor for stability.
export function buildWalletSpendRedeemerData(
  _action?: OnChainStructuredAction
): ConstrData {
  void _action;

  return {
    alternative: 0,
    fields: []
  };
}

export function resolveStructuredOnChainAction(
  action: StructuredSttAction,
  authorityPath?: AuthorityPath
): OnChainStructuredAction {
  if (action === "renew-proof-of-life") {
    return { kind: "proof-of-life-renewal" };
  }

  if (action === "use") {
    return {
      kind: "operator",
      operatorPath: authorityPath === "multisig" ? "multisig" : "admin",
      operatorIntent: "use"
    };
  }

  if (action === "update-state") {
    return {
      kind: "operator",
      operatorPath: authorityPath === "multisig" ? "multisig" : "admin",
      operatorIntent: "update-state"
    };
  }

  if (action === "manage-streaming-payments") {
    return {
      kind: "operator",
      operatorPath: authorityPath === "multisig" ? "multisig" : "admin",
      operatorIntent: "manage-streaming-payments"
    };
  }

  if (action === "use-allowance") {
    return { kind: "allowance-withdrawal" };
  }

  if (action === "use-beneficiary") {
    return { kind: "beneficiary-withdrawal" };
  }

  if (action === "payout-streaming-payment") {
    return { kind: "streaming-payment-payout" };
  }

  if (action === "cancel-streaming-payment") {
    return { kind: "streaming-payment-cancellation" };
  }

  return {
    kind: "consolidate",
    consolidatePath:
      authorityPath === "beneficiary"
        ? "beneficiary"
        : authorityPath === "multisig"
          ? "multisig"
          : "admin"
  };
}

export function resolveOperatorOnChainAction(
  authorityPath?: OperatorAuthorityPath
): Extract<OnChainStructuredAction, { kind: "operator" }> {
  return {
    kind: "operator",
    operatorPath: authorityPath === "multisig" ? "multisig" : "admin",
    operatorIntent: "use"
  };
}
