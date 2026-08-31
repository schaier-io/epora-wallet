import type { ProposalBuilderKind } from "./types";
import { proposalCopy } from "./copy";

const HEX = /^[0-9a-f]+$/i;
const TX_HASH = /^[0-9a-f]{64}$/i;
const POLICY_ID = /^[0-9a-f]{56}$/i;
const STT_SPEND_MODES = new Set([
  "use",
  "renew-proof-of-life",
  "update-state",
  "manage-streaming-payments",
  "use-allowance",
  "use-beneficiary",
  "payout-streaming-payment",
  "remove-access-index"
]);

type ProposalIdentityInput = {
  walletUnit: string;
  walletPolicyId: string;
  builder: ProposalBuilderKind;
  buildContext: unknown;
};

export class InvalidProposalBuildContextError extends Error {}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
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
  const txHash =
    typeof buildInput?.sttInputTxHash === "string" ? buildInput.sttInputTxHash.trim() : "";
  const outputIndex = buildInput?.sttInputOutputIndex ?? 0;

  const identityMatches =
    input.builder === "stt-spend" &&
    context?.builder === input.builder &&
    typeof context.mode === "string" &&
    STT_SPEND_MODES.has(context.mode) &&
    POLICY_ID.test(policyId) &&
    HEX.test(configuredAssetName) &&
    configuredAssetName.length <= 64 &&
    configuredAssetName.length % 2 === 0 &&
    input.walletPolicyId.toLowerCase() === policyId.toLowerCase() &&
    input.walletUnit.toLowerCase() === `${policyId}${configuredAssetName}`.toLowerCase() &&
    TX_HASH.test(txHash) &&
    typeof outputIndex === "number" &&
    Number.isSafeInteger(outputIndex) &&
    outputIndex >= 0;

  if (!identityMatches) {
    throw new InvalidProposalBuildContextError(
      proposalCopy.walletIdentityMismatch()
    );
  }
}
