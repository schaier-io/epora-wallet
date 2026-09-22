import { getTranslations } from "next-intl/server";
import { type NextRequest, NextResponse } from "next/server";
import { CARDANO_NETWORK } from "@/lib/cardano-network";
import { LEGAL_VERSION } from "@/lib/legal";
import { BETA_CONSENT_COOKIE, betaConsentValue, hasBetaConsent, validBetaAcceptance } from "@/lib/legal/beta-consent";
import { readBoundedJson } from "@/lib/http/request-body";

const NO_STORE = { "Cache-Control": "no-store" };

export function GET(request: NextRequest) {
  return NextResponse.json({
    accepted: hasBetaConsent(request.cookies.get(BETA_CONSENT_COOKIE)?.value),
    network: CARDANO_NETWORK,
    version: LEGAL_VERSION
  }, { headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  const i18n = await getTranslations("BetaConsentApi");
  // The browser can acknowledge only from this origin. API callers use the explicit header.
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: i18n("sameOrigin") }, { status: 403, headers: NO_STORE });
  }
  try {
    const body = await readBoundedJson(request, 2048);
    if (!validBetaAcceptance(body)) {
      return NextResponse.json({ error: i18n("allRisks") }, { status: 400, headers: NO_STORE });
    }
    const response = NextResponse.json({ accepted: true, network: CARDANO_NETWORK, version: LEGAL_VERSION }, { headers: NO_STORE });
    response.cookies.set(BETA_CONSENT_COOKIE, betaConsentValue(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/"
    });
    return response;
  } catch {
    return NextResponse.json({ error: i18n("invalid") }, { status: 400, headers: NO_STORE });
  }
}
