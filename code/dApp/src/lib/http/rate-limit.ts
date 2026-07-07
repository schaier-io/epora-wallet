import "server-only";

// Server-only facade: the implementation lives in rate-limit-core.ts (no
// "server-only" import) so node:test can exercise the limiter and the
// clientKey trust logic directly — same split as proposals/store-logic.
export { rateLimit, clientKey, type RateLimitResult } from "./rate-limit-core";
