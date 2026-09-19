import { withSentryConfig } from "@sentry/nextjs";
import createNextIntlPlugin from "next-intl/plugin";

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Do NOT add `experimental.optimizePackageImports: ["lucide-react"]` here:
  // under Turbopack dev it explodes memory to ~80GB and OOM-crashes the machine.
  // lucide-react tree-shakes fine without it, and the production build never
  // relied on it.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  }
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Sentry build steps (release creation, source-map upload) run ONLY when an
// auth token is present, i.e. in CI or on the server. Everything else about
// the integration (runtime capture, scrubbing) is independent of this wrapper
// and stays inert without the DSN env vars (see src/instrumentation*.ts).
// Credentials never appear in this file: SENTRY_AUTH_TOKEN / SENTRY_ORG /
// SENTRY_PROJECT are read from the environment. See docs/RUNBOOK.md.
const sentryRelease =
  process.env.SENTRY_RELEASE ??
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA;

function buildConfig() {
  const base = withNextIntl(nextConfig);
  if (!process.env.SENTRY_AUTH_TOKEN) {
    return base;
  }
  // Inlining the release id at build time gives the browser bundle the same
  // release identifier the server uses (client code cannot read
  // VERCEL_GIT_COMMIT_SHA at runtime).
  const withReleaseId = sentryRelease
    ? { ...base, env: { NEXT_PUBLIC_SENTRY_RELEASE: sentryRelease } }
    : base;
  return withSentryConfig(withReleaseId, {
    authToken: process.env.SENTRY_AUTH_TOKEN,
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    release: sentryRelease,
    // Keep the build log quiet about steps that concern only the tracker.
    sourcemaps: {
      // Uploaded maps are deleted from the build output: the server keeps
      // serving them, but the public bundle does not ship them.
      deleteSourcemapsAfterUpload: true
    }
  });
}

export default buildConfig();
