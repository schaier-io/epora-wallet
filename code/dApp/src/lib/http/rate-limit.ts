import "server-only";

// Fixed-window, in-memory rate limiter for unauthenticated API routes.
//
// LIMITATION: state lives in this process's memory, so the limit is enforced
// per server instance. For a single long-lived Node instance this is an
// effective abuse/quota-drain floor. A multi-instance or serverless deployment
// needs a shared store (e.g. Redis/Upstash) to enforce a global limit; treat
// this as the floor, not the ceiling.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let nextSweepAt = 0;

export type RateLimitResult = { ok: boolean; retryAfterSeconds: number };

// Drop expired buckets so the map can't grow unbounded under many distinct keys.
function sweepExpired(now: number): void {
  if (now < nextSweepAt) {
    return;
  }
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) {
      buckets.delete(key);
    }
  }
  nextSweepAt = now + 60_000;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweepExpired(now);

  const existing = buckets.get(key);
  if (!existing || now >= existing.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }

  return { ok: true, retryAfterSeconds: 0 };
}

// Best-effort caller identity from proxy headers. Falls back to a shared
// "unknown" bucket when no forwarding header is present (fail-closed-ish:
// unidentified callers share one budget rather than getting a free pass each).
export function clientKey(request: Request, scope: string): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown";
  return `${scope}:${ip}`;
}
