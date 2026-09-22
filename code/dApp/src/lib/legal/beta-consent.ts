import { CARDANO_NETWORK, type CardanoNetwork } from "../cardano-network";
import { LEGAL_VERSION } from "../legal";

export const BETA_CONSENT_COOKIE = "epora_beta_consent";
export const BETA_CONSENT_HEADER = "x-epora-beta-consent";

// An acknowledgement, not authentication or a retained legal acceptance record.
export function betaConsentValue(network: CardanoNetwork = CARDANO_NETWORK): string {
  return `${network}:${LEGAL_VERSION}`;
}

export function hasBetaConsent(value: string | null | undefined, network: CardanoNetwork = CARDANO_NETWORK): boolean {
  return value === betaConsentValue(network);
}

export function requiresBetaConsent(method: string, pathname: string, network: CardanoNetwork = CARDANO_NETWORK): boolean {
  if (network !== "mainnet" || !pathname.startsWith("/api/")) return false;
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return false;
  const path = pathname.replace(/\/$/, "");
  if (path === "/api/stt/sync" || path === "/api/beta-consent") return false;
  return !(method === "DELETE" && path === "/api/proposals/auth");
}

export const BETA_ACKNOWLEDGEMENTS = ["beta", "unaudited", "totalLoss", "liabilityRelease", "terms"] as const;
export type BetaAcknowledgements = Record<(typeof BETA_ACKNOWLEDGEMENTS)[number], boolean>;

export function validBetaAcceptance(value: unknown, network: CardanoNetwork = CARDANO_NETWORK): boolean {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return body.network === network && body.version === LEGAL_VERSION &&
    BETA_ACKNOWLEDGEMENTS.every((key) => body[key] === true);
}

export function hasCurrentBetaReceipt(value: unknown, network: CardanoNetwork = CARDANO_NETWORK): boolean {
  if (!value || typeof value !== "object") return false;
  const receipt = value as Record<string, unknown>;
  return receipt.accepted === true && receipt.network === network && receipt.version === LEGAL_VERSION;
}
