// REPORTED: Company identity, address and registration number were supplied by
// the operator in this task. The Wyoming registry required human verification.
export const LEGAL_OPERATOR = {
  name: "41BIT LLC",
  address: "5830 E 2nd St, Ste 7000 #36418, Casper, Wyoming 82609, United States",
  jurisdiction: "Wyoming, United States",
  entityId: "2026-001999964",
  email: "info@41bit.io"
} as const;

// Change this whenever the terms or material beta risk disclosures change.
export const LEGAL_VERSION = "epora-beta-3";

export const MIT_LICENSE_URL = "https://github.com/schaier-io/epora-wallet/blob/main/LICENSE";

export const LEGAL_PATHS = ["/legal", "/terms", "/privacy"] as const;

export function isLegalPath(pathname: string): boolean {
  return LEGAL_PATHS.some((path) => pathname === path || pathname === `${path}/`);
}
