// Pure Sentry event hygiene. No SDK import, no environment access, so the same
// logic runs in the browser init, the server/edge init, and the tests. The
// SDK-facing entry points are `scrubSentryEvent` (wired as `beforeSend`) and
// `scrubSentryBreadcrumb` (wired as `beforeBreadcrumb`).
//
// Redaction is deliberately over-eager: a 64-hex word that is not a transaction
// hash becomes "[REDACTED]" too. Losing a hex string from an error report is
// recoverable; leaking a wallet address is not.

import { isWalletRejectionMessage } from "@/lib/utils/wallet-rejection-patterns";

const REDACTED = "[REDACTED]";

// CIP-19 bech32 identifiers: payment addresses (`addr1…`, `addr_test1…`) and
// stake/reward addresses (`stake1…`, `stake_test1…`).
const CARDANO_ADDRESS_PATTERN = /\b(?:addr|stake)(?:_test)?1[0-9a-z]*/gi;

// Cardano transaction hashes: 64 hexadecimal characters.
const TX_HASH_PATTERN = /\b[0-9a-f]{64}\b/gi;

// Header names whose values must never leave the process. Headers are stored
// case-insensitively by the SDK, so comparisons normalize first.
const REDACTED_REQUEST_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-stt-sync-secret"
]);

// Breadcrumb `data` keys that carry a request or response body (a signed
// transaction payload, a fetch body). Everything else about the breadcrumb
// (URL, method, status) stays visible.
const PAYLOAD_BEARING_BREADCRUMB_KEYS = new Set(["body", "payload", "response"]);

/** Replace wallet addresses and transaction hashes in free text. */
export function redactSensitiveText(text: string): string {
  return text
    .replace(CARDANO_ADDRESS_PATTERN, REDACTED)
    .replace(TX_HASH_PATTERN, REDACTED);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Deeply redact wallet addresses / tx hashes inside every string of a value. */
function deepRedactStrings(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") {
    return redactSensitiveText(value);
  }
  if (!isRecord(value) || seen.has(value)) {
    return value;
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((entry) => deepRedactStrings(entry, seen));
    }
    const redacted: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      redacted[key] = deepRedactStrings(entry, seen);
    }
    return redacted;
  } finally {
    seen.delete(value);
  }
}

/** Minimal structural shape of a Sentry `Breadcrumb` (see @sentry/core types). */
export interface SentryBreadcrumbLike {
  message?: string;
  category?: string;
  type?: string;
  data?: Record<string, unknown>;
}

/** Minimal structural shape of a Sentry `Event` (see @sentry/core types). */
export interface SentryEventLike {
  type?: string;
  message?: string | { formatted?: string };
  exception?: {
    values?: Array<{ value?: string; type?: string }>;
  };
  request?: unknown;
  user?: unknown;
  tags?: Record<string, unknown>;
  fingerprint?: unknown;
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  breadcrumbs?: SentryBreadcrumbLike[];
}

function eventMessageText(message: SentryEventLike["message"]): string | undefined {
  if (typeof message === "string") {
    return message;
  }
  return message?.formatted;
}

/** Collect every message-like string an event carries, for rejection matching. */
export function collectEventMessages(event: SentryEventLike): string[] {
  const messages: string[] = [];
  const main = eventMessageText(event.message);
  if (main) {
    messages.push(main);
  }
  for (const entry of event.exception?.values ?? []) {
    if (entry?.value) {
      messages.push(entry.value);
    }
    if (entry?.type) {
      messages.push(entry.type);
    }
  }
  for (const breadcrumb of event.breadcrumbs ?? []) {
    if (breadcrumb.message) {
      messages.push(breadcrumb.message);
    }
  }
  return messages;
}

/**
 * Is this event one of the routine wallet rejections (the user declined or
 * cancelled a signature prompt)? Patterns are shared with the transaction-error
 * explainer: see `lib/utils/wallet-rejection-patterns.ts`.
 */
export function isRoutineWalletRejection(event: SentryEventLike): boolean {
  return collectEventMessages(event).some(isWalletRejectionMessage);
}

/** Drop a network breadcrumb's body-shaped fields and redact the rest. */
export function scrubSentryBreadcrumb<Breadcrumb extends SentryBreadcrumbLike>(
  breadcrumb: Breadcrumb
): Breadcrumb {
  const scrubbed: Breadcrumb = { ...breadcrumb };
  if (typeof scrubbed.message === "string") {
    scrubbed.message = redactSensitiveText(scrubbed.message);
  }
  if (isRecord(scrubbed.data)) {
    const data = { ...scrubbed.data };
    for (const key of Object.keys(data)) {
      if (PAYLOAD_BEARING_BREADCRUMB_KEYS.has(key.toLowerCase())) {
        delete data[key];
      }
    }
    scrubbed.data = deepRedactStrings(data) as Record<string, unknown>;
  }
  return scrubbed;
}

/**
 * The `beforeSend` filter. Returns `null` for routine wallet rejections (the
 * user declined to sign, so there is nothing to diagnose); otherwise strips
 * secrets (cookies, authorization headers), request/response payloads, and
 * wallet addresses / transaction hashes from messages, extras, and contexts.
 * Deduplication itself is left to the SDK (`dedupeIntegration`, wired in the
 * init files) and to the single-report design: API routes report through
 * `logger.error` and swallow the error, so `onRequestError` never sees it too.
 */
export function scrubSentryEvent<T extends SentryEventLike>(event: T): T | null {
  if (isRoutineWalletRejection(event)) {
    return null;
  }

  const request = event.request;
  if (isRecord(request)) {
    delete request.cookies;
    const headers = request.headers;
    if (isRecord(headers) && !Array.isArray(headers)) {
      for (const key of Object.keys(headers)) {
        if (REDACTED_REQUEST_HEADERS.has(key.toLowerCase())) {
          delete headers[key];
        }
      }
    }
    // The request body is a transaction payload or caller input; it never
    // belongs in an error report.
    delete request.data;
    // Defense in depth: URLs and query strings can carry wallet addresses as
    // path or query segments, and the SDK does not redact those itself.
    if (typeof request.url === "string") {
      request.url = redactSensitiveText(request.url);
    }
    if (request.query !== undefined && request.query !== null) {
      request.query = deepRedactStrings(request.query);
    }
  }
  if (event.user !== undefined && event.user !== null) {
    event.user = deepRedactStrings(event.user);
  }
  if (isRecord(event.tags)) {
    event.tags = deepRedactStrings(event.tags) as Record<string, unknown>;
  }
  if (Array.isArray(event.fingerprint)) {
    event.fingerprint = event.fingerprint.map((entry: unknown) =>
      typeof entry === "string" ? redactSensitiveText(entry) : entry
    );
  }

  const main = eventMessageText(event.message);
  if (main) {
    const redacted = redactSensitiveText(main);
    if (typeof event.message === "string") {
      event.message = redacted;
    } else {
      event.message = { ...event.message, formatted: redacted };
    }
  }

  for (const entry of event.exception?.values ?? []) {
    if (typeof entry?.value === "string") {
      entry.value = redactSensitiveText(entry.value);
    }
    if (typeof entry?.type === "string") {
      entry.type = redactSensitiveText(entry.type);
    }
  }

  if (event.extra) {
    event.extra = deepRedactStrings(event.extra) as Record<string, unknown>;
  }
  if (event.contexts) {
    event.contexts = deepRedactStrings(event.contexts) as Record<string, unknown>;
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map(scrubSentryBreadcrumb);
  }

  return event;
}
