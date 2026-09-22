import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { BETA_CONSENT_COOKIE, BETA_CONSENT_HEADER, betaConsentValue, hasBetaConsent, requiresBetaConsent } from "@/lib/legal/beta-consent";
import { buildContentSecurityPolicy } from "@/lib/http/content-security-policy";

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    if (requiresBetaConsent(request.method, request.nextUrl.pathname) &&
      !hasBetaConsent(request.cookies.get(BETA_CONSENT_COOKIE)?.value) &&
      !hasBetaConsent(request.headers.get(BETA_CONSENT_HEADER))) {
      return NextResponse.json({
        error: "Explicit acceptance of the unaudited beta risks and terms is required.",
        code: "BETA_CONSENT_REQUIRED",
        acknowledgement: betaConsentValue(),
        terms: "/terms",
        privacy: "/privacy"
      }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.next();
  }
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const contentSecurityPolicy = buildContentSecurityPolicy(
    nonce,
    process.env.NODE_ENV !== "production",
    // Inlined at build time; true only while browser error reporting is
    // configured, which is when the client SDK needs its ingest endpoint.
    { sentryEnabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN) }
  );
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  // Next reads the request CSP and propagates the nonce to its framework and
  // hydration scripts. The response CSP makes the browser enforce that nonce.
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  return response;
}

export const config = {
  matcher: [
    "/api/:path*",
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" }
      ]
    }
  ]
};
