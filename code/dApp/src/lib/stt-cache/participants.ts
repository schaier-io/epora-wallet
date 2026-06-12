import { deserializeAddress } from "@meshsdk/core";
import { stateFormFromDatum } from "@/lib/contracts/state-form";
import type { ConstrData } from "@/lib/types/contracts";
import type { ProjectedParticipant } from "@/lib/stt-cache/types";

function normalizeOptionalString(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function normalizeHash(value: string | null | undefined) {
  const normalized = normalizeOptionalString(value);
  return normalized ? normalized.toLowerCase() : null;
}

function parseOnChainId(value: string) {
  const normalized = value.trim();

  if (!/^-?\d+$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function buildParticipantKey(
  role: ProjectedParticipant["role"],
  onChainId: number | null,
  paymentKeyHash: string | null,
  sourceAddress: string | null,
  stakeKeyHash: string | null,
  scriptHash: string | null
) {
  return [
    role,
    onChainId ?? "none",
    paymentKeyHash ?? "none",
    sourceAddress ?? "none",
    stakeKeyHash ?? "none",
    scriptHash ?? "none"
  ].join(":");
}

function normalizeEncodedAddress(address: string) {
  const normalized = normalizeOptionalString(address);
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith("addr") || normalized.startsWith("stake")) {
    return normalized;
  }

  if (/^[0-9a-f]+$/i.test(normalized) && normalized.length % 2 === 0) {
    try {
      const decoded = Buffer.from(normalized, "hex").toString("utf8").trim();
      if (decoded.startsWith("addr") || decoded.startsWith("stake")) {
        return decoded;
      }
    } catch {
      return normalized;
    }
  }

  return normalized;
}

function deriveAddressParticipantFields(address: string) {
  const sourceAddress = normalizeEncodedAddress(address);

  if (!sourceAddress) {
    return {
      sourceAddress: null,
      paymentKeyHash: null,
      stakeKeyHash: null,
      scriptHash: null
    };
  }

  try {
    const deserialized = deserializeAddress(sourceAddress);
    return {
      sourceAddress,
      paymentKeyHash: normalizeHash(deserialized.pubKeyHash),
      stakeKeyHash: normalizeHash(deserialized.stakeCredentialHash),
      scriptHash: normalizeHash(deserialized.scriptHash)
    };
  } catch {
    return {
      sourceAddress,
      paymentKeyHash: null,
      stakeKeyHash: null,
      scriptHash: null
    };
  }
}

export function projectParticipantsFromDatum(datum: ConstrData | null | undefined) {
  if (!datum) {
    return [] satisfies ProjectedParticipant[];
  }

  const state = stateFormFromDatum(datum);
  const participants: ProjectedParticipant[] = [];

  for (const user of state.users) {
    const role = user.isAdmin ? "ADMIN_USER" : "USER";
    const onChainId = parseOnChainId(user.id);

    for (const wallet of user.wallets) {
      const paymentKeyHash = normalizeHash(wallet);
      const participant: ProjectedParticipant = {
        role,
        onChainId,
        paymentKeyHash,
        sourceAddress: null,
        stakeKeyHash: null,
        scriptHash: null,
        participantKey: buildParticipantKey(
          role,
          onChainId,
          paymentKeyHash,
          null,
          null,
          null
        )
      };
      participants.push(participant);
    }
  }

  for (const beneficiary of state.beneficiaries) {
    const onChainId = parseOnChainId(beneficiary.id);

    for (const wallet of beneficiary.wallets) {
      const paymentKeyHash = normalizeHash(wallet);
      const participant: ProjectedParticipant = {
        role: "BENEFICIARY",
        onChainId,
        paymentKeyHash,
        sourceAddress: null,
        stakeKeyHash: null,
        scriptHash: null,
        participantKey: buildParticipantKey(
          "BENEFICIARY",
          onChainId,
          paymentKeyHash,
          null,
          null,
          null
        )
      };
      participants.push(participant);
    }
  }

  for (const streamingPayment of state.streamingPayments) {
    const onChainId = parseOnChainId(streamingPayment.id);
    const addressFields = deriveAddressParticipantFields(streamingPayment.payoutAddress);
    participants.push({
      role: "STREAMING_PAYMENT_RECIPIENT",
      onChainId,
      paymentKeyHash: addressFields.paymentKeyHash,
      sourceAddress: addressFields.sourceAddress,
      stakeKeyHash: addressFields.stakeKeyHash,
      scriptHash: addressFields.scriptHash,
      participantKey: buildParticipantKey(
        "STREAMING_PAYMENT_RECIPIENT",
        onChainId,
        addressFields.paymentKeyHash,
        addressFields.sourceAddress,
        addressFields.stakeKeyHash,
        addressFields.scriptHash
      )
    });
  }

  return participants;
}
