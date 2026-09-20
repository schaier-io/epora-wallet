// Pure filter for browser-extension noise in Sentry events. No SDK import, no
// environment access. Wired as an early return in `scrubSentryEvent`
// (lib/observability/sentry-scrub.ts), next to the routine wallet rejection
// drop: an injected wallet extension failing is not an application failure and
// must not page a maintainer (issue #534, traced in #533).
//
// Three layers, most general first:
//   1+2. A frame counts as extension code when its filename carries an
//      extension scheme (`chrome-extension://`, `moz-extension://`, ...) or a
//      known injected-script basename (`inpage.js`, `contentScript.js`, ...;
//      injection strips the scheme, so this catches events like the #533
//      `app:///scripts/inpage.js` one). The event is dropped when every
//      filename-bearing frame (event-level stacktrace and exception values)
//      counts as extension code.
//   3. No usable frames: fall back to a curated message list, matched against
//      the event message and the exception values and types (never
//      breadcrumbs: an app error that merely logged one of these phrases is
//      still an app error).
//
// Accepted limit: an extension that injects a script under an arbitrary
// filename and throws without keeping the scheme is indistinguishable from app
// code by URL alone. Layers 1 and 3 bound the miss; add new naming conventions
// to the lists as they show up in the issue stream. Worker/ANR-style stacks
// on `event.threads` are deliberately not read: such events fail open into
// the message layer, so they are kept, never falsely dropped.
//
// Events with mixed stacks (any app frame) stay reported: they may carry an
// actionable app-side symptom.

import {
  collectEventMessagesWithoutBreadcrumbs
} from "./sentry-event-text";
import type { SentryEventLike } from "./sentry-scrub";

// Any vendor's extension scheme: `extension://`, `chrome-extension://`,
// `moz-extension://`, `safari-web-extension://`, `edge-extension://`, ...
const EXTENSION_SCHEME_PATTERN = /^(?:[a-z-]+-)?extension:/i;

// Known injected-script basenames. Full-basename match, JavaScript endings
// only, so our own TypeScript sources (`wallet-provider.tsx`,
// `lib/wallet/injection.ts`) can never match. The `[\w.-]*` tail allows any
// suffix (`inpage.min.js`, `content-script-1234.js`), which means a
// hypothetical app chunk named `injected-something.js` would be dropped too;
// no such file exists in this repo, and new conventions land here only when
// they show up in the issue stream.
const INJECTED_SCRIPT_BASENAME_PATTERN =
  /(?:^|[/\\])(?:inpage|injected|content[-_ ]?scripts?)[\w.-]*\.[cm]?js$/i;

// Extension-internal failure phrasings observed in the wild. Used only when
// the event carries no filename-bearing frame.
const KNOWN_EXTENSION_NOISE_MESSAGES: readonly RegExp[] = [
  /failed to connect to metamask/i,
  /metamask extension not found/i,
  /extension context invalidated/i
];

function collectExceptionFilenames(event: SentryEventLike): string[] {
  const values = event.exception?.values ?? [];
  const frameLists = [
    ...(event.stacktrace?.frames ?? []),
    ...values.flatMap((entry) => entry?.stacktrace?.frames ?? [])
  ];
  const filenames: string[] = [];
  for (const frame of frameLists) {
    if (typeof frame?.filename === "string" && frame.filename.length > 0) {
      filenames.push(frame.filename);
    }
  }
  return filenames;
}

/** Does this frame filename identify extension code rather than app code? */
export function isExtensionFrameFilename(filename: string): boolean {
  const clean = filename.split(/[?#]/, 1)[0];
  return EXTENSION_SCHEME_PATTERN.test(clean) || INJECTED_SCRIPT_BASENAME_PATTERN.test(clean);
}

/**
 * Is this event extension noise rather than an application failure? True when
 * every filename-bearing frame (event-level stacktrace and exception values)
 * points at extension code, or (only when there are no such frames) the
 * event's message text matches a known extension-internal failure phrase.
 */
export function isBrowserExtensionNoise(event: SentryEventLike): boolean {
  const filenames = collectExceptionFilenames(event);
  const allFramesExtension = filenames.length > 0 && filenames.every(isExtensionFrameFilename);
  if (allFramesExtension) {
    return true;
  }
  if (filenames.length > 0) {
    // Mixed stack: at least one frame is app code, so the event may be
    // actionable. The message list must not override that.
    return false;
  }
  return collectEventMessagesWithoutBreadcrumbs(event).some((message) =>
    KNOWN_EXTENSION_NOISE_MESSAGES.some((pattern) => pattern.test(message))
  );
}
