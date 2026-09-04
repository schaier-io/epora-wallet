import {
  constrDataToCstPlutusData,
  deserializeTx,
  type CstRedeemer,
  type CstTransactionInput
} from "@/lib/mesh/cst";
import {
  buildSttSpendRedeemerData,
  resolveOperatorOnChainAction,
  resolveStructuredOnChainAction,
  type OnChainStructuredAction
} from "@/lib/contracts/action-data";
import type { ConstrData, OperatorAuthorityPath } from "@/lib/types/contracts";
import type { ProposalBuildContext } from "./types";
import { proposalCopy } from "./copy";
import { InvalidProposalBuildContextError } from "./validation";

function lower(value: string): string {
  return value.trim().toLowerCase();
}

function toArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  const candidate = value as { values?: () => T[] };
  return typeof candidate.values === "function" ? candidate.values() : [];
}

function authorityPath(buildContext: ProposalBuildContext): OperatorAuthorityPath {
  const input = buildContext.input as { authorityPath?: unknown };
  return input.authorityPath === "multisig" ? "multisig" : "admin";
}

function expectedRedeemer(buildContext: ProposalBuildContext): ConstrData | null {
  const authority = authorityPath(buildContext);
  let action: OnChainStructuredAction;
  switch (buildContext.builder) {
    case "stt-spend": {
      switch (buildContext.mode) {
        case "use":
        case "update-state":
        case "manage-streaming-payments":
          action = resolveStructuredOnChainAction(buildContext.mode, authority);
          break;
        case "remove-access-index":
          if (!buildContext.input.removeAccessTarget) return null;
          action = {
            kind: "remove-access-index",
            operatorPath: authority,
            target: buildContext.input.removeAccessTarget
          };
          break;
        default:
          return null;
      }
      break;
    }
    case "wallet-withdraw":
    case "wallet-publish":
    case "wallet-vote":
      action = resolveOperatorOnChainAction(authority);
      break;
    case "set-intended-stake-credential":
      action = {
        kind: "set-intended-stake-credential",
        operatorPath: authority,
        stakeCredential: buildContext.input.stakeCredential
      };
      break;
    case "consolidate-utxo":
      action = resolveStructuredOnChainAction("consolidate-utxo", authority);
      break;
    case "wallet-spend":
    case "lock-funds":
    case "mint":
      return null;
  }
  return buildSttSpendRedeemerData(action);
}

export function assertProposalTransactionBinding(input: {
  unsignedTxHex: string;
  buildContext: ProposalBuildContext;
}): void {
  try {
    const buildInput = input.buildContext.input as {
      sttInputTxHash?: unknown;
      sttInputOutputIndex?: unknown;
    };
    const expected = expectedRedeemer(input.buildContext);
    const txHash = typeof buildInput.sttInputTxHash === "string"
      ? lower(buildInput.sttInputTxHash)
      : "";
    const outputIndex = buildInput.sttInputOutputIndex ?? 0;
    if (!expected || typeof outputIndex !== "number") throw new Error("invalid context");
    const transaction = deserializeTx(input.unsignedTxHex);
    const inputs = toArray<CstTransactionInput>(transaction.body().inputs());
    const spendIndex = inputs.findIndex(
      (transactionInput) =>
        lower(transactionInput.transactionId().toString()) === txHash &&
        Number(transactionInput.index()) === outputIndex
    );
    if (spendIndex < 0) throw new Error("state input missing");

    const matchingRedeemers = toArray<CstRedeemer>(
      transaction.witnessSet().redeemers()?.values() ?? []
    ).filter(
      (redeemer) => redeemer.tag() === 0 && redeemer.index() === BigInt(spendIndex)
    );
    if (
      matchingRedeemers.length !== 1 ||
      !matchingRedeemers[0]!.data().equals(constrDataToCstPlutusData(expected))
    ) {
      throw new Error("state redeemer mismatch");
    }
  } catch (error) {
    if (error instanceof InvalidProposalBuildContextError) throw error;
    throw new InvalidProposalBuildContextError(proposalCopy.walletIdentityMismatch());
  }
}
