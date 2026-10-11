// Pure filter for skipped-view-transition noise in Sentry events. No SDK
// import, no environment access. Wired as an early return in
// `scrubSentryEvent` (lib/observability/sentry-scrub.ts).
//
// The browser skips a view transition when the tab goes hidden (or the
// viewport resizes) mid-transition and rejects its promises with an
// `InvalidStateError`. Nothing breaks: the DOM update still applies, only the
// animation is skipped. React's `<ViewTransition>` already treats these as
// benign, but it matches exact message strings, and Chrome 154 appends a
// detail (". Document hidden") that misses the match. React also chains
// `transition.finished.finally(...)` without a catch, so the rejection
// surfaces as an unhandled rejection (Sentry EPORA-WALLET-K).
//
// Matched against the event message and exception values only (never
// breadcrumbs). The prefixes mirror the messages React's own skip list uses.

import { collectEventMessagesWithoutBreadcrumbs } from "./sentry-event-text";
import type { SentryEventLike } from "./sentry-scrub";

const SKIPPED_VIEW_TRANSITION_PATTERN =
  /^(?:InvalidStateError: )?(?:Transition was aborted because of invalid state|Skipping view transition because|View transition was skipped because)/;

/** Is this event a browser-skipped view transition rather than an app failure? */
export function isSkippedViewTransition(event: SentryEventLike): boolean {
  return collectEventMessagesWithoutBreadcrumbs(event).some((message) =>
    SKIPPED_VIEW_TRANSITION_PATTERN.test(message)
  );
}
