import { paymentCredentialHash } from "@/lib/cardano-addresses";

import { calculateAssetDelta, collectAddressAssets } from "./helpers/asset-amounts";
import { isLikelyScriptAddress } from "./helpers/activity";
import {
  approximateBlockTimeMsFromSlot,
  normalizeBlockTimeMs
} from "./helpers/formatters";
import type { WalletActivityEvent } from "./types";

/**
 * Payment attribution for the agent spending console.
 *
 * The chain records addresses, not roles. An allowance record names its
 * delegated wallets as payment key hashes, so the honest signal available is:
 * which addresses funded the transaction's inputs, and which credential hashes
 * those addresses carry. When no recognizable credential appears among the
 * inputs, the payment stays in the history but is labeled ambiguous rather
 * than guessed.
 *
 * `paymentCredentialHash` accepts only payment addresses on the configured network.
 */

export type AgentAttribution =
  | { kind: "agent"; agentId: string }
  | { kind: "owner" }
  | { kind: "ambiguous"; reason: "no-recognized-signer" | "multiple-agents" }
  | { kind: "internal" };

export type AgentPaymentRecord = {
  id: string;
  event: WalletActivityEvent;
  attribution: AgentAttribution;
  /** Block time, slot approximation, or `null` when the chain reports neither yet. */
  occurredAtMs: number | null;
};

export type AgentAttributionInput = {
  /** The smart wallet's script address; value staying inside it is not a payment. */
  walletAddress: string | null;
  /** The connected owner wallet's address, when one is connected. */
  ownerAddress: string | null;
  agents: Array<{ id: string; wallets: string[] }>;
};

/** External addresses that gained value: the recipients of a payment out. */
function externalRecipientsThatGainedValue(event: WalletActivityEvent, walletAddress: string) {
  return event.outputUtxos
    .map((utxo) => utxo.output.address)
    .filter(
      (address) =>
        address && address !== walletAddress && !isLikelyScriptAddress(address)
    )
    .filter((address, index, all) => all.indexOf(address) === index)
    .filter((address) =>
      calculateAssetDelta(
        collectAddressAssets(event.inputUtxos, address),
        collectAddressAssets(event.outputUtxos, address)
      ).some((asset) => BigInt(asset.quantity) > 0n)
    );
}

function matchAgentKeyHashes(event: WalletActivityEvent, agents: AgentAttributionInput["agents"]) {
  // Input addresses carry who funded the fee and the movement; a payment key
  // hash never appears raw on chain, so matching goes through the address.
  const inputKeyHashes = new Set(
    event.inputUtxos
      .map((utxo) => paymentCredentialHash(utxo.output.address))
      .filter((keyHash): keyHash is string => keyHash !== null)
      .map((keyHash) => keyHash.toLowerCase())
  );

  return agents.filter((agent) =>
    agent.wallets.some((wallet) => inputKeyHashes.has(wallet.trim().toLowerCase()))
  );
}

export function attributeAgentPayment(
  event: WalletActivityEvent,
  input: AgentAttributionInput
): AgentAttribution {
  const walletAddress = input.walletAddress;
  if (!walletAddress) return { kind: "ambiguous", reason: "no-recognized-signer" };

  const recipients = externalRecipientsThatGainedValue(event, walletAddress);
  if (recipients.length === 0) return { kind: "internal" };

  const matchedAgents = matchAgentKeyHashes(event, input.agents);
  if (matchedAgents.length === 1) {
    return { kind: "agent", agentId: matchedAgents[0]!.id };
  }
  if (matchedAgents.length > 1) {
    return { kind: "ambiguous", reason: "multiple-agents" };
  }

  const ownerFunded = input.ownerAddress
    ? event.inputUtxos.some((utxo) => utxo.output.address === input.ownerAddress)
    : false;

  return ownerFunded
    ? { kind: "owner" }
    : { kind: "ambiguous", reason: "no-recognized-signer" };
}

export function collectAgentPayments(
  events: WalletActivityEvent[],
  input: AgentAttributionInput
): AgentPaymentRecord[] {
  return events.flatMap((event) => {
    const attribution = attributeAgentPayment(event, input);
    if (attribution.kind === "internal") return [];

    const occurredAtMs =
      normalizeBlockTimeMs(event.transaction.blockTime) ??
      approximateBlockTimeMsFromSlot(event.transaction.slot);

    return [
      {
        id: event.id,
        event,
        attribution,
        occurredAtMs
      }
    ];
  });
}
