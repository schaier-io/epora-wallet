export type RateLimitResult = { ok: boolean; retryAfterSeconds: number };

export type RateLimitRow = { requestCount: number; expiresAt: Date };

// Pure interpretation of the row returned by PostgreSQL's atomic upsert. Kept
// here so boundary behavior remains unit-testable without constructing Prisma.
export function resultFromRateLimitRow(
  row: RateLimitRow,
  limit: number,
  nowMs: number
): RateLimitResult {
  return {
    ok: row.requestCount <= limit,
    retryAfterSeconds:
      row.requestCount <= limit
        ? 0
        : Math.max(1, Math.ceil((row.expiresAt.getTime() - nowMs) / 1000))
  };
}

// Header-trust switch. Defaults to trusting proxy headers (the Vercel/managed-
// ingress target, where the platform owns them). Parsing is tolerant so a
// mistyped disable value can't silently fail OPEN: any of false/0/no/off/
// disabled (case-insensitive, trimmed) turns trust off.
function trustProxyHeaders(): boolean {
  const raw = process.env.RATE_LIMIT_TRUST_PROXY_HEADERS?.trim().toLowerCase();
  return !(
    raw === "false" ||
    raw === "0" ||
    raw === "no" ||
    raw === "off" ||
    raw === "disabled"
  );
}

// Number of trusted proxies that append to X-Forwarded-For, or null when unset.
// When set (>=1), the client hop is taken from the RIGHT (parts[len - hops]),
// and X-Forwarded-For becomes authoritative over X-Real-IP, closing the
// spoof hole on deployments whose edge manages XFF but not X-Real-IP (a client
// could otherwise set X-Real-IP freely). Unset keeps the Vercel default:
// X-Real-IP preferred, single rightmost XFF hop as fallback.
function trustedProxyHops(): number | null {
  const raw = process.env.RATE_LIMIT_TRUSTED_PROXY_HOPS?.trim();
  if (!raw) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : null;
}

function realIpHeader(request: Request): string | undefined {
  const value = request.headers.get("x-real-ip")?.trim();
  return value && value.length > 0 ? value : undefined;
}

// The client hop from X-Forwarded-For, counting `hops` proxies in from the
// right. Never the leftmost element unless it IS the client hop: the leftmost
// is the caller's own claim and the classic spoofing vector.
function forwardedHop(request: Request, hops: number): string | undefined {
  const parts = request.headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (!parts || parts.length === 0) {
    return undefined;
  }
  const index = parts.length - hops;
  return index >= 0 ? parts[index] : undefined;
}

// Reduce a forwarding-header value to a bare IP for keying: strip a bracketed
// IPv6 host (`[::1]:443` -> `::1`) and an IPv4 `:port` suffix, so the same
// caller behind a port-appending proxy keys to one bucket.
function normalizeIp(raw: string): string {
  const value = raw.trim();
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    if (end !== -1) {
      return value.slice(1, end);
    }
  }
  const firstColon = value.indexOf(":");
  // Exactly one colon AND a dot => IPv4:port; drop the port. (IPv6 has 2+
  // colons and is left intact.)
  if (firstColon !== -1 && firstColon === value.lastIndexOf(":") && value.includes(".")) {
    return value.slice(0, firstColon);
  }
  return value;
}

// Syntactic IP check, not a full validator, it only has to stop arbitrary
// attacker-minted strings from minting distinct rate-limit keys; anything
// non-IP-shaped collapses into the shared "unknown" bucket. Accepts dotted-quad
// IPv4 (octets <= 255) and IPv6 including IPv4-mapped (`::ffff:1.2.3.4`).
function isIpShaped(value: string): boolean {
  if (value.length === 0 || value.length > 45) {
    return false;
  }
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = ipv4.exec(value);
  if (match) {
    return match.slice(1).every((octet) => Number(octet) <= 255);
  }
  return value.includes(":") && /^[0-9a-f:.]+$/i.test(value);
}

// Best-effort caller identity from proxy headers. Falls back to a shared
// "unknown" bucket when no trustworthy value is present (fail-closed-ish:
// unidentified callers share one budget rather than getting a free pass each).
//
// TRUST MODEL: these headers are only meaningful when a trusted proxy/edge
// (Vercel, an ingress nginx, Cloudflare) strips or overwrites what the client
// sent: on a directly-exposed deployment a client can mint its own values to
// rotate keys and evade this floor. Configure per deployment:
//   - RATE_LIMIT_TRUST_PROXY_HEADERS=false, directly-exposed: ignore both
//     headers, every caller shares the "unknown" budget (fail-closed).
//   - RATE_LIMIT_TRUSTED_PROXY_HOPS=N, where N proxies append X-Forwarded-For; the
//     client hop is counted N in from the right and XFF is the ONLY trusted
//     source. Set this on any non-Vercel proxy chain so a spoofed X-Real-IP is
//     ignored and multi-proxy chains don't collapse every caller into one
//     bucket. If XFF is missing/too short for N hops the key falls back to
//     "unknown" (fail-closed); it never falls back to X-Real-IP, which is
//     untrusted on a hops-configured deployment (an attacker could send a
//     short XFF to force the key onto a header they control).
//   - Unset (default), Vercel/managed target: X-Real-IP preferred (platform-
//     set), single rightmost XFF hop as fallback.
// Only IP-shaped values become keys, so header junk can't mint distinct buckets.
export function clientKey(request: Request, scope: string): string {
  if (!trustProxyHeaders()) {
    return `${scope}:unknown`;
  }
  const hops = trustedProxyHops();
  // hops set => XFF is authoritative and X-Real-IP is NOT trusted, so no
  // fallback to it; unset => X-Real-IP preferred with rightmost XFF as fallback.
  const candidate =
    hops !== null
      ? forwardedHop(request, hops)
      : realIpHeader(request) ?? forwardedHop(request, 1);
  const ip = candidate && isIpShaped(normalizeIp(candidate)) ? normalizeIp(candidate) : "unknown";
  return `${scope}:${ip}`;
}
