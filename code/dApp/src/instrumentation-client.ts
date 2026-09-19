// Next.js client instrumentation entry (runs once per browser session, before
// hydration). The SDK loads through a DSN-gated dynamic import: a static
// import would ship Sentry in every page bundle even in credential-free
// builds, where it must never load or execute. Session replay is deliberately
// NOT enabled, and performance tracing stays off (see issue #388 scope).

import { buildSentryInitOptions } from "@/lib/observability/sentry-options";

const options = buildSentryInitOptions({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
  commitSha: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
  nodeEnv: process.env.NODE_ENV
});

// Exported so tests can await initialization deterministically; nothing else
// consumes it. Resolves immediately when no DSN is configured.
export const sentryInit: Promise<void> = options
  ? import("@sentry/nextjs").then((Sentry) => {
      // The browser default set already includes the dedupe integration; naming it
      // here keeps server and browser behavior visibly identical.
      Sentry.init({ ...options, integrations: [Sentry.dedupeIntegration()] });
    })
  : Promise.resolve();
