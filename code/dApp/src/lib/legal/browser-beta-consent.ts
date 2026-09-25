import { createDefaultTranslator } from "@/i18n/default-translator";
import messages from "@/i18n/generated/default-en/BetaConsent.json";
import { CARDANO_NETWORK } from "@/lib/cardano-network";
import { hasCurrentBetaReceipt } from "./beta-consent";

const i18n = createDefaultTranslator("BetaConsent", messages);

export class BetaConsentRequiredError extends Error {
  constructor() {
    super(i18n("required"));
    this.name = "BetaConsentRequiredError";
  }
}

/** Recheck before a wallet prompt or broadcast in a tab that may outlive its consent. */
export async function requireBrowserBetaConsent(): Promise<void> {
  if (CARDANO_NETWORK !== "mainnet") return;
  try {
    const response = await fetch("/api/beta-consent", { credentials: "same-origin", cache: "no-store" });
    const receipt: unknown = await response.json();
    if (response.ok && hasCurrentBetaReceipt(receipt)) return;
  } catch {
    // Network failures cannot establish consent. Return the same safe action below.
  }
  throw new BetaConsentRequiredError();
}
