import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { runSttBackgroundSync } from "@/lib/stt-cache/indexer";
import { withSttSyncAdvisoryLock } from "@/lib/stt-cache/sync-lock";
import { readBoundedJson, RequestBodyTooLargeError } from "@/lib/http/request-body";
import { getSttSyncSecret } from "@/lib/env/server-env";
import { logger, serializeError } from "@/lib/observability/logger";
import { getTranslations } from "next-intl/server";

const getI18n = () => getTranslations("AppApiSttSyncRoute");

export const runtime = "nodejs";

const RequestSchema = z.object({
  recentHeadPageBudget: z.number().int().min(1).max(50).optional(),
  historyBackfillPageBudget: z.number().int().min(1).max(100).optional()
});

function isAuthorized(request: Request) {
  const configuredSecret = getSttSyncSecret();

  const matchesConfiguredSecret = (candidate: string | null): boolean => {
    if (!candidate) {
      return false;
    }
    const candidateDigest = createHash("sha256").update(candidate.trim()).digest();
    const configuredDigest = createHash("sha256").update(configuredSecret).digest();
    return timingSafeEqual(candidateDigest, configuredDigest);
  };

  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return matchesConfiguredSecret(authorization.slice("Bearer ".length));
  }

  return matchesConfiguredSecret(request.headers.get("x-stt-sync-secret"));
}

export async function POST(request: Request) {
  const i18n = await getI18n();
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json(
        {
          error: i18n("unauthorized")
        },
        {
          status: 401
        }
      );
    }

    let bodyUnknown: unknown = {};
    try {
      bodyUnknown = await readBoundedJson(request, 2 * 1024);
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        throw error;
      }
      bodyUnknown = {};
    }

    const body = RequestSchema.parse(bodyUnknown);
    const locked = await withSttSyncAdvisoryLock(() => runSttBackgroundSync(body));
    if (!locked.acquired) {
      return NextResponse.json(
        { error: i18n("anSttSynchronizationIsAlreadyRunning") },
        { status: 409 }
      );
    }
    return NextResponse.json(locked.result);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: error.issues[0]?.message ?? i18n("invalidSttSyncRequest")
        },
        {
          status: 400
        }
      );
    }

    logger.error("api.stt_sync_failed", { err: serializeError(error) });
    return NextResponse.json({ error: i18n("sttSynchronizationFailed") }, { status: 500 });
  }
}
