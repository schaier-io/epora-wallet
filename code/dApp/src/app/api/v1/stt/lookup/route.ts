import { NextResponse } from "next/server";
import { z } from "zod";
import { lookupSttWallets, SttLookupInputError } from "@/lib/stt-cache/lookup";
import { SttLookupRequestSchema, type SttLookupResponseDto } from "@/lib/api";
import { clientKey, rateLimit } from "@/lib/http/rate-limit";
import {
  InvalidJsonError,
  readBoundedJson,
  RequestBodyTooDeepError,
  RequestBodyTooLargeError
} from "@/lib/http/request-body";
import { logger, serializeError } from "@/lib/observability/logger";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const limit = await rateLimit(clientKey(request, "stt-lookup"), 600, 60_000);
    if (!limit.ok) {
      return NextResponse.json(
        { error: "Too many wallet lookups. Try again shortly." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
      );
    }
    const bodyUnknown: unknown = await readBoundedJson(request, 4 * 1024);
    const body = SttLookupRequestSchema.parse(bodyUnknown);
    // Typed against the shared schema so a cache-layer shape change that the
    // spec does not describe fails the build here, not in production.
    const result: SttLookupResponseDto = await lookupSttWallets(body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }
    if (error instanceof InvalidJsonError || error instanceof RequestBodyTooDeepError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: error.issues[0]?.message ?? "Invalid STT lookup request."
        },
        {
          status: 400
        }
      );
    }

    if (error instanceof SttLookupInputError) {
      return NextResponse.json(
        {
          error: error.message
        },
        {
          status: 400
        }
      );
    }

    logger.error("api.stt_lookup_failed", { err: serializeError(error) });
    return NextResponse.json({ error: "STT wallet lookup failed." }, { status: 500 });
  }
}
