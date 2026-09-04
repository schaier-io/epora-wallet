import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { runSttBackgroundSync } from "@/lib/stt-cache/indexer";
import { withSttSyncAdvisoryLock } from "@/lib/stt-cache/sync-lock";
import {
  InvalidJsonError,
  readBoundedJson,
  RequestBodyTooDeepError,
  RequestBodyTooLargeError
} from "@/lib/http/request-body";
import { getSttSyncSecret } from "@/lib/env/server-env";
import { logger, serializeError } from "@/lib/observability/logger";
import { getTranslations } from "next-intl/server";

const getI18n = () => getTranslations("AppApiSttSyncRoute");

export const runtime = "nodejs";
// Vercel terminates the function once `maxDuration` passes. With Fluid Compute
// every plan defaults to 300 s and Hobby caps there (docs, 2026-08-24). A run
// budgets its own time below that so every phase stops at a checkpoint and
// leaves a resumable cursor instead of being killed mid-write. The deadline is
// only checked between units of work (one transaction, one wallet), so the
// margin assumes one unit's chain calls return within it. A hung Blockfrost
// call past the margin costs that run's cursor advance, never data.
export const maxDuration = 300;
const SYNC_TIME_BUDGET_MS = maxDuration * 1000 - 60_000;

const RequestSchema = z.object({
  recentHeadPageBudget: z.number().int().min(1).max(50).optional(),
  historyBackfillPageBudget: z.number().int().min(1).max(100).optional(),
  timeBudgetMs: z.number().int().min(1_000).max(SYNC_TIME_BUDGET_MS).optional()
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

    const bodyUnknown: unknown = request.body === null
      ? {}
      : await readBoundedJson(request, 2 * 1024);

    const { timeBudgetMs = SYNC_TIME_BUDGET_MS, ...pageBudgets } =
      RequestSchema.parse(bodyUnknown);
    // Measured from here so the lock round-trip counts against the budget.
    const deadline = Date.now() + timeBudgetMs;
    const locked = await withSttSyncAdvisoryLock(() =>
      runSttBackgroundSync({ ...pageBudgets, deadline })
    );
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
    if (error instanceof InvalidJsonError || error instanceof RequestBodyTooDeepError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
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
