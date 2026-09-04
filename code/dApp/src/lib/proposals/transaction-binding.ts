import {
  constrDataToCstPlutusData,
  deserializeTx,
  meshPurposeBody,
  type CstRedeemer,
  type CstTransactionBody,
  type CstTransactionInput
} from "@/lib/mesh/cst";
import {
  buildOperatorPathData,
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

function compareTransactionInputs(left: CstTransactionInput, right: CstTransactionInput): number {
  const hashOrder = lower(left.transactionId().toString()).localeCompare(
    lower(right.transactionId().toString())
  );
  if (hashOrder !== 0) return hashOrder;
  const leftIndex = BigInt(left.index());
  const rightIndex = BigInt(right.index());
  return leftIndex < rightIndex ? -1 : leftIndex > rightIndex ? 1 : 0;
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

const PURPOSE_REDEEMER_TAG = {
  certificate: 2,
  withdrawal: 3,
  vote: 4
} as const;

function mapsEqual(left: Map<string, bigint> | undefined, right: Map<string, bigint> | undefined) {
  if (!left || !right || left.size !== right.size) return false;
  return [...left].every(([key, value]) => right.get(key) === value);
}

function assertWrapperPurposeBinding(input: {
  body: CstTransactionBody;
  redeemers: CstRedeemer[];
  buildContext: ProposalBuildContext;
}): void {
  const expectedPurposeRedeemer = constrDataToCstPlutusData(
    buildOperatorPathData(authorityPath(input.buildContext))
  );
  let bodyMatches: boolean;
  let redeemerTag: number;

  switch (input.buildContext.builder) {
    case "wallet-withdraw": {
      const expected = meshPurposeBody({
        kind: "withdrawal",
        address: input.buildContext.input.rewardAddress,
        amount: input.buildContext.input.amountLovelace
      });
      bodyMatches = mapsEqual(input.body.withdrawals(), expected.withdrawals());
      redeemerTag = PURPOSE_REDEEMER_TAG.withdrawal;
      break;
    }
    case "wallet-publish": {
      const expected = meshPurposeBody({
        kind: "certificate",
        value: input.buildContext.input.certificate
      });
      bodyMatches = input.body.certs()?.toCbor() === expected.certs()?.toCbor();
      redeemerTag = PURPOSE_REDEEMER_TAG.certificate;
      break;
    }
    case "wallet-vote": {
      const expected = meshPurposeBody({ kind: "vote", value: input.buildContext.input.vote });
      bodyMatches =
        input.body.votingProcedures()?.toCbor() === expected.votingProcedures()?.toCbor();
      redeemerTag = PURPOSE_REDEEMER_TAG.vote;
      break;
    }
    default:
      return;
  }

  const matchingRedeemers = input.redeemers.filter((redeemer) => redeemer.tag() === redeemerTag);
  if (
    !bodyMatches ||
    matchingRedeemers.length !== 1 ||
    matchingRedeemers[0]!.index() !== 0n ||
    !matchingRedeemers[0]!.data().equals(expectedPurposeRedeemer)
  ) {
    throw new Error("wallet purpose mismatch");
  }
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
    const inputs = toArray<CstTransactionInput>(transaction.body().inputs())
      .slice()
      .sort(compareTransactionInputs);
    const spendIndex = inputs.findIndex(
      (transactionInput) =>
        lower(transactionInput.transactionId().toString()) === txHash &&
        Number(transactionInput.index()) === outputIndex
    );
    if (spendIndex < 0) throw new Error("state input missing");

    const redeemers = toArray<CstRedeemer>(
      transaction.witnessSet().redeemers()?.values() ?? []
    );
    const matchingRedeemers = redeemers.filter(
      (redeemer) => redeemer.tag() === 0 && redeemer.index() === BigInt(spendIndex)
    );
    if (
      matchingRedeemers.length !== 1 ||
      !matchingRedeemers[0]!.data().equals(constrDataToCstPlutusData(expected))
    ) {
      throw new Error("state redeemer mismatch");
    }
    assertWrapperPurposeBinding({
      body: transaction.body(),
      redeemers,
      buildContext: input.buildContext
    });
  } catch (error) {
    if (error instanceof InvalidProposalBuildContextError) throw error;
    throw new InvalidProposalBuildContextError(proposalCopy.walletIdentityMismatch());
  }
}
