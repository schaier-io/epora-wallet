import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/http/rate-limit";
import { jsonError, requireSession } from "@/lib/proposals/api-helpers";
import { listRegisteredWalletSigners } from "@/lib/proposals/signer-registration-store";
import { isWalletParticipant } from "@/lib/proposals/store";
import { getTranslations } from "next-intl/server";

const getI18n = () => getTranslations("AppApiProposalsWallets[unit]SignersRoute");

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ unit: string }> };

// An asset unit is a 56-character policy id followed by the asset name hex.
// The cap only rejects obvious junk before it reaches the database.
const MAX_UNIT_LENGTH = 200;

// GET /api/proposals/wallets/:unit/signers: which of this wallet's indexed
// participants have completed the wallet sign-in. The owner needs this to tell
// a co-signer who is ready from one who still has to register.
export async function GET(_request: Request, context: RouteContext) {
  const i18n = await getI18n();
  const auth = await requireSession();
  if ("response" in auth) {
    return auth.response;
  }

  const limit = await rateLimit(`proposals:signers:${auth.session.paymentKeyHash}`, 600, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: i18n("tooManySignerRequestsTryAgainShortly") },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const { unit } = await context.params;
  if (!unit || unit.length > MAX_UNIT_LENGTH) {
    return jsonError(i18n("walletunitIsTooLong"), 400);
  }

  // Only a member of the wallet may ask. Without this the route would report
  // registration for any wallet whose unit the caller can name.
  if (!(await isWalletParticipant(unit, auth.session.paymentKeyHash))) {
    return jsonError(i18n("youAreNotAParticipantOfThisWallet"), 403);
  }

  return NextResponse.json({ registered: await listRegisteredWalletSigners(unit) });
}
