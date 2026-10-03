// Pure resolver for Sentry init options. Reads nothing from `process.env`
// itself: every input is passed in, so the gate is unit-testable. The init
// files (src/instrumentation.ts, src/instrumentation-client.ts) supply the
// runtime values and add SDK-only pieces (integrations).
//
// Without a DSN the resolver returns `undefined` and the caller skips
// `Sentry.init` entirely: local development and any environment without
// credentials run with zero Sentry code paths active.

import {
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  type SentryEventLike
} from "./sentry-scrub";

export interface SentryEnvInput {
  /** NEXT_PUBLIC_SENTRY_DSN (browser) or SENTRY_DSN (server/edge). */
  dsn?: string;
  /** SENTRY_RELEASE (server) or NEXT_PUBLIC_SENTRY_RELEASE (browser). */
  release?: string;
  /** VERCEL_GIT_COMMIT_SHA (server) or NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA (browser). */
  commitSha?: string;
  /** SENTRY_ENVIRONMENT or NEXT_PUBLIC_SENTRY_ENVIRONMENT. */
  environment?: string;
  /** NODE_ENV, used as the environment fallback. */
  nodeEnv?: string;
}

export interface SentryInitOptions {
  dsn: string;
  release?: string;
  environment: string;
  tracesSampleRate: 0;
  dataCollection: typeof V10_DATA_COLLECTION;
  // Generic so the SDK's concrete `ErrorEvent` / `Breadcrumb` types flow
  // through unchanged when the options object is spread into `Sentry.init`.
  beforeSend: <Event extends SentryEventLike>(event: Event) => Event | null;
  beforeBreadcrumb: <Breadcrumb extends SentryBreadcrumbInput>(
    breadcrumb: Breadcrumb
  ) => Breadcrumb;
}

// Structural mirror of the SDK breadcrumb type, kept local so this module
// stays importable without loading the Sentry SDK.
type SentryBreadcrumbInput = Parameters<typeof scrubSentryBreadcrumb>[0];

export const DEFAULT_SENTRY_ENVIRONMENT = "production";

// SDK v11 collects user info, cookies, HTTP bodies, and query data by default.
// This baseline keeps the v10 default (`sendDefaultPii` off), as the v11
// migration guide gives it. The scrubber stays as the second line of defense.
const PII_HEADER_DENYLIST = ["forwarded", "-ip", "remote-", "via", "-user"];
export const V10_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: {
    request: { deny: PII_HEADER_DENYLIST },
    response: { deny: PII_HEADER_DENYLIST }
  },
  httpBodies: [],
  urlQueryParams: { deny: PII_HEADER_DENYLIST },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  graphQL: { document: false, variables: false }
};

/**
 * Resolve init options from environment inputs. Returns `undefined` when no
 * DSN is configured, which disables Sentry completely.
 *
 * `tracesSampleRate: 0` pins the decision from the issue scope: error
 * monitoring only, no performance tracing. Session replay is absent by design
 * (no replay integration is ever added).
 */
export function buildSentryInitOptions(
  input: SentryEnvInput
): SentryInitOptions | undefined {
  const dsn = input.dsn?.trim();
  if (!dsn) {
    return undefined;
  }

  const release = firstNonEmpty(input.release, input.commitSha);
  const environment = firstNonEmpty(input.environment, input.nodeEnv)
    ?? DEFAULT_SENTRY_ENVIRONMENT;

  return {
    dsn,
    ...(release ? { release } : {}),
    environment,
    tracesSampleRate: 0,
    dataCollection: V10_DATA_COLLECTION,
    beforeSend: (event) => scrubSentryEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubSentryBreadcrumb(breadcrumb)
  };
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return undefined;
}
