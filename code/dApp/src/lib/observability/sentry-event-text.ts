// Pure text collectors for Sentry events, shared by the event hygiene
// pipeline (sentry-scrub.ts) and the extension noise filter
// (extension-noise-filter.ts). No SDK import, no environment access.

import type { SentryEventLike } from "./sentry-scrub";

export function eventMessageText(message: SentryEventLike["message"]): string | undefined {
  if (typeof message === "string") {
    return message;
  }
  return message?.formatted;
}

/** Collect message-like strings from the event message and exception values/types. */
export function collectEventMessagesWithoutBreadcrumbs(event: SentryEventLike): string[] {
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
  return messages;
}
