import "server-only";

export { clientKey, type RateLimitResult } from "./rate-limit-core";
export { consumePostgresRateLimit as rateLimit } from "./rate-limit-store";
