import { NextResponse } from "next/server";
import { z } from "zod";
import { lookupSttWallets, SttLookupInputError } from "@/lib/stt-cache/lookup";
import { clientKey, rateLimit } from "@/lib/http/rate-limit";
import { readBoundedJson, RequestBodyTooLargeError } from "@/lib/http/request-body";
import { logger, serializeError } from "@/lib/observability/logger";
import { getTranslations } from "next-intl/server";

const getI18n = () => getTranslations("AppApiSttLookupRoute");

export const runtime = "nodejs";

function createRequestSchema(exclusiveLookupMessage: string) {
  return z.object({
    paymentKeyHash: z.string().trim().regex(/^[0-9a-f]{56}$/i).optional(),
    address: z.string().trim().min(1).max(256).optional(),
    txLimit: z.number().int().min(1).max(50).optional(),
    cursor: z.string().trim().min(1).optional()
  })
  .superRefine((value, context) => {
    const hasPaymentKeyHash = typeof value.paymentKeyHash === "string";
    const hasAddress = typeof value.address === "string";

    if (hasPaymentKeyHash === hasAddress) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: exclusiveLookupMessage
      });
    }
  });
}

export async function POST(request: Request) {
  const i18n = await getI18n();
  try {
    const limit = await rateLimit(clientKey(request, "stt-lookup"), 60, 60_000);
    if (!limit.ok) {
      return NextResponse.json(
        { error: i18n("tooManyWalletLookupsTryAgainShortly") },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
      );
    }
    const bodyUnknown: unknown = await readBoundedJson(request, 4 * 1024);
    const body = createRequestSchema(
      i18n("exactlyOneOfPaymentkeyhashOrAddressMustBe")
    ).parse(bodyUnknown);
    const result = await lookupSttWallets(body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: error.issues[0]?.message ?? i18n("invalidSttLookupRequest")
        },
        {
          status: 400
        }
      );
    }

    if (error instanceof SttLookupInputError) {
      return NextResponse.json(
        {
          error: i18n("invalidCardanoAddressUseABech32PaymentAddress")
        },
        {
          status: 400
        }
      );
    }

    logger.error("api.stt_lookup_failed", { err: serializeError(error) });
    return NextResponse.json({ error: i18n("sttWalletLookupFailed") }, { status: 500 });
  }
}
