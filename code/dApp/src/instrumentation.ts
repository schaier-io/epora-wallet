// Next.js server/edge instrumentation entry (runs once per server boot, for
// the Node.js and edge runtimes alike). Sentry initializes only when a DSN is
// configured; without credentials this file is inert and local development
// needs nothing. The request-error hook forwards every uncaught App Router /
// route-handler error (`captureRequestError` skips already-captured errors).
// Errors swallowed by route handlers (via `createTxRoute` → `logger.error`)
// are reported once through that path, never twice.

import * as Sentry from "@sentry/nextjs";
import { buildSentryInitOptions } from "@/lib/observability/sentry-options";

export async function register(): Promise<void> {
  const options = buildSentryInitOptions({
    dsn: process.env.SENTRY_DSN,
    release: process.env.SENTRY_RELEASE,
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA,
    environment: process.env.SENTRY_ENVIRONMENT,
    nodeEnv: process.env.NODE_ENV
  });

  if (options) {
    // Explicit (server defaults do not include it): identical consecutive
    // events collapse into one issue.
    Sentry.init({ ...options, integrations: [Sentry.dedupeIntegration()] });
  }
}

export const onRequestError = Sentry.captureRequestError;
