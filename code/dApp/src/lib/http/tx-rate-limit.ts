/**
 * Caps for the `/api/v1/tx/*` build routes, read from the environment so a
 * quota problem is a configuration change and not a deploy.
 *
 * The build count uses two limiters, because one cannot do both jobs:
 *
 * - The **per-client** cap bounds one caller.
 * - The **deployment-wide** cap bounds every caller together. Blockfrost rate
 *   limits by source IP, and the whole deployment is one IP to it, so a flood
 *   spread across many callers would otherwise sail past the per-client cap
 *   and spend the shared quota.
 *
 * Exact wallet inputs use a second pair of weighted buckets. A build with six
 * wallet inputs still counts as one build, but it consumes six input-work
 * units. This preserves valid multi-input shapes while bounding provider work.
 *
 * ## Where the defaults come from
 *
 * Blockfrost publishes 10 requests per second, with a burst of 500 that cools
 * off at 10 per second (https://blockfrost.dev/start-building). The sustained
 * ceiling for the entire deployment is therefore 600 requests per minute.
 *
 * MEASURED on 2026-08-31, counting real HTTP requests to blockfrost.io during
 * one build against preprod:
 *
 *   lock-funds                              10 requests
 *   deploy-reference                        62 requests
 *   mint                                    63 requests
 *   stt-spend (use)                         70 requests
 *   stt-spend, with `sttSpendReference`     24 requests
 *
 * A build is not one provider request. It is tens, because resolving the
 * shared STT reference script scans the reference store, and that store held
 * 12 reference scripts on the measured day. Each costs two requests, and the
 * builder runs its prepare step twice to re-estimate execution budgets.
 *
 * So, at 70 requests for the most expensive build:
 *
 *   per-client: 5 builds/min x 70 =   350 requests/min, ~5.8/s, inside 10/s
 *   deployment: 25 builds/min x 70 = 1750 requests/min, ~29/s
 *
 * The deployment default is a **ban shield**, not a quota guarantee. Blockfrost
 * answers 402 over the daily limit and 418 for flooding after repeated 402/429,
 * and a ban takes the browser UI down with the API. 25 per minute is the point
 * at which we shed load rather than risk that. It is above the strictly
 * sustainable figure, which at 70 requests per build is only 8 builds per
 * minute for the whole deployment: too low to serve more than one active user.
 *
 * The number worth changing is not this cap. It is the 70.
 */

export type TxRateLimits = {
  perClientRequests: number;
  perClientWindowMs: number;
  globalRequests: number;
  globalWindowMs: number;
  perClientWalletInputs: number;
  globalWalletInputs: number;
};

export const TX_RATE_LIMIT_DEFAULTS: TxRateLimits = {
  perClientRequests: 5,
  perClientWindowMs: 60_000,
  globalRequests: 25,
  globalWindowMs: 60_000,
  // Each exact wallet input costs two Blockfrost reads per prepare pass, and a
  // script build prepares twice. Keep this work in a separate bucket so a valid
  // transaction with more than five inputs is not rejected by the five-build
  // caller cap. The default global window budgets 120 refs, or about 480 such
  // reads. One transaction may exceed the per-client budget and exhaust that
  // caller's window. The deployment budget still rejects work above 120 refs.
  // This protects the provider without an on-chain input cap.
  perClientWalletInputs: 40,
  globalWalletInputs: 120
};

/** The key every caller shares, so the deployment-wide bucket is one bucket. */
export const TX_GLOBAL_RATE_LIMIT_KEY = "tx-build:deployment";

export const TX_MAX_REQUEST_BYTES = 32 * 1024;

/**
 * Read one positive-integer override. An unset, blank, malformed or
 * out-of-range value falls back to the default rather than throwing: a typo in
 * a deployment's environment must not take the build routes down, and it must
 * never widen a cap by accident.
 */
export function readPositiveIntEnv(
  raw: string | undefined,
  fallback: number,
  maximum: number
): number {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return fallback;
  }
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    return fallback;
  }
  return parsed;
}

const MAX_REQUESTS = 1_000_000;
const MAX_WINDOW_MS = 24 * 60 * 60 * 1000;

export function readTxRateLimits(
  env: Record<string, string | undefined> = process.env
): TxRateLimits {
  return {
    perClientRequests: readPositiveIntEnv(
      env.TX_RATE_LIMIT_REQUESTS,
      TX_RATE_LIMIT_DEFAULTS.perClientRequests,
      MAX_REQUESTS
    ),
    perClientWindowMs: readPositiveIntEnv(
      env.TX_RATE_LIMIT_WINDOW_MS,
      TX_RATE_LIMIT_DEFAULTS.perClientWindowMs,
      MAX_WINDOW_MS
    ),
    globalRequests: readPositiveIntEnv(
      env.TX_RATE_LIMIT_GLOBAL_REQUESTS,
      TX_RATE_LIMIT_DEFAULTS.globalRequests,
      MAX_REQUESTS
    ),
    globalWindowMs: readPositiveIntEnv(
      env.TX_RATE_LIMIT_GLOBAL_WINDOW_MS,
      TX_RATE_LIMIT_DEFAULTS.globalWindowMs,
      MAX_WINDOW_MS
    ),
    perClientWalletInputs: readPositiveIntEnv(
      env.TX_RATE_LIMIT_WALLET_INPUTS,
      TX_RATE_LIMIT_DEFAULTS.perClientWalletInputs,
      MAX_REQUESTS
    ),
    globalWalletInputs: readPositiveIntEnv(
      env.TX_RATE_LIMIT_GLOBAL_WALLET_INPUTS,
      TX_RATE_LIMIT_DEFAULTS.globalWalletInputs,
      MAX_REQUESTS
    )
  };
}
