import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Server-side crypto for the multi-sig proposal sign-in flow. A user proves
// control of a wallet by signing a short-lived, server-issued nonce with CIP-30
// `signData`; on success we mint an HMAC-signed session token (stored in an
// httpOnly cookie). No passwords, no user table — the wallet key is the identity.
//
// This module is intentionally free of Next.js / request plumbing so it can be
// unit-tested in isolation. Cookie reading/writing lives in the route handlers.

const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export const PROPOSAL_SESSION_COOKIE = "pw_proposal_session";

// Stable dev fallback so local development works without configuration. In
// production a real secret is mandatory — a predictable secret would let anyone
// forge sessions.
const DEV_FALLBACK_SECRET = "permission-wallet-dev-proposal-secret";

function getAuthSecret(): string {
  const secret = process.env.PROPOSAL_AUTH_SECRET?.trim();
  if (secret && secret.length > 0) {
    return secret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "PROPOSAL_AUTH_SECRET must be set in production to sign proposal sessions."
    );
  }

  return DEV_FALLBACK_SECRET;
}

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decode<T>(encoded: string): T | null {
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

function sign(payload: string): string {
  return createHmac("sha256", getAuthSecret()).update(payload).digest("base64url");
}

// Constant-time comparison that tolerates differing lengths without throwing.
function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

function makeToken(payload: object): string {
  const body = encode(payload);
  return `${body}.${sign(body)}`;
}

function readToken<T>(token: string): T | null {
  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }
  const [body, signature] = parts;
  if (!safeEquals(signature, sign(body))) {
    return null;
  }
  return decode<T>(body);
}

type NoncePayload = {
  kind: "nonce";
  address: string;
  nonce: string;
  exp: number;
};

type SessionPayload = {
  kind: "session";
  paymentKeyHash: string;
  address: string;
  exp: number;
};

export type ProposalSession = {
  paymentKeyHash: string;
  address: string;
};

// Issues a signed, single-purpose nonce bound to the requesting address. The
// client signs this exact string with `signData`; the binding to `address`
// prevents replaying a signature gathered for a different account.
export function issueNonce(address: string): string {
  const payload: NoncePayload = {
    kind: "nonce",
    address,
    nonce: randomBytes(24).toString("base64url"),
    exp: nowMs() + NONCE_TTL_MS
  };
  return makeToken(payload);
}

export function verifyNonce(
  token: string,
  address: string
): { ok: true } | { ok: false; error: string } {
  const payload = readToken<NoncePayload>(token);
  if (!payload || payload.kind !== "nonce") {
    return { ok: false, error: "Malformed or tampered sign-in nonce." };
  }
  if (payload.address !== address) {
    return { ok: false, error: "Sign-in nonce was issued for a different address." };
  }
  if (payload.exp < nowMs()) {
    return { ok: false, error: "Sign-in nonce expired. Request a new one." };
  }
  return { ok: true };
}

export function issueSessionCookieValue(session: ProposalSession): string {
  const payload: SessionPayload = {
    kind: "session",
    paymentKeyHash: session.paymentKeyHash,
    address: session.address,
    exp: nowMs() + SESSION_TTL_MS
  };
  return makeToken(payload);
}

export function verifySessionCookieValue(value: string | undefined | null): ProposalSession | null {
  if (!value) {
    return null;
  }
  const payload = readToken<SessionPayload>(value);
  if (!payload || payload.kind !== "session") {
    return null;
  }
  if (payload.exp < nowMs()) {
    return null;
  }
  return { paymentKeyHash: payload.paymentKeyHash, address: payload.address };
}

export function sessionCookieMaxAgeSeconds(): number {
  return Math.floor(SESSION_TTL_MS / 1000);
}

// Isolated so the time source is explicit; route code and tests both go through
// the same path.
function nowMs(): number {
  return Date.now();
}
