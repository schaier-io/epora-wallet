import type { ProposalAuthorityPath, ProposalBuildContext, ProposalBuilderKind } from "./types";
import { proposalCopy } from "./copy";

const HEX = /^[0-9a-f]+$/i;
const TX_HASH = /^[0-9a-f]{64}$/i;
const POLICY_ID = /^[0-9a-f]{56}$/i;
const HASH_28 = /^[0-9a-f]{56}$/i;
// Proposal verification evaluates only the contract's admin and multisig operator gate.
const PROPOSAL_STT_SPEND_MODES = new Set([
  "use",
  "update-state",
  "manage-streaming-payments",
  "remove-access-index"
]);

export const CREATABLE_PROPOSAL_BUILDERS = [
  "stt-spend",
  "wallet-withdraw",
  "wallet-publish",
  "wallet-vote",
  "set-intended-stake-credential",
  "consolidate-utxo"
] as const satisfies readonly ProposalBuilderKind[];

type ProposalIdentityInput = {
  walletUnit: string;
  walletPolicyId: string;
  authorityPath: ProposalAuthorityPath;
  builder: ProposalBuilderKind;
  buildContext: unknown;
};

export class InvalidProposalBuildContextError extends Error {}

export function proposalActionKind(buildContext: ProposalBuildContext): string {
  return buildContext.builder === "stt-spend"
    ? buildContext.mode
    : buildContext.builder;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function hasValidInputReference(
  buildInput: Record<string, unknown> | null,
  hashField: "sttInputTxHash" | "walletInputTxHash",
  indexField: "sttInputOutputIndex" | "walletInputOutputIndex"
): boolean {
  const txHash = typeof buildInput?.[hashField] === "string"
    ? buildInput[hashField].trim()
    : "";
  const outputIndex = buildInput?.[indexField] ?? 0;
  return (
    TX_HASH.test(txHash) &&
    typeof outputIndex === "number" &&
    Number.isSafeInteger(outputIndex) &&
    outputIndex >= 0
  );
}

function builderFieldsMatch(
  builder: ProposalBuilderKind,
  context: Record<string, unknown>,
  buildInput: Record<string, unknown> | null
): boolean {
  switch (builder) {
    case "stt-spend": {
      const baseMatches =
        typeof context.mode === "string" &&
        PROPOSAL_STT_SPEND_MODES.has(context.mode) &&
        hasValidInputReference(buildInput, "sttInputTxHash", "sttInputOutputIndex");
      if (context.mode !== "remove-access-index") return baseMatches;
      const target = record(buildInput?.removeAccessTarget);
      return (
        baseMatches &&
        (target?.list === "user" || target?.list === "beneficiary") &&
        typeof target.index === "number" &&
        Number.isSafeInteger(target.index) &&
        target.index >= 0
      );
    }
    case "wallet-withdraw":
    case "wallet-publish":
    case "wallet-vote":
    case "consolidate-utxo":
      return hasValidInputReference(buildInput, "sttInputTxHash", "sttInputOutputIndex");
    case "set-intended-stake-credential": {
      const credential = record(buildInput?.stakeCredential);
      const credentialMatches =
        credential?.kind === "none" ||
        ((credential?.kind === "key" || credential?.kind === "script") &&
          typeof credential.hashHex === "string" &&
          HASH_28.test(credential.hashHex));
      return (
        hasValidInputReference(buildInput, "sttInputTxHash", "sttInputOutputIndex") &&
        credentialMatches
      );
    }
    case "wallet-spend":
    case "lock-funds":
    case "mint":
      return false;
  }
}

export function assertProposalWalletBinding(input: ProposalIdentityInput): void {
  const context = record(input.buildContext);
  const config = record(context?.config);
  const buildInput = record(context?.input);
  const policyId = typeof config?.walletPolicyId === "string" ? config.walletPolicyId.trim() : "";
  const configuredAssetName =
    typeof config?.walletAssetNameHex === "string" && config.walletAssetNameHex.trim()
      ? config.walletAssetNameHex.trim()
      : typeof config?.sttAssetNameHex === "string"
        ? config.sttAssetNameHex.trim()
        : "";

  const identityMatches =
    context?.builder === input.builder &&
    POLICY_ID.test(policyId) &&
    HEX.test(configuredAssetName) &&
    configuredAssetName.length <= 64 &&
    configuredAssetName.length % 2 === 0 &&
    input.walletPolicyId.toLowerCase() === policyId.toLowerCase() &&
    input.walletUnit.toLowerCase() === `${policyId}${configuredAssetName}`.toLowerCase() &&
    (buildInput?.authorityPath ?? "admin") === input.authorityPath &&
    builderFieldsMatch(input.builder, context, buildInput);

  if (!identityMatches) {
    throw new InvalidProposalBuildContextError(
      proposalCopy.walletIdentityMismatch()
    );
  }
}
